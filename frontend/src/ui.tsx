import { useContext, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Check, ChevronDown, Heart, ImageOff, Pencil, X } from 'lucide-react';
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

export function CompletionSummary({title,description,name,code,quantity,image,credit,children}:{title:string;description?:string;name:string;code:string;quantity:string;image?:string;credit:string;children?:ReactNode}) {
  return <section className="completion completion-summary"><span className="completion-icon"><Check size={28}/></span><div className="page-heading"><h1>{title}</h1>{description&&<p>{description}</p>}</div><div className="completion-material"><MaterialPhoto src={image} alt={name}/><div><h2>{name}</h2><p>{code}</p><p>{quantity}</p></div></div><p className="completion-credit">{credit}</p>{children}<Link className="button dark full flow-primary" to="/">Done</Link></section>;
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
  useEffect(()=>{if(!failed)return;const timer=setTimeout(()=>setFailed(false),3000);return()=>clearTimeout(timer);},[failed]);
  async function toggle(e:MouseEvent){e.preventDefault();e.stopPropagation();
    if(loading||busy.current)return;
    if(!user){navigate(`/login?next=${encodeURIComponent(location.pathname+location.search)}`);return;}
    busy.current=true;const next=!saved;setSaved(next);setFailed(false);
    try{await api(`/materials/${materialId}/favorite`,{favorite:next});onChange?.(next);}catch{setSaved(!next);setFailed(true);}finally{busy.current=false;}}
  return <><button type="button" className={`favorite-button ${saved?'saved':''} ${className}`} aria-pressed={saved} aria-label={saved?'Remove from saved':'Save material'} onClick={toggle}><Heart size={20} strokeWidth={2}/></button>{failed&&createPortal(<div className="toast" role="alert">Couldn’t save. Try again.</div>,document.body)}</>;
}

export const formatMoment=(date:string)=>new Date(date).toLocaleString('en',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
