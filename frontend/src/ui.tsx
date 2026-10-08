import { useContext, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronRight, Heart, ImageOff, Pencil, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Auth, api } from './lib';

/** Shared presentation only. Original uploads and transaction data are never modified. */
export function MaterialPhoto({src,alt,className=''}:{src?:string;alt:string;className?:string}) {
  const [state,setState]=useState<'loading'|'ready'|'missing'>(src?'loading':'missing');
  useEffect(()=>setState(src?'loading':'missing'),[src]);
  if(!src||state==='missing')return <span className={`photo-fallback ${className}`} role="img" aria-label={`${alt}: photo unavailable`}><ImageOff size={24}/><span>Photo unavailable</span></span>;
  return <img className={`material-photo ${className}`} data-state={state} src={src} alt={alt} onLoad={()=>setState('ready')} onError={()=>setState('missing')}/>;
}

export function ZoomablePhoto({src,alt}:{src?:string;alt:string}) {
  const [open,setOpen]=useState(false);const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(open)dialog.current?.showModal();},[open]);
  return <><button type="button" className="photo-open" aria-label={`View full photo: ${alt}`} onClick={()=>setOpen(true)}><MaterialPhoto src={src} alt={alt}/></button>{open&&<dialog className="photo-viewer" ref={dialog} aria-label="Full-size photo" onCancel={()=>setOpen(false)} onClick={e=>{if(e.target===e.currentTarget)setOpen(false);}}><button type="button" className="icon-button photo-close" aria-label="Close photo" onClick={()=>setOpen(false)}><X size={22}/></button><MaterialPhoto src={src} alt={alt}/><p>{alt}</p></dialog>}</>;
}

/** Shared finish screen for drop-off and pickup: no back arrow, Done returns to Explore. */
export function SuccessPage({title,subtitle,material,credit,secondary,children}:{title:string;subtitle?:string;material:{id:number;name:string;code:string;image?:string;detail?:string};credit:string;secondary:{to:string;label:string};children?:ReactNode}) {
  return <section className="success-page"><span className="success-icon"><Check size={30}/></span><div className="page-heading"><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div>
    <Link className="success-material" to={`/materials/${material.id}`}><MaterialPhoto src={material.image} alt={material.name}/><div><b>{material.name}</b><small>{material.code}{material.detail?` · ${material.detail}`:''}</small></div><ChevronRight size={18}/></Link>
    <p className="success-credit">{credit}</p>{children}
    <div className="flow-action"><Link className="button dark full" to="/">Done</Link><Link className="button outline full" to={secondary.to}>{secondary.label}</Link></div></section>;
}

export type FlowStep = {label:string;to?:string;onClick?:()=>void;disabled?:boolean};
/** Step bar for offline flows: completed and unlocked steps can be revisited; locked steps stay greyed out. */
export function StepBar({steps,current}:{steps:FlowStep[];current:number}) {
  return <ol className="flow-progress" aria-label="Progress">{steps.map((s,i)=>{const n=i+1;const body=<><span>{n<current?<Check size={12}/>:n}</span><small>{s.label}</small></>;const locked=s.disabled||(!s.to&&!s.onClick);
    return <li key={s.label} aria-current={n===current?'step':undefined} className={`${n<=current?'reached':''} ${locked&&n!==current?'locked':''}`}>{locked?<div className="step-target" aria-disabled={locked&&n!==current?true:undefined}>{body}</div>:s.to?<Link className="step-target" to={s.to}>{body}</Link>:<button type="button" className="step-target" onClick={s.onClick}>{body}</button>}</li>;})}</ol>;
}

/** Compact "which material is this?" card shown at the top of each Hub step. */
export function MaterialStrip({image,name,code,editTo,children,defaultOpen=false}:{image?:string;name:string;code:string;editTo?:string;children?:ReactNode;defaultOpen?:boolean}) {
  const [open,setOpen]=useState(defaultOpen);
  return <section className={`material-strip ${open?'open':''}`}><div className="material-strip-row"><MaterialPhoto src={image} alt={name}/><div className="material-strip-text"><b>{name}</b><small>{code}</small></div>{editTo&&<Link className="icon-button" to={editTo} aria-label="Edit material information"><Pencil size={17}/></Link>}{children&&<button type="button" className="icon-button strip-toggle" aria-expanded={open} aria-label={open?'Hide details':'View details'} onClick={()=>setOpen(!open)}><ChevronDown size={20}/></button>}</div>{open&&children&&<div className="material-strip-details">{children}</div>}</section>;
}

/** Heart toggle: fills instantly, rolls back with a message if saving fails, and sends logged-out visitors to log in. */
export function FavoriteButton({materialId,initial,className='',onChange}:{materialId:number;initial:boolean;className?:string;onChange?:(saved:boolean)=>void}) {
  const {user,loading}=useContext(Auth);const navigate=useNavigate();const location=useLocation();
  const [saved,setSaved]=useState(initial);const [failed,setFailed]=useState(false);const busy=useRef(false);
  // Background refreshes must not overwrite a click that is still being saved.
  useEffect(()=>{if(!busy.current)setSaved(initial);},[initial]);
  async function toggle(e:MouseEvent){e.preventDefault();e.stopPropagation();
    if(loading||busy.current)return;
    if(!user){navigate(`/login?next=${encodeURIComponent(location.pathname+location.search)}`);return;}
    busy.current=true;const next=!saved;setSaved(next);setFailed(false);
    try{await api(`/materials/${materialId}/favorite`,{favorite:next});onChange?.(next);}catch{setSaved(!next);setFailed(true);}finally{busy.current=false;}}
  return <><button type="button" className={`favorite-button ${saved?'saved':''} ${className}`} aria-pressed={saved} aria-label={saved?'Remove from saved':'Save material'} onClick={toggle}><Heart size={20} strokeWidth={2}/></button>{failed&&<Toast message="Couldn’t save. Try again." onDone={()=>setFailed(false)}/>}</>;
}

/** Short message above the bottom bar; disappears by itself. */
export function Toast({message,onDone,tone='alert'}:{message:string;onDone:()=>void;tone?:'alert'|'status'}) {
  useEffect(()=>{const timer=setTimeout(onDone,3000);return()=>clearTimeout(timer);},[message]);
  return createPortal(<div className="toast" role={tone}>{message}</div>,document.body);
}

/** Panel that slides up from the bottom; tapping outside or Escape closes it. */
export function BottomSheet({open,onClose,title,children}:{open:boolean;onClose:()=>void;title:string;children:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const d=ref.current;if(!d)return;if(open&&!d.open)d.showModal();if(!open&&d.open)d.close();},[open]);
  return <dialog ref={ref} className="bottom-sheet" aria-label={title} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="sheet-body"><span className="sheet-grip" aria-hidden="true"/><div className="panel-heading"><h2>{title}</h2><button type="button" aria-label="Close" onClick={onClose}><X size={20}/></button></div>{children}</div></dialog>;
}

const keepUnit=/^(cm|mm|m|km|g|kg|ml|l|pcs|m²|m2|ft|in)$/i;
/** "1 sheet", "2 sheets", "3 boxes"; abbreviations such as cm or kg stay as they are. */
export function formatQuantity(n:number,unit:string) {
  const [word,...rest]=unit.trim().split(/\s+/);
  if(!word||keepUnit.test(word)||/[^a-z]/i.test(word))return `${n} ${unit}`.trim();
  const lower=word.toLowerCase();let next=word;
  if(n===1){if(/[^aeiou]ies$/.test(lower))next=word.slice(0,-3)+'y';else if(/(ch|sh|ss|x|z)es$/.test(lower))next=word.slice(0,-2);else if(/[^s]s$/.test(lower))next=word.slice(0,-1);}
  else if(!/s$/.test(lower)){if(/[^aeiou]y$/.test(lower))next=word.slice(0,-1)+'ies';else if(/(ch|sh|x|z)$/.test(lower))next=word+'es';else next=word+'s';}
  return [n,next,...rest].join(' ');
}

/** "Due tomorrow, 3:36 PM · 23h left" — no seconds or time zone. */
export function formatDue(iso:string,now=Date.now()) {
  const due=new Date(iso),today=new Date(now);const dayOffset=Math.round((new Date(due.getFullYear(),due.getMonth(),due.getDate()).getTime()-new Date(today.getFullYear(),today.getMonth(),today.getDate()).getTime())/86400000);
  const day=dayOffset===0?'today':dayOffset===1?'tomorrow':due.toLocaleDateString('en',{weekday:'short',month:'short',day:'numeric'});
  const time=due.toLocaleTimeString('en',{hour:'numeric',minute:'2-digit'});const mins=Math.ceil((due.getTime()-now)/60000);
  const left=mins<=0?'deadline passed':mins<60?`${mins}m left`:`${Math.floor(mins/60)}h left`;
  return `Due ${day}, ${time} · ${left}`;
}

export const formatMoment=(date:string)=>new Date(date).toLocaleString('en',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
