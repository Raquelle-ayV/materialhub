import React, { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, ArrowRight, ArrowLeft, Search, Plus, UserRound, Compass, Leaf, Coins, MapPin, ChevronRight, Package, Clock3, LogOut, Eye, EyeOff, Heart, Bell, Layers3, Check, AlertCircle, X, SlidersHorizontal } from 'lucide-react';
import './styles.css';
import './mobile.css';
import './app-ui.css';
import './ui.css';
import { MaterialPhoto, FavoriteButton, BottomSheet, formatQuantity } from './ui';
import { useI18n, messageOf, validateForm, type Message } from './i18n';

import { Auth, api, type User } from './lib';
import { recentMaterialIds } from './recent-materials';
import { MaterialDetail, MyReservations } from './reservations';
import { FulfillmentPage } from './fulfillment';
import { ProfileReviewNotice, ReviewPage } from './reviews';
import { AddInformation, DepositPage, DepositTasks, MyPosts, ShareMaterial, HubGuidePage, DropOffEntry } from './deposits';

type Material = { id:number; owner_id:number; available_quantity:number; display_code:string; name:string; category:string; zone:string; stock_quantity:number; unit:string; dimensions_spec:string; color:string; condition:string; notes:string; image:string; is_demo:number; status:string; is_favorite?:boolean };
type Entry = { id:number; type:string; balance_delta:number; held_delta:number; created_at:string };
function Notice({children}:{children:ReactNode}) { const {t,msg,language}=useI18n();  return <div className="notice" role="alert"><AlertCircle size={17}/><span>{children}</span></div>; }
function App() { const {t,msg,language}=useI18n(); 
  const [user,setUser] = useState<User|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<Message>('');
  const location = useLocation();
  const mainPage = ["/", "/materials", "/deposit", "/saved", "/me"].includes(location.pathname.replace(/\/+$/, "")||"/");
  useEffect(() => { api<{user:User|null}>('/auth/me').then(r=>setUser(r.user)).catch(e=>setError(messageOf(e))).finally(()=>setLoading(false)); },[]);
  useEffect(()=>{ window.scrollTo(0,0); let active=true;const refresh=()=>api<{user:User|null}>('/auth/me').then(r=>{if(active)setUser(r.user);}).catch(()=>{});void refresh();const timer=setInterval(refresh,15000);window.addEventListener('focus',refresh);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);}; },[location.pathname]);
  return <Auth.Provider value={{user,loading,setUser}}><div className={`app-shell ${mainPage?"main-page":"deep-page"}`}>
    <main>{error && <Notice>{msg(error)} {t("Make sure the local server is running.")}</Notice>}<Routes>
      <Route path="/" element={<Explore/>}/><Route path="/materials" element={<Explore results/>}/><Route path="/materials/:id" element={<MaterialDetail/>}/>
      <Route path="/materials/:id/reserve" element={<ReserveRedirect/>}/><Route path="/reservations/:id" element={<MyReservations detail/>}/><Route path="/reservations/:id/:stage" element={<FulfillmentPage/>}/><Route path="/login" element={<AuthPage/>}/><Route path="/register" element={<AuthPage register/>}/>
      <Route path="/deposit" element={<ShareMaterial/>}/><Route path="/hub" element={<HubGuidePage/>}/><Route path="/deposit/drop-off" element={<DropOffEntry/>}/><Route path="/recently-viewed" element={<Explore history/>}/><Route path="/deposit/new" element={<AddInformation/>}/><Route path="/deposits/:id/edit" element={<AddInformation/>}/><Route path="/deposits/:id/:stage?" element={<DepositPage/>}/>
      <Route path="/me/settings" element={<Navigate to="/me" replace/>}/><Route path="/me" element={<Profile/>}/><Route path="/me/credits" element={<Credits/>}/>
      <Route path="/me/posts" element={<MyPosts/>}/><Route path="/me/issues/:id" element={<ReviewPage/>}/>
      <Route path="/me/reservations" element={<MyReservations/>}/>
      <Route path="/saved" element={<Saved/>}/><Route path="/me/favorites" element={<Navigate to="/saved" replace/>}/>
      <Route path="/me/activity" element={<Activity/>}/>
      <Route path="*" element={<Coming title={t("Page not found")} text={t("This page isn’t here. Let’s find something useful.")}/>}/>
    </Routes></main>
    {mainPage && <nav className="bottom-nav" aria-label={t("Main navigation")}><NavLink to="/" end className={location.pathname==='/materials'?'active':undefined}><Compass size={22}/><span>{t("Explore")}</span></NavLink><NavLink to="/deposit"><span className="nav-plus"><Plus size={21}/></span><span>{t("Share")}</span></NavLink><NavLink to="/saved"><Heart size={22}/><span>{t("Saved")}</span></NavLink><NavLink to="/me"><UserRound size={22}/><span>{t("Profile")}</span></NavLink></nav>}
  </div></Auth.Provider>;
}
function Explore({results=false,history=false}:{results?:boolean;history?:boolean}) { const {t,msg,language}=useI18n(); 
  const [params,setParams] = useSearchParams(); const [revision,setRevision]=useState(0);
  const [query,setQuery] = useState(params.get('q') || '');
  const [materials,setMaterials] = useState<Material[]>([]);
  const [recentState,setRecent] = useState<{owner:number|null;rows:Material[]}>({owner:null,rows:[]});
  const [categories,setCategories] = useState<{id:number;name:string}[]>([]);
  const [error,setError] = useState<Message>(''); const [busy,setBusy] = useState(true);
  const {user,loading}=useContext(Auth);
  const owner=user?.id??null;
  const recent=!loading&&recentState.owner===owner?recentState.rows:[];
  const [filtersOpen,setFiltersOpen]=useState(false);
  const showsUnavailable=['all','reserved'].includes(params.get('availability')||'');
  const filterCount=(params.get('condition')?1:0)+(showsUnavailable?1:0);
  const [draftFilters,setDraftFilters]=useState({condition:'',showUnavailable:false});
  function openFilters(){setDraftFilters({condition:params.get('condition')||'',showUnavailable:showsUnavailable});setFiltersOpen(true);}
  function applyFilters(e:FormEvent){e.preventDefault();const next=new URLSearchParams(params);if(draftFilters.condition)next.set('condition',draftFilters.condition);else next.delete('condition');if(draftFilters.showUnavailable)next.set('availability','all');else next.delete('availability');navigate(`/materials?${next}`);setFiltersOpen(false);}
  const navigate = useNavigate(); const category = params.get('category') || '';
  useEffect(()=>{ api<{categories:{id:number;name:string}[]}>('/categories').then(r=>setCategories(r.categories)).catch(e=>setError(messageOf(e))); },[]);
  useEffect(()=>{ let active=true; setBusy(true); setError(''); api<{materials:Material[]}>(`/materials?${params.toString()}`).then(r=>{if(active)setMaterials(r.materials);}).catch(e=>{if(active)setError(messageOf(e));}).finally(()=>{if(active)setBusy(false);}); return ()=>{active=false;}; },[params,revision,results]);
  useEffect(()=>{const refresh=()=>setRevision(n=>n+1);const timer=setInterval(refresh,15000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};},[]);
  useEffect(()=>setQuery(params.get('q') || ''),[params]);
  useEffect(()=>{
    if(loading||results&&!history)return;
    let active=true;
    // Store IDs only: quantities, photos and availability always come from the API.
    Promise.allSettled(recentMaterialIds(owner).map(id=>api<{material:Material}>(`/materials/${id}`)))
      .then(rows=>{if(active)setRecent({owner,rows:rows.flatMap(row=>row.status==='fulfilled'?[row.value.material]:[])});});
    return()=>{active=false;};
  },[results,history,revision,owner,loading]);
  // Keep every copy of a material (Recently viewed + Recommended) showing the same heart.
  function favorite(id:number,saved:boolean){const mark=(rows:Material[])=>rows.map(m=>m.id===id?{...m,is_favorite:saved}:m);setMaterials(mark);setRecent(r=>({...r,rows:mark(r.rows)}));}
  function search(e:FormEvent) { e.preventDefault(); const next=new URLSearchParams(params); if(query.trim())next.set('q',query.trim()); else next.delete('q'); navigate(`/materials?${next}`); }
  function filter(value:string) { const next=new URLSearchParams(params); if(value)next.set('category',value); else next.delete('category'); if(results)setParams(next); else navigate(`/materials?${next}`); }
  if(history)return <div className="narrow-page"><Link className="back-link" to="/"><ArrowLeft size={18}/>Explore</Link><div className="page-heading"><h1>Recently viewed</h1></div>{recent.length?<div className="material-grid">{recent.map(m=><MaterialCard key={m.id} material={m}/>)}</div>:<p>No recently viewed materials yet.</p>}</div>;
  return <>
    <div className="page-heading explore-heading"><h1>Explore materials</h1><Link className="account-pill" to={user?'/me/credits':'/login'}><Coins size={16}/>{user?user.available+(user.available===1?' credit':' credits'):'Log in'}</Link></div>
    <form className="search-bar" onSubmit={search} onClick={e=>e.currentTarget.querySelector('input')?.focus()}><button type="submit" aria-label="Submit search"><Search size={21}/></button><input aria-label="Search materials" placeholder="Search materials" enterKeyHint="search" value={query} onChange={e=>setQuery(e.target.value)}/></form>
    <div className="discovery-filters"><div className="category-strip" aria-label="Material categories"><button aria-pressed={!category} className={!category?'selected':''} onClick={()=>filter('')}>All materials</button>{categories.map(c=><button aria-pressed={category===String(c.id)} className={category===String(c.id)?'selected':''} onClick={()=>filter(String(c.id))} key={c.id}>{t(c.name)}</button>)}</div>
    <button className="filter-trigger" onClick={openFilters}><SlidersHorizontal size={15}/>More filters{filterCount>0&&<span className="filter-count" aria-label={`${filterCount} active`}>{filterCount}</span>}</button></div>
    <BottomSheet open={filtersOpen} onClose={()=>setFiltersOpen(false)} title="Filters"><form className="filter-form" onSubmit={applyFilters}><label>Condition<select aria-label="Condition" value={draftFilters.condition} onChange={e=>setDraftFilters({...draftFilters,condition:e.target.value})}><option value="">All conditions</option>{['New','Like new','Good','Used'].map(v=><option key={v}>{v}</option>)}</select></label><label className="switch-row"><span>Show unavailable<small>Include materials that are fully reserved</small></span><input type="checkbox" role="switch" checked={draftFilters.showUnavailable} onChange={e=>setDraftFilters({...draftFilters,showUnavailable:e.target.checked})}/></label><div className="filter-actions"><button type="button" className="button outline" onClick={()=>setDraftFilters({condition:'',showUnavailable:false})}>Clear filters</button><button className="button dark" type="submit">Apply filters</button></div></form></BottomSheet>
    <section className="materials-section recommended-materials" aria-labelledby="recommended-heading"><div className="section-title"><h2 id="recommended-heading">{results?'Materials':'New on the shelf'}</h2></div>{error&&<Notice>{msg(error)} <button onClick={()=>setRevision(n=>n+1)}>Retry</button></Notice>}{busy?<div className="loading">{t("Finding materials…")}</div>:materials.length?<div className="material-grid">{materials.map(m=><MaterialCard key={m.id} material={m} onFavorite={saved=>favorite(m.id,saved)}/>)}</div>:!error&&<div className="empty-state"><Search/><h3>{t("No materials found")}</h3><p>{t("Try a different name or category.")}</p><button className="button outline" onClick={()=>{setQuery('');navigate('/materials');}}>{t("Clear search")}</button></div>}</section>
    {!results&&recent.length>0&&<section className="recent-materials" aria-labelledby="recent-heading"><div className="section-title"><h2 id="recent-heading">Recently viewed</h2><Link className="section-next" to="/recently-viewed" aria-label="View all recently viewed materials"><ChevronRight size={20}/></Link></div><div className="recent-rail" tabIndex={0} aria-label="Recently viewed materials" onKeyDown={e=>{if(e.target===e.currentTarget&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();e.currentTarget.scrollBy({left:e.key==='ArrowRight'?148:-148,behavior:'smooth'});}}}>{recent.slice(0,8).map(m=><MaterialCard key={m.id} material={m} compact onFavorite={saved=>favorite(m.id,saved)}/>)}</div></section>}

  </>;
}
function materialStatus(status:string){return ({available:'Available',reserved:'Reserved',unavailable:'Needs review',closed:'Removed',collected:'Collected',ready_for_drop_off:'Not yet available'} as Record<string,string>)[status]||'Unavailable';}
function MaterialCard({material:m,compact=false,onFavorite,saved=false}:{material:Material;compact?:boolean;onFavorite?:(saved:boolean)=>void;saved?:boolean}) {
  const {user}=useContext(Auth);const own=!!user&&m.owner_id===user.id;
  const gone=saved&&(m.status!=='available'||!m.is_demo&&m.available_quantity<1);
  const shown=m.status==='available'&&!m.is_demo?m.available_quantity:m.stock_quantity;
  return <Link to={`/materials/${m.id}`} className={`material-card ${compact?'recent-card':''} ${gone?'unavailable':''}`}><div className="material-image"><MaterialPhoto src={m.image} alt={m.is_demo?m.name+' (sample material)':m.name}/>{own?<span className="yours-tag">Yours</span>:<FavoriteButton materialId={m.id} initial={!!m.is_favorite} onChange={onFavorite}/>}</div><h3>{m.name}</h3><p className="material-status">{gone?'No longer available':formatQuantity(shown,m.unit)}</p>{!gone&&m.status!=='available'&&<span className="card-state">{materialStatus(m.status)}</span>}</Link>;
}
function AuthPage({register=false}:{register?:boolean}) { const {t,msg,language}=useI18n(); 
  const {user,setUser,loading} = useContext(Auth); const navigate=useNavigate(); const [params]=useSearchParams();
  const [username,setUsername]=useState(''); const [password,setPassword]=useState(''); const [visible,setVisible]=useState(false); const [error,setError]=useState<Message>(''); const [busy,setBusy]=useState(false);
  useEffect(()=>{setError('');setPassword('');},[register]);
  async function submit(e:FormEvent) { e.preventDefault(); const validation=validateForm(e.currentTarget as HTMLFormElement); if(validation){setError(validation);return;} if(busy)return; setBusy(true);setError(''); try { const r=await api<{user:User}>(register?'/auth/register':'/auth/login',{username,password,...(register?{language}:{})}); setUser(r.user); const dest=params.get('next'); navigate(dest?.startsWith('/')&&!dest.startsWith('//')?dest:'/me',{replace:true}); } catch(e){setError(messageOf(e));}finally{setBusy(false);} }
  if(loading)return <div className="loading">{t("Loading your account…")}</div>;
  if(user)return <Coming title={`You’re logged in, ${user.username}.`} text={t("Your account is ready to go.")} link="/me" label={t("Go to Profile")}/>;
  return <div className="auth-layout"><Link className="back-link" to="/"><ArrowLeft size={18}/>Explore materials</Link><div className="auth-intro"><div className="eyebrow">{t("WELCOME TO THE CIRCLE")}</div><h1>{register?<>{t("A little sharing.")}<br/><em>{t("A lot of possibility.")}</em></>:<>{t("Good to")}<br/><em>{t("see you again.")}</em></>}</h1><p>{t("Someone’s leftovers.")}<br/>{t("Your next great idea.")}</p><div className="auth-leaf"><Leaf size={78} strokeWidth={1}/></div></div><section className="auth-card"><span className="soft-icon"><UserRound/></span><h2>{register?t("Create an account"):t("Welcome back")}</h2><p>{register?t("Join your campus material circle."):t("Log in to pick up where you left off.")}</p>{register&&<div className="reward-note"><Coins size={19}/><span><b>{t("2 credits, on us.")}</b> {t("A one-time welcome gift.")}</span></div>}<form noValidate onSubmit={submit}><label htmlFor="username">{t("Username")}</label><input id="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]+" value={username} onChange={e=>setUsername(e.target.value)} placeholder={t("Your username")}/>{register&&<small>{t("3–24 letters, numbers or underscores.")}</small>}<label htmlFor="password">{t("Password")}</label><div className="password-field"><input id="password" type={visible?'text':'password'} autoComplete={register?'new-password':'current-password'} required minLength={register?8:1} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} placeholder={register?t("At least 8 characters"):t("Your password")}/><button type="button" aria-label={visible?t("Hide password"):t("Show password")} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={19}/>:<Eye size={19}/>}</button></div>{error&&<Notice>{msg(error)}</Notice>}<button disabled={busy} className="button dark full" type="submit">{busy?t("Please wait…"):register?t("Create account"):t("Log in")}</button></form><p className="auth-switch">{register?t("Already part of the circle?"):t("New to Re:Material?")} <Link to={`${register?'/login':'/register'}${params.size?`?${params}`:''}`}>{register?t("Log in"):t("Create account")}</Link></p><div className="auth-fineprint">{t("Just a username and password.")}<br/>{t("No email. No phone number.")}</div></section></div>;
}
function Profile() { const {t,msg,language}=useI18n(); 
  const {user,setUser,loading}=useContext(Auth); const [busy,setBusy]=useState(false); const [error,setError]=useState<Message>(''); const navigate=useNavigate();
  if(loading)return <div className="loading">{t("Loading your profile…")}</div>;
  if(!user)return <Guest/>;
  async function logout(){setBusy(true);try{await api('/auth/logout',{});setUser(null);navigate('/login');}catch(e){setError(messageOf(e));}finally{setBusy(false);}}
  return <div className="narrow-page"><div className="page-heading"><h1>{t("Profile")}</h1></div><div className="profile-person"><div className="avatar">{user.username[0].toUpperCase()}</div><div><h2>{user.username}</h2></div></div><div className="balance-card"><div><span>{t("Available credits")}</span><strong>{user.available} {user.available===1?"credit":"credits"}</strong></div><Coins size={26} strokeWidth={1.7}/><div className="balance-bottom"><span>{user.held} {t("held ·")}{" "}{user.balance} {t("total")}</span><Link to="/me/credits">{t("Credit history")}{" "}<ChevronRight size={18}/></Link></div></div><ProfileReviewNotice/><DepositTasks/><div className="profile-links">{[{to:'posts',label:t("My Posts"),icon:<Package/>},{to:'reservations',label:t("My Reservations"),icon:<Clock3/>},{to:'activity',label:t("Activity"),icon:<Bell/>}].map(item=><Link key={item.to} to={`/me/${item.to}`}><span>{item.icon}{item.label}</span><ChevronRight size={18}/></Link>)}</div>{error&&<Notice>{msg(error)}</Notice>}<button disabled={busy} className="logout-button" onClick={logout}><LogOut size={18}/>{busy?t("Logging out…"):t("Log out")}</button></div>;
}
function Saved() { const {t,msg}=useI18n();
  const {user,loading}=useContext(Auth); const [rows,setRows]=useState<Material[]|null>(null); const [error,setError]=useState<Message>('');
  useEffect(()=>{if(!user){setRows(null);return;}let active=true;api<{materials:Material[]}>('/me/favorites').then(r=>{if(active)setRows(r.materials);}).catch(e=>{if(active)setError(messageOf(e));});return()=>{active=false;};},[user?.id]);
  if(loading)return <div className="loading">{t("Loading…")}</div>;
  if(!user)return <div className="empty-state guest"><span className="soft-icon"><Heart size={28}/></span><h1>{t("Saved")}</h1><p>{t("Log in to save materials you like and find them here later.")}</p><Link className="button dark" to="/login?next=/saved">{t("Log in")}</Link><Link className="text-link" to="/register">{t("Create account")}</Link></div>;
  return <div className="narrow-page saved-page"><div className="page-heading"><h1>{t("Saved")}</h1>{rows&&rows.length>0&&<p>{rows.length} {rows.length===1?t("material"):t("materials")}</p>}</div>{error&&<Notice>{msg(error)}</Notice>}{!rows?!error&&<div className="loading">{t("Loading…")}</div>:rows.length?<div className="material-grid">{rows.map(m=><MaterialCard key={m.id} material={m} saved onFavorite={saved=>{if(!saved)setRows(r=>r?.filter(x=>x.id!==m.id)??r);}}/>)}</div>:<div className="empty-state"><span className="soft-icon"><Heart size={26}/></span><h3>{t("Nothing saved yet")}</h3><p>{t("Tap the heart on any material to save it here.")}</p><Link className="button outline" to="/">{t("Explore materials")}<ChevronRight size={18}/></Link></div>}</div>;
}
function ReserveRedirect(){const{id}=useParams();return <Navigate to={`/materials/${id}`} replace/>;}
function Guest(){ const {t,msg,language}=useI18n(); return <div className="empty-state guest"><span className="soft-icon"><UserRound size={28}/></span><h1>Profile</h1><p>{t("Keep track of your materials, pickups and credits.")}<br/>{t("Start with 2 credits when you create an account.")}</p><Link className="button dark" to="/register">{t("Create account")}{" "}</Link><Link className="text-link" to="/login">{t("Already have an account? Log in")}</Link></div>;}
function Credits() { const {t,msg,language}=useI18n(); 
  const {user,loading}=useContext(Auth); const [entries,setEntries]=useState<Entry[]>([]);const [error,setError]=useState<Message>('');
  useEffect(()=>{if(user)api<{entries:Entry[]}>('/me/credits').then(r=>setEntries(r.entries)).catch(e=>setError(messageOf(e)));},[user]);
  if(loading)return <div className="loading">{t("Loading credits…")}</div>;if(!user)return <Guest/>;
  return <div className="narrow-page"><PageHeading title={t("Credit History")}/><div className="credit-summary"><Coins size={32}/><strong>{user.available}</strong><span>{t("available credits")}</span></div><p className="section-description">{user.held} {t("held ·")}{" "}{user.balance} {t("total. Every credit has a story.")}</p>{error&&<Notice>{msg(error)}</Notice>}<div className="ledger">{entries.map(e=><div key={e.id}><span className="soft-icon"><Plus size={19}/></span><div><b>{e.type==='registration_reward'?t("Welcome credits"):e.type==='deposit_reward'?t("Material drop-off"):t(e.type.replaceAll('_',' '))}</b><p>{new Date(e.created_at).toLocaleString(language,{dateStyle:'medium',timeStyle:'short'})}</p></div><strong title={`Held credits change: ${e.held_delta}`}>{e.held_delta!==0?`${e.held_delta>0?'+':''}${e.held_delta} held / `:''}{e.balance_delta>0?'+':''}{e.balance_delta}</strong></div>)}</div></div>;
}
function Activity(){const{user,loading}=useContext(Auth);const[rows,setRows]=useState<{id:number;type:string;created_at:string}[]>([]);const[error,setError]=useState('');useEffect(()=>{if(user)api<{activities:typeof rows}>('/me/activities').then(r=>setRows(r.activities)).catch(e=>setError(e.message));},[user?.id]);if(loading)return <p className="loading">Loading activity...</p>;if(!user)return <Guest/>;return <div className="narrow-page"><PageHeading title="Activity"/>{error&&<Notice>{error}</Notice>}{rows.length?<div className="ledger">{rows.map(r=><div key={r.id}><div><b>{r.type.replaceAll('_',' ')}</b><p>{new Date(r.created_at).toLocaleString('en')}</p></div></div>)}</div>:<p>No activity yet. Material updates will appear here.</p>}</div>;}
function PageHeading({title}:{title:string}){ const {t,msg,language}=useI18n(); return <div className="page-heading"><Link to="/me" className="back-link"><ArrowLeft size={16}/> {t("Profile")}</Link><h1>{title}</h1></div>;}
function EmptyAccount({title,text,icon}:{title:string;text:string;icon:ReactNode}){ const {t,msg,language}=useI18n(); const{user,loading}=useContext(Auth);if(loading)return <div className="loading">{t("Loading…")}</div>;if(!user)return <Guest/>;return <div className="narrow-page"><PageHeading title={title}/><div className="empty-state"><span className="soft-icon">{icon}</span><h3>{t("Nothing here yet")}</h3><p>{text}</p><Link className="button outline" to="/">{t("Explore materials")}{" "}<ChevronRight size={18}/></Link></div></div>;}
function Coming({title,text,link='/',label='Back to Explore'}:{title:string;text:string;link?:string;label?:string}){ const {t,msg,language}=useI18n(); return <div className="empty-state coming"><span className="soft-icon"><Layers3 size={28}/></span><h1>{title}</h1><p>{text}</p><Link className="button dark" to={link}>{t(label)}</Link></div>;}
createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><App/></BrowserRouter></React.StrictMode>);
