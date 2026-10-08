import { ArrowLeft, Minus, Plus } from 'lucide-react';
import { useContext, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Auth, api, type User } from './lib';
import { rememberMaterial } from './recent-materials';
import { ReservationOutcome, type FulfillmentFields } from './fulfillment';
import { FavoriteButton, BottomSheet, MaterialPhoto, formatQuantity, formatDue, credits as creditsLabel } from './ui';
import { hubConfig } from './hub-config';

type Material = {id:number;owner_id:number;name:string;display_code:string;category:string;custom_category_name:string|null;zone:string;stock_quantity:number;available_quantity:number;unit:string;dimensions_spec:string;dimensions_not_applicable:number;condition:string;color:string;notes:string;reference_url:string|null;status:string;is_demo:number;is_favorite?:boolean;photos:{id:number;url:string}[]};
export type Reservation = FulfillmentFields & {id:number;material_id:number;name:string;display_code:string;image:string;status:string;reserved_quantity:number;unit_snapshot:string;expires_at:string;zone:string};
const label=(s:string)=>s==='reserved'?'Active':s==='unavailable'?'Needs Review':s==='closed'?'Removed / Archived':s==='issue_reported'?'Issue Reported':s.charAt(0).toUpperCase()+s.slice(1).replaceAll('_',' ');
const deadline=(s:string)=>new Date(s).toLocaleString('en',{dateStyle:'medium',timeStyle:'long'});
function ErrorBox({error}:{error:string}){return error?<div className="notice" role="alert">{error}</div>:null;}
function LoginRequired(){return <div className="empty-state"><h1>Log in to continue</h1><p>Please log in to reserve materials and view your reservations.</p><Link className="button dark" to={`/login?next=${encodeURIComponent(location.pathname)}`}>Log in</Link></div>;}
/** "Due tomorrow, 3:36 PM (23h left)", refreshed every 30 seconds. */
export function Due({expires}:{expires:string}){const[now,setNow]=useState(Date.now());useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);return <time dateTime={expires}>{formatDue(expires,now)}</time>;}
export function Remaining({expires}:{expires:string}){const[now,setNow]=useState(Date.now());useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);const mins=Math.max(0,Math.ceil((Date.parse(expires)-now)/60000));return <span>{mins?`${Math.floor(mins/60)}h ${mins%60}m remaining`:'Reservation deadline reached'}</span>;}

export function MaterialDetail(){
  const{id}=useParams();const{user,loading,setUser}=useContext(Auth);const navigate=useNavigate();
  const[m,setM]=useState<Material|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[quantity,setQuantity]=useState(1),[reload,setReload]=useState(0),[sheet,setSheet]=useState(false);
  const lock=useRef(false);const requestKey=useRef('');
  useEffect(()=>{if(m&&m.id===Number(id)&&!loading)rememberMaterial(m.id,user?.id??null);},[m?.id,id,loading,user?.id]);
  useEffect(()=>{setM(null);setError('');setQuantity(1);setSheet(false);requestKey.current='';},[id]);
  useEffect(()=>{let active=true;const load=()=>api<{material:Material}>(`/materials/${id}`).then(r=>{if(active)setM(r.material);}).catch(e=>{if(active)setError(e.message);});void load();const timer=setInterval(load,15000);window.addEventListener('focus',load);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',load);};},[id,reload]);
  useEffect(()=>{if(m&&quantity>Math.max(1,m.available_quantity))setQuantity(Math.max(1,m.available_quantity));},[m?.available_quantity]);
  async function reserve(){if(lock.current||!m||m.is_demo)return;lock.current=true;setBusy(true);setError('');const storageKey=`reservation-request:${user?.id}:${m.id}:${quantity}`;
    try{requestKey.current=sessionStorage.getItem(storageKey)||crypto.randomUUID();sessionStorage.setItem(storageKey,requestKey.current);
      const r=await api<{reservation:Reservation}>(`/materials/${m.id}/reserve`,{quantity,request_key:requestKey.current});
      sessionStorage.removeItem(storageKey);navigate(`/reservations/${r.reservation.id}`);api<{user:User}>('/auth/me').then(a=>setUser(a.user)).catch(()=>{});
    }catch(e){setError((e as Error).message);api<{material:Material}>(`/materials/${m.id}`).then(r=>setM(r.material)).catch(()=>{});}finally{lock.current=false;setBusy(false);}}
  if(!m)return <div className="flow-page"><h1>Material Details</h1><ErrorBox error={error}/>{error?<button className="button outline" onClick={()=>{setError('');setReload(v=>v+1);}}>Retry</button>:<p className="loading">Loading material…</p>}</div>;
  const own=m.owner_id===user?.id;const credits=user?.available??0;
  const canReserve=!m.is_demo&&!own&&m.status==='available'&&m.available_quantity>=1;
  return <div className="flow-page material-detail"><Link className="back-link" to="/materials"><ArrowLeft size={18}/>Explore materials</Link>
    <div className="detail-gallery"><div className="material-gallery" tabIndex={0} aria-label="Material photos">{m.photos.map((p,i)=><img key={p.id} src={p.url} alt={`${m.name} — photo ${i+1}`}/>)}</div>{!own&&<FavoriteButton className="gallery-favorite" materialId={m.id} initial={!!m.is_favorite}/>}</div>{m.photos.length>1&&<p className="field-help">Swipe horizontally to view all {m.photos.length} photos.</p>}
    <div className="detail-status"><span className="status-pill">{m.is_demo?'Sample material':label(m.status)}</span>{!m.is_demo&&<span>1 credit per reservation</span>}</div><h1 className="detail-title">{m.name}</h1>
    <h2 className="spec-heading">Material information</h2><dl className="specs"><div><dt>Category</dt><dd>{m.category}{m.custom_category_name?` (${m.custom_category_name})`:''}</dd></div><div><dt>{m.is_demo?'Example quantity':'Available'}</dt><dd>{formatQuantity(m.is_demo?m.stock_quantity:m.available_quantity,m.unit)}</dd></div><div><dt>Dimensions</dt><dd>{m.dimensions_not_applicable?'Not applicable':m.dimensions_spec}</dd></div><div><dt>Condition</dt><dd>{m.condition}</dd></div><div><dt>Color</dt><dd>{m.color}</dd></div></dl>
    <h2 className="spec-heading">{m.is_demo?'Sample reference':'Pickup details'}</h2><dl className="specs"><div><dt>Hub</dt><dd>{hubConfig.location||hubConfig.name}</dd></div><div><dt>Zone</dt><dd>{m.zone}</dd></div></dl>
    {m.notes.trim()&&<><h2>Notes</h2><p className="notes-text">{m.notes}</p></>}{m.reference_url&&/^https?:\/\//i.test(m.reference_url)&&<a className="text-link spaced" href={m.reference_url} target="_blank" rel="noreferrer">Purchase / reference link ↗</a>}
    {!!m.is_demo&&<p className="notice">Sample material for browsing only. This is not real Hub inventory and cannot be reserved. No credits are charged.</p>}
    {(!sheet||!canReserve)&&<ErrorBox error={error}/>}
    <div className="detail-actions">{m.is_demo?<><p>Sample only, not available for pickup</p><Link className="button outline full" to="/">Back to Explore</Link></>
      :own?<p className="own-note">This is your material</p>
      :!user?<Link className="button dark full" to={`/login?next=${encodeURIComponent(`/materials/${id}`)}`}>Log in to reserve</Link>
      :canReserve?<button className="button dark full" onClick={()=>{setError('');setSheet(true);}}>Reserve</button>
      :<button className="button dark full" disabled>{m.status==='reserved'?'Fully reserved':'Not available'}</button>}</div>
    {canReserve&&<BottomSheet open={sheet} onClose={()=>setSheet(false)} title="Reserve">
      <div className="quantity-stepper" role="group" aria-label="Quantity"><button type="button" aria-label="Fewer" disabled={busy||quantity<=1} onClick={()=>setQuantity(q=>q-1)}><Minus size={18}/></button><output aria-live="polite">{formatQuantity(quantity,m.unit)}</output><button type="button" aria-label="More" disabled={busy||quantity>=m.available_quantity} onClick={()=>setQuantity(q=>q+1)}><Plus size={18}/></button></div>
      <p className="sheet-line"><b>Costs 1 credit</b><span>You’ll have {creditsLabel(Math.max(0,credits-1))} left</span></p><p className="sheet-line muted">Free cancellation before the deadline.</p>
      {credits<1&&<p className="notice">You need 1 available credit to reserve. Share a material to earn one.</p>}<ErrorBox error={error}/>
      <button className="button dark full" disabled={busy||credits<1} onClick={reserve}>{busy?'Reserving…':'Confirm reservation'}</button></BottomSheet>}
  </div>;
}

export function MyReservations({detail=false}:{detail?:boolean}){
  const{id}=useParams();const{user,loading,setUser}=useContext(Auth);const[rows,setRows]=useState<Reservation[]>([]),[error,setError]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState<number|null>(null),[revision,setRevision]=useState(0);const lock=useRef(false);const[confirming,setConfirming]=useState(false);
  useEffect(()=>{if(!user)return;let active=true;setReady(false);setError('');const load=()=>api<{reservations?:Reservation[];reservation?:Reservation}>(detail?`/reservations/${id}`:'/me/reservations').then(r=>{if(active){setRows(r.reservations||[r.reservation!]);setReady(true);}}).catch(e=>{if(active){setError(e.message);setReady(true);}});void load();const timer=setInterval(load,10000);window.addEventListener('focus',load);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',load);};},[user?.id,detail,id,revision]);
  async function cancel(r:Reservation){if(lock.current)return;lock.current=true;setBusy(r.id);setError('');try{const result=await api<{reservation:Reservation}>(`/reservations/${r.id}/cancel`,{});setRows(rows=>rows.map(row=>row.id===r.id?result.reservation:row));const a=await api<{user:User}>('/auth/me');setUser(a.user);}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(null);}}
  if(loading)return <p className="loading">Loading your account…</p>;if(!user)return <LoginRequired/>;
  const ended=(r:Reservation)=>r.status==='cancelled'?'Cancelled. 1 credit released.':r.status==='expired'?'Expired. 1 credit spent; the material was released.':'';
  if(detail){const r=rows[0];
    return <div className="flow-page reservation-detail"><Link className="back-link" to="/me/reservations"><ArrowLeft size={18}/>My reservations</Link><ErrorBox error={error}/>{error&&!r&&<button className="button outline" onClick={()=>setRevision(n=>n+1)}>Retry</button>}
      {!ready?<p className="loading">Loading reservation…</p>:r&&<>
        <section className="reservation-hero"><span className={`status-badge status-${r.status}`}>{label(r.status)}</span><p>Your material code</p><strong className="reservation-code">{r.display_code}</strong>{r.status==='reserved'&&<p className="due-line"><Due expires={r.expires_at}/></p>}<small>Find this code on the label at the Hub.</small></section>
        <Link className="active-task" to={`/materials/${r.material_id}`}><img src={r.image} alt={r.name}/><div><b>{r.name}</b><small>{formatQuantity(r.reserved_quantity,r.unit_snapshot)}, {r.zone}</small></div></Link>
        {ended(r)&&<p className="field-help">{ended(r)}</p>}<ReservationOutcome r={r}/>
        {r.status==='reserved'&&<><button type="button" className="text-link cancel-link" disabled={busy!==null} onClick={()=>setConfirming(true)}>Cancel reservation</button>
          <BottomSheet open={confirming} onClose={()=>setConfirming(false)} title="Cancel this reservation?"><p className="sheet-line muted">Your 1 credit is released and the material goes back on the shelf.</p><div className="action-stack"><button className="button dark full" disabled={busy!==null} onClick={async()=>{await cancel(r);setConfirming(false);}}>{busy===r.id?'Cancelling…':'Cancel reservation'}</button><button className="button outline full" onClick={()=>setConfirming(false)}>Keep it</button></div></BottomSheet>
          <div className="flow-action"><Link className="button dark full" to={`/reservations/${r.id}/guide`}>Start pickup</Link></div></>}
      </>}</div>;}
  return <div className="flow-page"><Link className="back-link" to="/me"><ArrowLeft size={18}/>Profile</Link><div className="page-heading"><h1>My Reservations</h1></div><ErrorBox error={error}/>{error&&<button className="button outline" onClick={()=>setRevision(n=>n+1)}>Retry</button>}{!ready?<p className="loading">Loading reservations…</p>:!rows.length&&!error?<div className="empty-state"><h2>No reservations yet</h2><p>Your active, cancelled and expired reservations will appear here.</p><Link to="/" className="button dark">Explore materials</Link></div>:<div className="reservation-list">{rows.map(r=><article key={r.id} className="reservation-card"><Link className="active-task" to={`/reservations/${r.id}`}><img src={r.image} alt={r.name}/><div><span>{r.display_code}</span><b>{r.name}</b><small>{formatQuantity(r.reserved_quantity,r.unit_snapshot)}, {r.zone}</small></div></Link><span className={`status-badge status-${r.status}`}>{label(r.status)}</span>{r.status==='reserved'?<p className="due-line"><Due expires={r.expires_at}/></p>:<p className="field-help">{ended(r)}</p>}<ReservationOutcome r={r}/></article>)}</div>}</div>;
}
