import { openDatabase } from './database.mjs';
import { createApp } from './app.mjs';
import { expireReservations } from './reservations.mjs';
const db = openDatabase();
expireReservations(db);
const expiryTimer=setInterval(()=>{try{expireReservations(db);}catch(error){console.error('Reservation expiry failed:',error);}},30_000);
expiryTimer.unref();
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || 'localhost';
const authAttemptsPerMinute = Number(process.env.AUTH_ATTEMPTS_PER_MINUTE) || undefined;
const server = createApp(db, { authAttemptsPerMinute }).listen(port,host,() => console.log(`Rematerial is ready at http://${host}:${port}`));
server.on('error', error => { console.error(error.message); db.close(); process.exitCode=1; });
function shutdown() { clearInterval(expiryTimer);server.close(() => { db.close(); process.exit(0); }); }
process.on('SIGINT',shutdown); process.on('SIGTERM',shutdown);
