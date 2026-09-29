import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useContext, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Auth, api } from './lib';
import { PhotoUpload } from './deposits';

type Photo={id:number;url:string};
export type Issue={id:number;reason:string;reason_label:string;notes:string;status:string;created_at:string;resolution:string|null;resolved_at:string|null;photos:Photo[]};
type Review=Issue&{material_id:number;name:string;display_code:string;stock_quantity:number;unit:string;condition:string;material_notes:string;material_status:string;version:number;placement_photos:Photo[]};
export function IssueDetails({issue:i,actions=true}:{issue:Issue;actions?:boolean}) {
  return <section className="issue-summary"><b>{i.status==='open'?'Needs Review':`Issue resolved — ${i.resolution}`}</b><p>Reported: {i.reason_label||i.reason.replaceAll('_',' ')}</p><p className="notes-text">{i.notes||'No additional description.'}</p><p className="field-help">Reported: <time dateTime={i.created_at}>{new Date(i.created_at).toLocaleString('en',{dateStyle:'medium',timeStyle:'long'})}</time></p><div className="record-thumbnails">{i.photos.map(p=><a key={p.id} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt="Reported problem"/></a>)}</div>{i.status==='open'&&<><p>This material is temporarily hidden from Explore.</p>{actions&&<><Link className="button outline full spaced" to={`/me/issues/${i.id}`}>Review and relist</Link><Link className="text-link spaced" to={`/me/issues/${i.id}?action=remove`}>Remove material</Link></>}</>}{i.resolved_at&&<p className="field-help">Resolved: {new Date(i.resolved_at).toLocaleString('en')}</p>}</section>;
}
export function ActionRequired({count}:{count:number}) {
  return count>0?<aside className="issue-summary" role="status"><b>Action required</b><p>{count} {count===1?'report':'reports'} pending review</p><Link className="text-link spaced" to="/me/posts">Review your materials <ChevronRight size={18}/></Link></aside>:null;
}
export function ProfileReviewNotice(){
  const{user}=useContext(Auth);const[count,setCount]=useState(0),[error,setError]=useState('');
  useEffect(()=>{if(!user)return;let live=true;const load=()=>api<{pending_count:number}>('/me/issues').then(r=>{if(live){setCount(r.pending_count);setError('');}}).catch(e=>{if(live)setError(e.message);});void load();const timer=setInterval(load,10000);window.addEventListener('focus',load);return()=>{live=false;clearInterval(timer);window.removeEventListener('focus',load);};},[user?.id]);
  return <>{error&&<p role="alert">Could not load review reminders: {error}</p>}<ActionRequired count={count}/></>;
}
export function ReviewPage(){
  const{id}=useParams();const{user,loading}=useContext(Auth);
  const[i,setI]=useState<Review|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0),[quantity,setQuantity]=useState(''),[condition,setCondition]=useState(''),[notes,setNotes]=useState(''),[photos,setPhotos]=useState<Photo[]>([]),[checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[removing,setRemoving]=useState(false);
  const lock=useRef(false);
  useEffect(()=>{if(!user)return;let live=true;setI(null);setError('');setChecked(false);setRemoving(false);api<{issue:Review}>(`/me/issues/${id}`).then(r=>{if(live){setI(r.issue);setQuantity(String(r.issue.stock_quantity));setCondition(r.issue.condition);setNotes(r.issue.material_notes);setPhotos(r.issue.placement_photos);}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[id,user?.id,revision]);
  async function resolve(resolution:'relisted'|'removed'){
    if(lock.current||!i)return;lock.current=true;setBusy(true);setError('');
    try{const r=await api<{issue:Review}>(`/me/issues/${id}/resolve`,{resolution,version:i.version,...(resolution==='relisted'?{quantity:Number(quantity),condition,notes,photo_ids:photos.map(p=>p.id),checked_at_hub:checked}:{confirm_remove:true})});setI(r.issue);setRemoving(false);}
    catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
  }
  if(!loading&&!user)return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace/>;
  if(!i)return <div className="flow-page"><Link className="back-link" to="/me/posts"><ArrowLeft size={18}/>My Posts</Link><h1>Review material</h1>{error?<><p role="alert">{error}</p><button className="button outline" onClick={()=>setRevision(n=>n+1)}>Reload report</button></>:<p>Loading report…</p>}</div>;
  return <div className="flow-page"><Link className="back-link" to="/me/posts"><ArrowLeft size={18}/>My Posts</Link><div className="page-heading"><h1>{i.status==='open'?'Review material':'Report resolved'}</h1><p>{i.display_code} · {i.name}</p></div><IssueDetails issue={i} actions={false}/>
    {i.status==='open'&&<><form className="material-form" onSubmit={e=>{e.preventDefault();void resolve('relisted');}}><fieldset disabled={busy||uploading}><h2>Review and relist</h2><p className="field-help">Check the material at the Hub. Enter the total quantity currently available on the shelf, excluding material still held by collectors.</p><label>Available quantity ({i.unit})<input type="number" min={1} max={1000000} step={1} required value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><label>Condition<input required maxLength={80} list="review-conditions" value={condition} onChange={e=>setCondition(e.target.value)}/></label><datalist id="review-conditions">{['New','Like new','Good','Used'].map(c=><option key={c}>{c}</option>)}</datalist><label htmlFor="review-notes">Notes</label><textarea id="review-notes" rows={4} maxLength={4000} value={notes} onChange={e=>setNotes(e.target.value)}/><PhotoUpload label="Reviewed placement photos" max={3} photos={photos} onChange={setPhotos} onBusy={setUploading} disabled={busy}/><p className="field-help">Keep the current placement photos or replace them with 1–3 photos. Earlier photos remain in the material history.</p><label className="return-confirm"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>I have checked this material at the Hub and confirmed these details.</label><button className="button dark full" disabled={busy||uploading||!checked||!photos.length||!quantity||!condition.trim()}>Confirm relist</button></fieldset></form>
      <section className="issue-summary"><h2>Remove material</h2><p>Archive this listing and keep it hidden from Explore. Its records and photos will be retained. This cannot be undone here.</p>{!removing?<button className="button outline full spaced" disabled={busy} onClick={()=>setRemoving(true)}>Remove material</button>:<div role="group" aria-label="Confirm removal" className="action-stack"><b>Remove this material permanently from Explore?</b><button className="button dark full" disabled={busy} onClick={()=>void resolve('removed')}>Yes, remove material</button><button className="button outline full" disabled={busy} onClick={()=>setRemoving(false)}>Keep material</button></div>}</section></>}
    {i.status==='resolved'&&<><p className="field-help">{i.resolution==='relisted'?'The listing was restored to Available. Later reservations may change its current availability.':'Removed / Archived. This material remains hidden from Explore.'} No credits were changed by this review.</p><Link className="button dark full" to="/me/posts">Done</Link></>}
    {error&&<div className="notice" role="alert">{error}<button className="button outline" onClick={()=>setRevision(n=>n+1)}>Reload report</button></div>}
  </div>;
}
