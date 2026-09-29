import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ImageOff, X } from 'lucide-react';
import { Link } from 'react-router-dom';

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

export const formatMoment=(date:string)=>new Date(date).toLocaleString('en',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
