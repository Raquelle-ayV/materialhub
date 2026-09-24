import express from 'express';
import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { transaction, projectRoot } from './database.mjs';
import { installDepositRoutes } from './deposits.mjs';
import { installReservationRoutes, expireReservations } from './reservations.mjs';
import { installFulfillmentRoutes } from './fulfillment.mjs';
import { installReviewRoutes } from './reviews.mjs';
const scrypt = promisify(scryptCallback);
const digest = value => createHash('sha256').update(value).digest('hex');
const ttl = 7 * 24 * 60 * 60 * 1000;
const cookieOptions = { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.COOKIE_SECURE === 'true' };
function tokenFrom(req) {
  return (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('rm_session='))?.slice(11) || '';
}
function publicUser(db, id) {
  const u = db.prepare('SELECT u.id,u.username,u.language,a.balance,a.held FROM users u JOIN credit_accounts a ON a.user_id=u.id WHERE u.id=?').get(id);
  return u ? { ...u, available: u.balance-u.held } : null;
}
function newSession(db, userId) {
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token),userId,Date.now()+ttl);
  return token;
}
function readCredentials(req) {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  return { username, password, key: username.toLowerCase() };
}
export function createApp(db, options = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Stable message keys accompany English API errors for render-time localization.
  app.use((req,res,next) => {
    const json=res.json.bind(res);
    res.json=body=>json(body?.error ? {...body,error_key:body.error_key || body.error} : body);
    next();
  });
  app.use((req,res,next) => {
    res.set('X-Content-Type-Options','nosniff');
    res.set('Referrer-Policy','same-origin');
    if (req.path.startsWith('/api')) res.set('Cache-Control','no-store');
    if (['POST','PATCH','PUT','DELETE'].includes(req.method)) {
      const allowed = new Set([process.env.FRONTEND_ORIGIN || 'http://localhost:5173', 'http://localhost:3001']);
      if (req.headers.origin && !allowed.has(req.headers.origin)) return res.status(403).json({error:'This request origin is not allowed.'});
      if (req.path !== '/api/uploads' && !req.is('application/json')) return res.status(415).json({error:'Please send a JSON request.'});
    }
    next();
  });
  app.use(express.json({limit:'16kb'}));
  const attempts = new Map();
  function rateLimit(req,res,next) {
    const key = req.ip;
    const now = Date.now();
    for (const [ip,item] of attempts) if (item.until < now) attempts.delete(ip);
    const item = attempts.get(key) || { count:0, until:now+60_000 };
    item.count++; attempts.set(key,item);
    if (item.count > 30) return res.status(429).json({error:'Too many attempts. Please try again in a minute.'});
    next();
  }
  app.use('/api', (req,res,next) => {
    expireReservations(db);
    const session = db.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?').get(digest(tokenFrom(req)),Date.now());
    req.user = session ? publicUser(db,session.user_id) : null;
    next();
  });
  function requireUser(req,res,next) { if (!req.user) return res.status(401).json({error:'Please log in to continue.'}); next(); }
  installDepositRoutes(app, db, requireUser, options);
  installReservationRoutes(app, db, requireUser);
  installFulfillmentRoutes(app, db, requireUser);
  installReviewRoutes(app, db, requireUser);
  app.get('/api/health', (req,res) => res.json({status:'ok',database:db.prepare('SELECT 1 AS ok').get().ok === 1}));
  app.get('/api/auth/me', (req,res) => res.json({user:req.user}));
  app.post('/api/me/preferences', requireUser, (req,res) => {
    if (!['en','zh-CN'].includes(req.body?.language)) return res.status(400).json({error:'Please choose a supported language.'});
    db.prepare('UPDATE users SET language=? WHERE id=?').run(req.body.language,req.user.id);
    res.json({user:publicUser(db,req.user.id)});
  });
  app.post('/api/auth/register', rateLimit, async (req,res) => {
    const {username,password,key} = readCredentials(req);
    if (req.body?.language !== undefined && !['en','zh-CN'].includes(req.body.language)) return res.status(400).json({error:'Please choose a supported language.'});
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) return res.status(400).json({error:'Use 3–24 letters, numbers or underscores for your username.'});
    if (password.length < 8 || password.length > 128) return res.status(400).json({error:'Use a password with 8–128 characters.'});
    if (db.prepare('SELECT id FROM users WHERE username_key=?').get(key)) return res.status(409).json({error:'This username is already taken. Please log in or choose another.'});
    const salt = randomBytes(16).toString('hex');
    const hash = (await scrypt(password,salt,64)).toString('hex');
    try {
      const result = transaction(db,() => {
        const id = Number(db.prepare('INSERT INTO users(username,username_key,password_hash) VALUES (?,?,?)').run(username,key,`${salt}:${hash}`).lastInsertRowid);
        db.prepare('UPDATE users SET language=? WHERE id=?').run(req.body.language || 'en',id);
        db.prepare('INSERT INTO credit_accounts VALUES (?,2,0)').run(id);
        db.prepare("INSERT INTO credit_entries(user_id,type,balance_delta,held_delta,balance_after,held_after,operation_key) VALUES (?,'registration_reward',2,0,2,0,?)").run(id,`registration:${id}`);
        const token = newSession(db,id);
        return {id,token};
      });
      res.cookie('rm_session',result.token,{...cookieOptions,maxAge:ttl});
      res.status(201).json({user:publicUser(db,result.id),message:'Welcome! You earned 2 credits.'});
    } catch (error) {
      if (String(error.message).includes('users.username_key')) return res.status(409).json({error:'This username is already taken. Please log in or choose another.'});
      throw error;
    }
  });
  app.post('/api/auth/login', rateLimit, async (req,res) => {
    const {password,key} = readCredentials(req);
    if (password.length > 128 || key.length > 24) return res.status(400).json({error:'Invalid username or password.'});
    const record = db.prepare('SELECT id,password_hash FROM users WHERE username_key=?').get(key);
    const [salt,stored] = (record?.password_hash.includes(':') ? record.password_hash : 'invalid:').split(':');
    const derived = await scrypt(password,salt,64);
    const expected = stored ? Buffer.from(stored,'hex') : Buffer.alloc(64);
    if (!record || derived.length !== expected.length || !timingSafeEqual(derived,expected)) return res.status(401).json({error:'Invalid username or password.'});
    const token = transaction(db, () => {
      db.prepare('DELETE FROM sessions WHERE token_hash=? OR expires_at<=?').run(digest(tokenFrom(req)),Date.now());
      return newSession(db,record.id);
    });
    res.cookie('rm_session',token,{...cookieOptions,maxAge:ttl});
    res.json({user:publicUser(db,record.id)});
  });
  app.post('/api/auth/logout', (req,res) => {
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(tokenFrom(req)));
    res.clearCookie('rm_session',cookieOptions); res.json({ok:true});
  });
  app.get('/api/me/credits', requireUser, (req,res) => {
    const entries = db.prepare('SELECT id,type,balance_delta,held_delta,balance_after,held_after,created_at FROM credit_entries WHERE user_id=? ORDER BY id DESC').all(req.user.id);
    res.json({account:req.user,entries});
  });
  app.get('/api/me/activities',requireUser,(req,res) => res.json({activities:db.prepare('SELECT id,type,created_at,read_at FROM activities WHERE recipient_id=? ORDER BY id DESC').all(req.user.id)}));
  app.get('/api/categories',(req,res) => res.json({categories:db.prepare('SELECT id,name FROM categories ORDER BY sort_order').all()}));
  const materialSelect = `SELECT m.*,c.name AS category,z.name AS zone, (SELECT CASE WHEN x.storage_key LIKE '/placeholders/%' THEN x.storage_key ELSE '/api/media/' || x.id END FROM material_photos p JOIN media x ON x.id=p.media_id WHERE p.material_id=m.id AND p.kind='material' ORDER BY p.sort_order LIMIT 1) AS image FROM materials m JOIN categories c ON c.id=m.category_id JOIN zones z ON z.id=m.zone_id`;
  app.get('/api/materials',(req,res) => {
    const q = String(req.query.q || '').slice(0,100);
    const category = Number(req.query.category) || 0;
    const zone=Number(req.query.zone)||0, condition=String(req.query.condition||'').slice(0,80), color=String(req.query.color||'').slice(0,80), minimum=Math.max(0,Number(req.query.min_quantity)||0);
    const availability=['available','reserved','all'].includes(req.query.availability)?req.query.availability:'available';
    res.json({materials:db.prepare(`${materialSelect} WHERE m.status IN ('available','reserved') AND (?='all' OR m.status=?) AND (?=0 OR m.category_id=?) AND (m.name LIKE ? OR m.notes LIKE ? OR c.name LIKE ? OR m.custom_category_name LIKE ? OR m.display_code LIKE ?) AND (?=0 OR m.zone_id=?) AND (?='' OR m.condition=?) AND (?='' OR m.color LIKE ?) AND m.stock_quantity>=? ORDER BY m.deposited_at DESC,m.id DESC`).all(availability,availability,category,category,...Array(5).fill(`%${q}%`),zone,zone,condition,condition,color,`%${color}%`,minimum).map(m=>({...m,available_quantity:m.status==='available'?m.stock_quantity:0}))});
  });
  app.get('/api/materials/:id',(req,res) => {
    const material = db.prepare(`${materialSelect} WHERE m.id=?`).get(Number(req.params.id) || -1);
    if (!material || (material.status === 'ready_for_drop_off' && material.owner_id !== req.user?.id)) return res.status(404).json({error:'Material not found.'});
    const photos=db.prepare("SELECT x.id,CASE WHEN x.storage_key LIKE '/placeholders/%' THEN x.storage_key ELSE '/api/media/'||x.id END AS url FROM material_photos p JOIN media x ON x.id=p.media_id WHERE p.material_id=? AND p.kind='material' ORDER BY p.sort_order,p.id").all(material.id);
    res.json({material:{...material,photos,available_quantity:material.status==='available'?material.stock_quantity:0}});
  });
  app.use('/api',(req,res) => res.status(404).json({error:'This feature is not available yet.'}));
  const dist = resolve(projectRoot,'dist');
  if (existsSync(dist)) { app.use(express.static(dist)); app.get('/{*path}',(req,res) => res.sendFile(resolve(dist,'index.html'))); }
  app.use((error,req,res,next) => {
    if (error.type === 'entity.parse.failed') return res.status(400).json({error:'Invalid JSON request.'});
    if (error.type === 'entity.too.large') return res.status(413).json({error:req.path==='/api/uploads'?'Each photo must be 10MB or smaller.':'This request is too large.'});
    if (error.status && error.status < 500) return res.status(error.status).json({error:error.message,error_key:error.messageKey || error.message,error_params:error.params});
    console.error(error);
    res.status(500).json({error:'Something went wrong. Please try again.'});
  });
  return app;
}
