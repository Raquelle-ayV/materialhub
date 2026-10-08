import { ArrowLeft } from 'lucide-react';
import { useContext, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Auth, api, type User } from './lib';
import { PhotoUpload } from './deposits';
import { FlowPage, HubGuide, FindArea } from './flow';
import type { Reservation } from './reservations';
import { MaterialStrip, SuccessPage, PhotoCarousel, TopBar, MaterialCode, capitalize, formatQuantity, credits } from './ui';

type Photo={id:number;url:string};
export type FulfillmentFields={verified_zone_id:number|null;zone_id_snapshot:number;material_code_verified_at:string|null;completed_at:string|null;return_deadline_at:string|null;can_return:boolean;dimensions_spec:string;dimensions_not_applicable:number;condition:string;color:string;category:string;custom_category_name:string|null;zone_code:string|null;placement_photos:Photo[];issue:{reason_label:string;reason:string;notes:string;status:string;resolution:string|null;photos:Photo[]}|null;return:{verified_zone_id:number|null;status:string;photos:Photo[]}|null};
const reasons=['Material is missing','Wrong material','Damaged','Does not match the listing','Other'];
export function ReservationOutcome({r}:{r:Reservation}) {
  return <>
    {r.completed_at&&<p className="field-help">Collected: {new Date(r.completed_at).toLocaleString('en')}</p>}
    {r.status==='collected'&&<><p className="field-help">1 credit spent. Return deadline: {new Date(r.return_deadline_at!).toLocaleString('en',{dateStyle:'medium',timeStyle:'long'})}</p>{r.can_return&&Date.parse(r.return_deadline_at!)>Date.now()?<Link className="button outline full" to={`/reservations/${r.id}/return`}>Return material</Link>:<p className="field-help">The 24-hour return window has ended.</p>}</>}
    {r.status==='returned'&&<p className="field-help">All reserved material returned. 1 credit refunded.</p>}
    {r.issue&&<section className="issue-summary"><b>{r.issue.status==='open'?'Issue reported. Open, needs review':'Issue resolved — '+r.issue.resolution}</b><p>{r.issue.reason_label||r.issue.reason.replaceAll('_',' ')}</p><p className="notes-text">{r.issue.notes}</p><p className="field-help">1 credit released. {r.issue.status==='open'?'This material is hidden from Explore pending review.':r.issue.resolution==='relisted'?'The provider reviewed and relisted the material.':'The provider removed this material from Explore.'}</p><div className="record-thumbnails">{r.issue.photos.map(p=><img key={p.id} src={p.url} alt="Reported problem"/>)}</div></section>}
  </>;
}
function ReservationDetails({r}:{r:Reservation}) {return <dl className="specs"><div><dt>Reserved</dt><dd>{formatQuantity(r.reserved_quantity,r.unit_snapshot)}</dd></div><div><dt>Category</dt><dd>{r.category}{r.custom_category_name?` (${r.custom_category_name})`:''}</dd></div>{!r.dimensions_not_applicable&&r.dimensions_spec&&<div><dt>Dimensions</dt><dd>{r.dimensions_spec}</dd></div>}<div><dt>Color</dt><dd>{capitalize(r.color)}</dd></div><div><dt>Condition</dt><dd>{r.condition}</dd></div></dl>;}
function PlacementPhotos({r}:{r:Reservation}) {return r.placement_photos.length?<section className="placement-photos"><h2>Where it was placed</h2><PhotoCarousel photos={r.placement_photos} label="Placement photos" altFor={()=>'Material placement'}/></section>:null;}
export function FulfillmentPage(){
  const{id,stage}=useParams();const{user,loading,setUser}=useContext(Auth);const navigate=useNavigate();
  const[r,setR]=useState<Reservation|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  const[code,setCode]=useState(''),[reason,setReason]=useState(''),[notes,setNotes]=useState(''),[photos,setPhotos]=useState<Photo[]>([]),[uploading,setUploading]=useState(false),[placed,setPlaced]=useState(false),[photoError,setPhotoError]=useState(''),[savingPhotos,setSavingPhotos]=useState(false);
  const lock=useRef(false),queue=useRef<Promise<unknown>>(Promise.resolve()),photoRevision=useRef(0);
  const routeKey=[user?.id,id,stage].join('/');const[loadedFor,setLoadedFor]=useState('');
  const returning=stage?.startsWith('return');const root=`/reservations/${id}`;
  useEffect(()=>{if(!user)return;let live=true;setR(null);setError('');setCode('');setPlaced(false);setPhotos([]);setPhotoError('');
    const load=async()=>{const result=await api<{reservation:Reservation}>(root+(stage==='return'?'/return/start':''),stage==='return'?{}:undefined);if(live){setR(result.reservation);setLoadedFor(routeKey);if(returning)setPhotos(result.reservation.return?.photos||[]);}};
    void load().catch(e=>{if(live)setError(e.message);});return()=>{live=false;};
  },[id,stage,user?.id,revision]);
  async function action(path:string,body:unknown,next?:string){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await queue.current;const result=await api<{reservation:Reservation}>(`${root}/${path}`,body);if(!next)setR(result.reservation);if(next)navigate(next);void api<{user:User}>('/auth/me').then(a=>setUser(a.user)).catch(()=>{});}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
  function savePhotos(next:Photo[]){setPhotos(next);setSavingPhotos(true);setPhotoError('');const v=++photoRevision.current;queue.current=queue.current.catch(()=>{}).then(()=>api(`${root}/return/photos`,{photo_ids:next.map(p=>p.id)})).catch(e=>{if(v===photoRevision.current)setPhotoError(e.message);throw e;}).finally(()=>{if(v===photoRevision.current)setSavingPhotos(false);});void queue.current.catch(()=>{});}
  if(!loading&&!user)return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace/>;
  if(!r||loadedFor!==routeKey)return <div className="flow-page"><p>{error||'Loading reservation…'}</p>{error&&<button className="button outline" onClick={()=>setRevision(n=>n+1)}>Retry</button>}<Link className="text-link" to="/me/reservations">My reservations</Link></div>;
  if(stage==='success'&&!['collected','returned'].includes(r.status))return <Navigate to={root} replace/>;
  if(stage!=='success'&&((returning&&r.status!=='collected')||(!returning&&r.status!=='reserved')))return <Navigate to={root} replace/>;
  if(['check','problem'].includes(stage!)&&r.verified_zone_id!==r.zone_id_snapshot)return <Navigate to={`${root}/scan`} replace/>;
  if(returning&&stage!=='return'&&!r.return)return <Navigate to={root+'/return'} replace/>;
  if(stage==='return-place'&&r.return?.verified_zone_id!==r.zone_id_snapshot)return <Navigate to={`${root}/return`} replace/>;
  const pickupStep=({guide:1,scan:2,check:3} as Record<string,number>)[stage||''];
  const zoneVerified=r.verified_zone_id===r.zone_id_snapshot;
  const strip=<MaterialStrip image={r.image} name={r.name} code={r.display_code}><ReservationDetails r={r}/></MaterialStrip>;
  const errorBox=error&&<div role="alert" className="notice">{error}</div>;
  if(stage==='success')return <SuccessPage title={r.status==='returned'?'Thanks for returning it':'Enjoy your material'} material={{id:r.material_id,name:r.name,code:r.display_code,image:r.image,detail:formatQuantity(r.reserved_quantity,r.unit_snapshot)}}
    credit={r.status==='returned'?{title:'1 credit refunded',note:`You now have ${credits(user?.available??0)}`}:{title:'1 credit used',note:`You have ${credits(user?.available??0)} left`}} secondary={{to:'/me/reservations',label:'My reservations'}}/>;
  if(pickupStep){
    const page={back:{to:root,label:'Reservation'},current:pickupStep,strip,steps:[{label:'Go to the Hub',to:`${root}/guide`},{label:'Find area',to:`${root}/scan`},{label:'Pick up',to:zoneVerified?`${root}/check`:undefined}]};
    if(pickupStep===1)return <FlowPage {...page} action={<button className="button dark full" onClick={()=>navigate(`${root}/scan`)}>I’m at the Hub</button>}><HubGuide zone={r.zone}/>{errorBox}</FlowPage>;
    if(pickupStep===2)return <FlowPage {...page}><FindArea key={`${id}-${stage}`} zone={r.zone} onVerify={async body=>{await api(`${root}/verify-zone`,body);navigate(`${root}/check`);}}/><PlacementPhotos r={r}/>{errorBox}</FlowPage>;
    // The label code typed at the shelf confirms the right material, then completes the pickup.
    const pickup=async()=>{if(lock.current||!code.trim())return;lock.current=true;setBusy(true);setError('');try{await api(`${root}/verify-material`,{material_code:code.trim()});await api(`${root}/pickup`,{material_code:code.trim(),matches:true});void api<{user:User}>('/auth/me').then(a=>setUser(a.user)).catch(()=>{});navigate(`${root}/success`);}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}};
    return <FlowPage {...page} action={<><button className="button dark full" disabled={busy||!code.trim()} onClick={()=>void pickup()}>{busy?'Confirming…':'Confirm pickup'}</button><Link className="text-link report-link" to={`${root}/problem`}>Missing or doesn’t match? Report a problem</Link></>}>
      <PlacementPhotos r={r}/><p className="find-label">Find the label <strong className="label-code"><MaterialCode code={r.display_code} size="lg"/></strong></p>
      <form className="material-form code-check" onSubmit={e=>{e.preventDefault();void pickup();}}><label>Material code on the label<input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="e.g. M001" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={30}/></label></form>{errorBox}</FlowPage>;
  }
  const titles:Record<string,string>={return:'Return guide','return-scan':'Find area',problem:'Report a problem','return-place':'Return material'};
  return <div className="flow-page"><TopBar to={stage==='problem'?`${root}/check`:root} title={titles[stage||'']||'Reservation'}/>{strip}
    {stage==='return'&&<><HubGuide zone={r.zone}/><p className="reservation-policy">Return all {formatQuantity(r.reserved_quantity,r.unit_snapshot)} to the original zone with the label attached, and add 1–3 new placement photos. 1 credit is refunded once you confirm.</p><button className="button dark full flow-primary" disabled={!r.can_return} onClick={()=>navigate(`${root}/return-scan`)}>I’m at the Hub</button></>}
    {stage==='return-scan'&&<><FindArea key={`${id}-${stage}`} zone={r.zone} onVerify={async body=>{await api(`${root}/return/verify-zone`,body);navigate(`${root}/return-place`);}}/></>}
    {stage==='problem'&&<><form className="material-form" onSubmit={e=>{e.preventDefault();void action('issues',{reason,notes,photo_ids:photos.map(p=>p.id)},'/me/reservations');}}><label htmlFor="problem-reason">Reason</label><select id="problem-reason" value={reason} onChange={e=>setReason(e.target.value)}><option value="">Choose a reason</option>{reasons.map(s=><option key={s}>{s}</option>)}</select><label>Description{reason!=='Other'&&<span className="optional-tag">Optional</span>}<textarea maxLength={4000} rows={4} value={notes} onChange={e=>setNotes(e.target.value)}/></label><PhotoUpload photos={photos} max={3} label="Problem photos" optional onChange={setPhotos} onBusy={setUploading} disabled={busy}/><p className="reservation-policy">This ends your reservation, releases 1 credit and pauses the material for review. It does not mark the material as collected.</p><button className="button dark full" disabled={busy||uploading||!reason||(reason==='Other'&&!notes.trim())}>Submit report</button></form></>}
    {stage==='return-place'&&<><p>Put all {formatQuantity(r.reserved_quantity,r.unit_snapshot)} back in the {r.zone} zone, with the label visible.</p><PhotoUpload photos={photos} max={3} label="Return placement photos" onChange={savePhotos} onBusy={setUploading} disabled={busy}/>{savingPhotos&&<p role="status">Saving photos…</p>}{photoError&&<div className="notice" role="alert">{photoError}<button onClick={()=>savePhotos(photos)}>Retry saving photos</button></div>}<label className="return-confirm"><input type="checkbox" checked={placed} onChange={e=>setPlaced(e.target.checked)}/>I have put all the material back in the correct place.</label><button className="button dark full spaced" disabled={busy||uploading||savingPhotos||!!photoError||!photos.length||!placed} onClick={()=>void action('return/confirm',{placed},'/me/reservations')}>Confirm return</button><p className="field-help">The server checks the 24-hour deadline again when you confirm.</p></>}
    {error&&<div role="alert" className="notice">{error}</div>}
  </div>;
}
