import { useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Camera, CheckCircle2, ImagePlus, Layers3, Package, Plus, ScanLine, Sparkles, Video, X } from 'lucide-react';
import { api } from './lib';
import { ApiError, messageOf, useI18n, type Message } from './i18n';
import { BottomSheet, MaterialPhoto, PhotoCarousel, Toast, TopBar, capitalize, formatQuantity } from './ui';
import { MaterialFields, PhotoUpload, blank, useAccount, type FormData, type Photo } from './deposits';
import './capture.css';

/* ---------- Uploads ---------- */

const MB=1024*1024;
const IMAGE_TYPES=['image/jpeg','image/png','image/webp'];
const VIDEO_TYPES=['video/mp4','video/quicktime','video/webm'];
/** Photos from a real phone library, shown in the camera roll so the prototype feels like the phone's own picker. */
const LIBRARY=Array.from({length:12},(_,i)=>`/roll/photo-${String(i+1).padStart(2,'0')}.jpg`);
const SAMPLE_PHOTO='/placeholders/foam.svg';

export function photoProblem(f:File):Message{
  if(!IMAGE_TYPES.includes(f.type)||! /\.(jpe?g|png|webp)$/i.test(f.name))return 'Use JPG, JPEG, PNG or WebP only.';
  if(f.size>10*MB)return 'Each photo must be 10MB or smaller.';
  return '';
}
export async function uploadPhoto(file:Blob,name:string):Promise<Photo>{
  const response=await fetch('/api/uploads',{method:'POST',credentials:'same-origin',headers:{'Content-Type':file.type,'X-File-Name':encodeURIComponent(name)},body:file});
  const result=await response.json();if(!response.ok)throw new ApiError(result);return result.photo;
}
function videoDuration(file:File){return new Promise<number>(resolve=>{const v=document.createElement('video');const url=URL.createObjectURL(file);v.preload='metadata';v.onloadedmetadata=()=>{URL.revokeObjectURL(url);resolve(v.duration);};v.onerror=()=>{URL.revokeObjectURL(url);resolve(0);};v.src=url;});}
/** One video per material: MP4, MOV or WebM, up to 1 minute and 50MB. */
export async function uploadVideo(file:File):Promise<Photo>{
  const type=VIDEO_TYPES.includes(file.type)?file.type:/\.mov$/i.test(file.name)?'video/quicktime':/\.webm$/i.test(file.name)?'video/webm':/\.(mp4|m4v)$/i.test(file.name)?'video/mp4':'';
  if(!type)throw new Error('Use an MP4, MOV or WebM video.');
  if(file.size>50*MB)throw new Error('The video must be 50MB or smaller.');
  const seconds=await videoDuration(file);if(Number.isFinite(seconds)&&seconds>61)throw new Error('Videos can be up to 1 minute long.');
  const name=/\.(mp4|m4v|mov|webm)$/i.test(file.name)?file.name:`video.${type==='video/quicktime'?'mov':type==='video/webm'?'webm':'mp4'}`;
  const response=await fetch('/api/uploads/video',{method:'POST',credentials:'same-origin',headers:{'Content-Type':type,'X-File-Name':encodeURIComponent(name)},body:file});
  const result=await response.json();if(!response.ok)throw new ApiError(result);return result.video;
}
function loadImage(url:string){return new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Could not load the photo.'));img.src=url;});}
function toJpeg(source:CanvasImageSource,width:number,height:number){
  const scale=Math.min(1,1600/Math.max(width,height));const canvas=document.createElement('canvas');canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
  canvas.getContext('2d')!.drawImage(source,0,0,canvas.width,canvas.height);
  return new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not capture the photo.')),'image/jpeg',.88));
}
async function uploadSample(url:string){const img=await loadImage(url);return uploadPhoto(await toJpeg(img,img.naturalWidth||1000,img.naturalHeight||1000),'library.jpg');}
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

/* ---------- Camera ---------- */

/** Live back camera; without one (desktop, no permission) it shows a sample picture instead. */
function useCamera(fallback:string){
  const video=useRef<HTMLVideoElement>(null);const [state,setState]=useState<'starting'|'live'|'fallback'>('starting');
  useEffect(()=>{let active=true;let stream:MediaStream|null=null;
    (async()=>{try{
      if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('unavailable');
      const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920}},audio:false});
      if(!active){media.getTracks().forEach(t=>t.stop());return;}stream=media;
      if(video.current){video.current.srcObject=media;await video.current.play().catch(()=>{});}setState('live');
    }catch{if(active)setState('fallback');}})();
    return()=>{active=false;stream?.getTracks().forEach(t=>t.stop());};
  },[]);
  async function capture(){const v=video.current;if(state==='live'&&v&&v.videoWidth)return toJpeg(v,v.videoWidth,v.videoHeight);return toJpeg(await loadImage(fallback),1000,1000);}
  return {video,state,capture};
}
type CameraHandle=ReturnType<typeof useCamera>;

function CameraScreen({camera,fallback,label,onClose,top,children}:{camera:CameraHandle;fallback:string;label:string;onClose:()=>void;top?:ReactNode;children:ReactNode}){ const {t}=useI18n();
  return createPortal(<div className="camera-screen" role="dialog" aria-modal="true" aria-label={label}>
    <video ref={camera.video} className={camera.state==='live'?'':'hidden'} muted playsInline autoPlay aria-label={t("Camera preview")}/>
    {camera.state==='fallback'&&<img className="camera-fallback" src={fallback} alt=""/>}
    <button type="button" className="camera-close" aria-label={t("Close camera")} onClick={onClose}><X size={28}/></button>
    {top}
    <div className="camera-frame" aria-hidden="true"><span/><i/><i/><i/><i/></div>
    {camera.state==='fallback'&&<p className="camera-note">{t("Camera unavailable: showing a sample picture")}</p>}
    <div className="camera-bottom">{children}</div>
  </div>,document.body);
}
function ShotStrip({shots,slots,flagged=[],onRemove}:{shots:Photo[];slots:number;flagged?:number[];onRemove:(p:Photo)=>void}){ const {t}=useI18n();
  return <div className="shot-strip">{shots.map((p,i)=><div className="shot" key={p.id}><img src={p.url} alt={t("Photo {{index}}",{index:i+1})}/>{flagged.includes(p.id)&&<span className="shot-flag" title={t("Retake suggested")}><AlertTriangle size={11}/></span>}<button type="button" className="shot-remove" aria-label={t("Remove photo {{index}}",{index:i+1})} onClick={()=>onRemove(p)}><X size={12}/></button></div>)}
    {Array.from({length:Math.max(0,slots-shots.length)},(_,i)=><div className="shot empty" key={`empty-${i}`}/>)}</div>;
}

/** Plain camera opened from the grey card in the camera roll. */
function CameraCapture({max,onCancel,onDone}:{max:number;onCancel:()=>void;onDone:(photos:Photo[])=>void}){ const {t,msg}=useI18n();
  const camera=useCamera(SAMPLE_PHOTO);const [shots,setShots]=useState<Photo[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState<Message>('');
  async function shoot(){if(busy||shots.length>=max)return;setBusy(true);setError('');try{const photo=await uploadPhoto(await camera.capture(),'camera.jpg');setShots(s=>[...s,photo]);}catch(e){setError(messageOf(e));}finally{setBusy(false);}}
  return <CameraScreen camera={camera} fallback={SAMPLE_PHOTO} label={t("Take photos")} onClose={onCancel}
    top={<div className={`camera-guide ${error?'tone-warn':''}`} role="status">{error?msg(error):busy?t("Saving photo…"):t("Fit the whole material inside the frame")}</div>}>
    <ShotStrip shots={shots} slots={Math.min(max,Math.max(4,shots.length+1))} onRemove={p=>setShots(s=>s.filter(x=>x.id!==p.id))}/>
    <div className="shutter-row"><span/><button type="button" className="shutter" aria-label={t("Take photo")} disabled={busy||shots.length>=max} onClick={()=>void shoot()}/><button type="button" className="camera-text-button" disabled={!shots.length||busy} onClick={()=>onDone(shots)}>{t("Done")}</button></div>
  </CameraScreen>;
}

/* ---------- Camera roll ---------- */

type RollItem={id:number;url:string;video?:boolean};
const ROLL_KEY='rematerial.roll';
function readRoll():RollItem[]{try{const rows=JSON.parse(sessionStorage.getItem(ROLL_KEY)||'[]');return Array.isArray(rows)?rows:[];}catch{return [];}}
function writeRoll(rows:RollItem[]){try{sessionStorage.setItem(ROLL_KEY,JSON.stringify(rows.slice(0,40)));}catch{}}

/** Full-screen picker in the style of a phone's camera roll. Grey card = camera; photos taken or uploaded in this session; sample pictures; phone library at the bottom.
 *  covers: one photo per material (labelled "Material 1", "Material 2"…). */
export function CameraRoll({label,max,allowVideo=false,covers=false,onCancel,onDone}:{label:string;max:number;allowVideo?:boolean;covers?:boolean;onCancel:()=>void;onDone:(photos:Photo[],video:Photo|null)=>void}){ const {t,msg}=useI18n();
  const [roll,setRollState]=useState<RollItem[]>(readRoll);const [selected,setSelected]=useState<string[]>([]);const [camera,setCamera]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState<Message>('');
  const setRoll=(rows:RollItem[])=>{setRollState(rows);writeRoll(rows);};
  const isVideo=(key:string)=>!!roll.find(r=>`m${r.id}`===key)?.video;
  const photoCount=selected.filter(k=>!isVideo(k)).length;
  function pick(current:string[],key:string,video:boolean):string[]{
    if(current.includes(key))return current.filter(k=>k!==key);
    if(video){if(!allowVideo){setError(covers?'Choose a photo as the cover. You can add a video in the next step.':'This material already has a video.');return current;}return [...current.filter(k=>!isVideo(k)),key];}
    if(current.filter(k=>!isVideo(k)).length>=max){setError({key:'You can add up to {{max}} more photos.',values:{max}});return current;}
    return [...current,key];
  }
  function toggle(key:string,video=false){setError('');setSelected(s=>pick(s,key,video));}
  function addToRoll(items:RollItem[]){const next=[...items,...roll];setRoll(next);let s=selected;for(const item of items)s=pick(s,`m${item.id}`,!!item.video);setSelected(s);}
  async function library(e:ChangeEvent<HTMLInputElement>){const files=Array.from(e.target.files||[]);e.target.value='';if(!files.length)return;setError('');setBusy(true);const added:RollItem[]=[];
    try{for(const f of files){
      if(f.type.startsWith('video/')||/\.(mp4|m4v|mov|webm)$/i.test(f.name)){if(!allowVideo){setError(covers?'Choose a photo as the cover. You can add a video in the next step.':'This material already has a video.');continue;}const v=await uploadVideo(f);added.push({...v,video:true});continue;}
      const problem=photoProblem(f);if(problem){setError(problem);continue;}
      added.push(await uploadPhoto(f,f.name));
    }}catch(err){setError(messageOf(err));}finally{if(added.length)addToRoll(added.reverse());setBusy(false);}
  }
  async function done(){if(busy||!selected.length)return;setBusy(true);setError('');
    try{const photos:Photo[]=[];let video:Photo|null=null;
      for(const key of selected){if(key.startsWith('s')){photos.push(await uploadSample(LIBRARY[Number(key.slice(1))]));continue;}const item=roll.find(r=>`m${r.id}`===key);if(!item)continue;if(item.video)video={id:item.id,url:item.url};else photos.push({id:item.id,url:item.url});}
      setRoll(roll.filter(r=>!selected.includes(`m${r.id}`)));onDone(photos,video);
    }catch(err){setError(messageOf(err));setBusy(false);}
  }
  const badge=(key:string)=>{const photos=selected.filter(k=>!isVideo(k));const n=photos.indexOf(key)+1;if(isVideo(key))return <span className="roll-badge count"><Check/></span>;return covers?<span className="roll-badge">{t("Material {{n}}",{n})}</span>:<span className="roll-badge count">{n}</span>;};
  const cell=(key:string,src:string,video:boolean,name:string,tag?:string)=>{const on=selected.includes(key);
    return <button type="button" key={key} className={`roll-cell ${on?'selected':''}`} aria-pressed={on} aria-label={name} onClick={()=>toggle(key,video)}>{video?<video src={src} muted preload="metadata"/>:<img src={src} alt=""/>}{(video||tag)&&<span className="roll-tag">{video&&<Video size={12}/>}{tag}</span>}{on&&badge(key)}</button>;};
  return createPortal(<div className="camera-roll" role="dialog" aria-modal="true" aria-label={t("Camera roll")}><div className="roll-inner">
    <header className="roll-header"><button type="button" className="roll-link" onClick={onCancel}>{t("Cancel")}</button><h2>{t("Camera roll")}</h2><button type="button" className="roll-link strong" disabled={!selected.length||busy} onClick={()=>void done()}>{busy?t("Adding…"):t("Done")}</button></header>
    <div className="roll-hint"><b>{covers?t("Choose one cover photo per material"):t("Choose photos or a video")}</b><small>{covers?t("Add more photos and details in the next step."):<span className="counts"><span>{t("Photos")}: {photoCount}/{max}</span>{allowVideo&&<span>{t("Videos")}: {selected.some(isVideo)?1:0}/1</span>}</span>}</small></div>
    {error&&<div className="notice roll-error" role="alert">{msg(error)}</div>}
    <div className="roll-grid">
      <button type="button" className="roll-camera" aria-label={t("Open camera")} onClick={()=>setCamera(true)} disabled={busy}><Camera size={34}/></button>
      {roll.map((r,i)=>cell(`m${r.id}`,r.url,!!r.video,r.video?t("Video {{index}}",{index:i+1}):t("Photo {{index}}",{index:i+1})))}
      {LIBRARY.map((url,i)=>cell(`s${i}`,url,false,t("Library photo {{index}}",{index:i+1})))}
    </div>
    <label className="roll-library"><ImagePlus size={18}/>{t("Choose from phone library…")}<input type="file" aria-label={t("{{label}} from gallery",{label})} accept={allowVideo?[...IMAGE_TYPES,...VIDEO_TYPES,'.jpg','.jpeg','.png','.webp','.mp4','.mov','.webm'].join(','):'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'} multiple disabled={busy} onChange={e=>void library(e)}/></label>
    {camera&&<CameraCapture max={covers?10:Math.max(1,max-photoCount)} onCancel={()=>setCamera(false)} onDone={photos=>{setCamera(false);addToRoll(photos.slice().reverse());}}/>}
  </div></div>,document.body);
}
function Check(){return <CheckCircle2 size={16}/>;}

/* ---------- Batch of new materials (Scan with AI / Multiple items) ---------- */

export type BatchItem={key:string;photos:Photo[];video:Photo|null;form:FormData;ai:boolean;readyAt:number};
type Batch={mode:'ai'|'multiple';items:BatchItem[];scanStep:number};
const BATCH_KEY='rematerial.batch';
const emptyBatch=(mode:Batch['mode']):Batch=>({mode,items:[],scanStep:0});
let batch:Batch=(()=>{try{const b=JSON.parse(sessionStorage.getItem(BATCH_KEY)||'');if(b&&Array.isArray(b.items))return b;}catch{}return emptyBatch('ai');})();
const listeners=new Set<()=>void>();
function setBatch(next:Batch){batch=next;try{sessionStorage.setItem(BATCH_KEY,JSON.stringify(next));}catch{}listeners.forEach(l=>l());}
const updateBatch=(change:(b:Batch)=>Batch)=>setBatch(change(batch));
const patchItem=(key:string,patch:Partial<BatchItem>)=>updateBatch(b=>({...b,items:b.items.map(i=>i.key===key?{...i,...patch}:i)}));
const removeItem=(key:string)=>updateBatch(b=>({...b,items:b.items.filter(i=>i.key!==key)}));
function useBatch(){return useSyncExternalStore(l=>{listeners.add(l);return()=>{listeners.delete(l);};},()=>batch);}
const newItem=(photos:Photo[],form:FormData,ai:boolean,readyAt=0):BatchItem=>({key:crypto.randomUUID(),photos,video:null,form,ai,readyAt});

type Category={id:number;name:string};
let categoryCache:Category[]|null=null;
function useCategories(){const [rows,setRows]=useState<Category[]>(categoryCache||[]);useEffect(()=>{if(categoryCache)return;api<{categories:Category[]}>('/categories').then(r=>{categoryCache=r.categories;setRows(r.categories);}).catch(()=>{});},[]);return rows;}

function submitItem(item:BatchItem){return api('/deposits',{...item.form,dimensions_not_applicable:!item.form.dimensions_spec.trim(),photo_ids:item.photos.map(p=>p.id),video_id:item.video?.id??null,keep_draft:true});}
/** What still has to be filled in before an item can be submitted. */
function missingFields(i:BatchItem){const f=i.form;const missing:string[]=[];
  if(!i.photos.length)missing.push('photo');if(!f.name.trim())missing.push('name');if(!f.category_id)missing.push('category');else if(f.category_id==='7'&&!f.custom_category_name.trim())missing.push('custom category');
  const q=Number(f.quantity);if(!Number.isInteger(q)||q<1||q>1_000_000)missing.push('quantity');if(!f.unit)missing.push('unit');return missing;}
function summary(i:BatchItem,categories:Category[]){const f=i.form;const category=categories.find(c=>String(c.id)===f.category_id)?.name;const q=Number(f.quantity);
  return [category,q>0&&f.unit?formatQuantity(q,f.unit):'',f.condition].filter(Boolean).join(', ');}

/* ---------- Add material: three ways ---------- */

export function AddMaterialSheet({open,onClose}:{open:boolean;onClose:()=>void}){ const {t}=useI18n();const navigate=useNavigate();
  function go(to:string,mode?:Batch['mode']){if(mode)setBatch(emptyBatch(mode));onClose();navigate(to);}
  return <BottomSheet open={open} onClose={onClose} title={t("Add new material")}><div className="create-options">
    <button type="button" onClick={()=>go('/deposit/new?fresh=1')}><span className="create-icon"><Package size={21}/></span><span><b>{t("One item")}</b><small>{t("Fill in the details yourself")}</small></span></button>
    <button type="button" onClick={()=>go('/deposit/scan','ai')}><span className="create-icon"><ScanLine size={21}/></span><span><b>{t("Scan with AI")}<em className="ai-badge">AI</em></b><small>{t("Point your camera at materials and AI fills in the details")}</small></span></button>
    <button type="button" onClick={()=>go('/deposit/multiple','multiple')}><span className="create-icon"><Layers3 size={21}/></span><span><b>{t("Multiple items")}</b><small>{t("Choose one cover photo per material, then add details")}</small></span></button>
  </div></BottomSheet>;
}
export function AddMaterialButton({className,children}:{className:string;children:ReactNode}){const [open,setOpen]=useState(false);
  return <><button type="button" className={className} onClick={()=>setOpen(true)}>{children}</button><AddMaterialSheet open={open} onClose={()=>setOpen(false)}/></>;}

/* ---------- Scan with AI (prototype: recognition is a fixed script) ---------- */

type Hint={tone:'info'|'warn'|'ok';text:string};
type ScriptItem={name:string;category:string;unit:string;quantity:string;dimensions:string;color:string;condition:string;notes:string;sample:string;feedback:Hint[]};
const AI_SCRIPT:ScriptItem[]=[
  {name:'White foam board (KT board)',category:'Board & Foam',unit:'boards',quantity:'3',dimensions:'About 60 × 90 cm, 5 mm thick',color:'White',condition:'Like new',notes:'Clean surface. A few pin holes in one corner.',sample:'/placeholders/foam.svg',
    feedback:[{tone:'warn',text:'Too close. Step back so the whole board fits inside the frame.'},{tone:'ok',text:'Got it: white foam board. Add a side photo to show the thickness, or tap Done.'}]},
  {name:'Pine wood plank',category:'Wood',unit:'boards',quantity:'2',dimensions:'About 120 × 20 cm, 18 mm thick',color:'Natural wood',condition:'Used',notes:'Light marks on one side. No nails or screws.',sample:'/placeholders/wood.svg',
    feedback:[{tone:'warn',text:'Part of the plank is cut off. Turn your phone sideways to fit its full length.'},{tone:'ok',text:'Got it: pine wood plank. Tap Done to add it.'}]},
];
const START_HINT:Hint={tone:'info',text:'Fit the whole material inside the frame, then take a photo.'};
const AI_DELAY=3000;

export function ScanPage(){ const {t,msg}=useI18n();const {user}=useAccount();const navigate=useNavigate();const b=useBatch();const categories=useCategories();
  useEffect(()=>{if(batch.mode!=='ai')setBatch(emptyBatch('ai'));},[]);
  const script=AI_SCRIPT[b.scanStep%AI_SCRIPT.length];
  const camera=useCamera(script.sample);
  const [phase,setPhase]=useState<'capture'|'list'>(()=>batch.mode==='ai'&&batch.items.length?'list':'capture');
  const [shots,setShots]=useState<Photo[]>([]);const [flagged,setFlagged]=useState<number[]>([]);const [analyzing,setAnalyzing]=useState(false);const [hint,setHint]=useState<Hint>(START_HINT);const [detected,setDetected]=useState(false);
  const [now,setNow]=useState(Date.now());
  const items=b.mode==='ai'?b.items:[];
  const nextReady=Math.min(...items.map(i=>i.readyAt).filter(at=>at>now));
  useEffect(()=>{if(!Number.isFinite(nextReady))return;const timer=setTimeout(()=>setNow(Date.now()),nextReady-Date.now()+50);return()=>clearTimeout(timer);},[nextReady]);
  useEffect(()=>{if(phase==='list'&&!items.length)setPhase('capture');},[phase,items.length]);
  async function shoot(){if(analyzing)return;setAnalyzing(true);setHint({tone:'info',text:'Analyzing photo…'});
    try{const [photo]=await Promise.all([camera.capture().then(blob=>uploadPhoto(blob,'scan.jpg')),wait(AI_DELAY)]);
      const feedback=script.feedback[shots.length]||{tone:'ok',text:'Photo added. Tap Done when you have enough photos.'};
      setShots(s=>[...s,photo]);if(feedback.tone==='warn')setFlagged(f=>[...f,photo.id]);if(feedback.tone==='ok')setDetected(true);setHint(feedback);
    }catch(e){setHint({tone:'warn',text:msg(messageOf(e))});}finally{setAnalyzing(false);}
  }
  function done(){const c=categories.find(x=>x.name===script.category);const units=c?script.unit:'';
    const form:FormData={...blank(),name:script.name,category_id:c?String(c.id):'',quantity:script.quantity,unit:units,dimensions_spec:script.dimensions,color:script.color,condition:script.condition,notes:script.notes};
    // Shots the AI asked to retake (e.g. "too close") are dropped; only the good ones are kept.
    const good=shots.filter(p=>!flagged.includes(p.id));
    updateBatch(x=>({...x,items:[...x.items,newItem(good.length?good:shots,form,true,Date.now()+AI_DELAY)]}));setNow(Date.now());
    setShots([]);setFlagged([]);setDetected(false);setHint(START_HINT);setPhase('list');}
  function another(){updateBatch(x=>({...x,scanStep:x.scanStep+1}));setPhase('capture');}
  if(!user)return <div className="loading">{t("Loading your account…")}</div>;
  const generating=items.some(i=>i.readyAt>now);
  const icon=analyzing?<Sparkles size={18} className="spin sparkle"/>:hint.tone==='warn'?<AlertTriangle size={18}/>:hint.tone==='ok'?<CheckCircle2 size={18}/>:<ScanLine size={18}/>;
  return <CameraScreen camera={camera} fallback={script.sample} label={t("Scan with AI")} onClose={()=>navigate('/deposit')}
    top={phase==='capture'&&<div className={`camera-guide tone-${analyzing?'info':hint.tone}`} role="status">{icon}<span>{analyzing?t("Analyzing photo…"):t(hint.text)}</span></div>}>
    {phase==='capture'?<>
      {detected&&<div className="ai-chip"><Sparkles size={15}/>{t(script.name)}</div>}
      <ShotStrip shots={shots} slots={4} flagged={flagged} onRemove={p=>{setShots(s=>s.filter(x=>x.id!==p.id));setFlagged(f=>f.filter(id=>id!==p.id));}}/>
      <div className="shutter-row">{items.length?<button type="button" className="camera-text-button start" onClick={()=>{setShots([]);setFlagged([]);setDetected(false);setHint(START_HINT);setPhase('list');}}>{t("Items ({{n}})",{n:items.length})}</button>:<span/>}
        <button type="button" className="shutter" aria-label={t("Take photo")} disabled={analyzing} onClick={()=>void shoot()}/>
        <button type="button" className="camera-text-button" disabled={!shots.length||analyzing} onClick={done}>{t("Done")}</button></div>
    </>:<div className="ai-list">
      <h3>{t("Items to list")}</h3>
      <div className="ai-cards">{items.map(i=>{const ready=i.readyAt<=now;return <div className="ai-card" key={i.key}>
        <button type="button" onClick={()=>navigate(`/deposit/review/${i.key}`)} aria-label={t("Edit {{name}}",{name:i.form.name})}><MaterialPhoto src={i.photos[0]?.url} alt=""/><span><b>{capitalize(i.form.name)}</b>{ready?<small>{summary(i,categories)}</small>:<i className="skeleton"/>}</span></button>
        <button type="button" className="card-remove" aria-label={t("Remove {{name}}",{name:i.form.name})} onClick={()=>removeItem(i.key)}><X size={18}/></button></div>;})}</div>
      <button type="button" className="ai-generate" disabled={generating} onClick={()=>navigate('/deposit/review')}><Sparkles size={17} className={generating?'spin sparkle':'sparkle'}/>{generating?t("Generating details…"):t(items.length===1?"Review 1 item":"Review {{n}} items",{n:items.length})}</button>
      <button type="button" className="ai-another" onClick={another}>{t("Add another item")}</button>
    </div>}
  </CameraScreen>;
}

/* ---------- Editing one item of the batch ---------- */

function BatchEditor({item}:{item:BatchItem}){ const {t}=useI18n();const categories=useCategories();const [busy,setBusy]=useState(false);
  return <div className="material-form batch-editor" aria-busy={busy}>{item.ai&&<p className="ai-note"><Sparkles size={16}/><span>{t("Filled in by AI from your photos. Check the details and change anything that’s off.")}</span></p>}
    <PhotoUpload label={t("Material photos")} photos={item.photos} max={9} onChange={p=>patchItem(item.key,{photos:p})} video={item.video} onVideoChange={v=>patchItem(item.key,{video:v})} onBusy={setBusy}/>
    <MaterialFields form={item.form} categories={categories} onChange={f=>patchItem(item.key,{form:f})} detailsOpen={item.ai}/>
  </div>;
}

export function BatchItemPage(){ const {t,msg}=useI18n();const {user}=useAccount();const {key}=useParams();const navigate=useNavigate();const b=useBatch();
  const item=b.items.find(i=>i.key===key);const [busy,setBusy]=useState(false);const [error,setError]=useState<Message>('');
  async function publish(){if(!item||busy)return;const missing=missingFields(item);if(missing.length){setError({key:'Please add: {{fields}}.',values:{fields:missing.join(', ')}});return;}
    setBusy(true);setError('');try{await submitItem(item);const left=batch.items.length-1;navigate(left?'/deposit/review':'/deposit',{replace:true,state:{toast:`${capitalize(item.form.name)} recorded`}});removeItem(item.key);if(!left)setBatch(emptyBatch(batch.mode));}catch(e){setError(messageOf(e));setBusy(false);}}
  if(!user)return <div className="loading">{t("Loading your account…")}</div>;
  if(!item)return <div className="flow-page"><TopBar to="/deposit/review" title={t("Edit material")}/><p>{t("This material is no longer in your list.")}</p><Link className="button dark full" to="/deposit/review">{t("Back to review")}</Link></div>;
  return <div className="flow-page"><TopBar to="/deposit/review" title={t("Edit material")}/><BatchEditor item={item}/>
    <div className="flow-action">{error&&<div className="notice" role="alert">{msg(error)}</div>}<button type="button" className="button dark full" disabled={busy} onClick={()=>void publish()}>{busy?t("Publishing…"):t("Publish")}</button></div></div>;
}

/* ---------- Multiple items ---------- */

export function MultiplePage(){ const {t}=useI18n();const {user}=useAccount();const navigate=useNavigate();const b=useBatch();
  useEffect(()=>{if(batch.mode!=='multiple')setBatch(emptyBatch('multiple'));},[]);
  const items=b.mode==='multiple'?b.items:[];
  const [current,setCurrent]=useState(0);const [rollOpen,setRollOpen]=useState(()=>batch.mode!=='multiple'||!batch.items.length);
  const index=Math.min(current,items.length-1);const item=items[index];
  function addCovers(photos:Photo[]){const start=batch.mode==='multiple'?batch.items.length:0;updateBatch(x=>({...x,mode:'multiple',items:[...(x.mode==='multiple'?x.items:[]),...photos.map(p=>newItem([p],blank(),false))]}));setCurrent(start);setRollOpen(false);window.scrollTo(0,0);}
  function remove(n:number){removeItem(items[n].key);if(n<=index)setCurrent(Math.max(0,index-1));}
  function next(){if(index<items.length-1){setCurrent(index+1);window.scrollTo(0,0);}else navigate('/deposit/review');}
  if(!user)return <div className="loading">{t("Loading your account…")}</div>;
  const roll=rollOpen&&<CameraRoll covers label={t("Cover photos")} max={20} onCancel={()=>{setRollOpen(false);if(!items.length)navigate('/deposit');}} onDone={photos=>addCovers(photos)}/>;
  if(!item)return <div className="flow-page"><TopBar to="/deposit" title={t("Multiple items")}/><div className="empty-state"><Layers3 size={30}/><h2>{t("Add several materials at once")}</h2><p>{t("Choose one cover photo for each material. You can add more photos and details next.")}</p><button type="button" className="button dark full" onClick={()=>setRollOpen(true)}>{t("Choose cover photos")}</button></div>{roll}</div>;
  return <div className="flow-page multi-page"><TopBar to="/deposit" title={t("Material {{n}}",{n:index+1})} end={<button type="button" className="top-link" onClick={next}>{index<items.length-1?t("Next"):t("Review")}</button>}/>
    <BatchEditor key={item.key} item={item}/>
    <div className="flow-action multi-bar"><div className="multi-bar-head"><b>{t("Create multiple materials")}</b><small>{t("Tap a photo to edit its details")}</small></div>
      <div className="multi-thumbs">{items.map((i,n)=><div className={`multi-thumb ${n===index?'active':''}`} key={i.key}><button type="button" aria-label={t("Edit material {{n}}",{n:n+1})} aria-current={n===index?'true':undefined} onClick={()=>{setCurrent(n);window.scrollTo(0,0);}}><MaterialPhoto src={i.photos[0]?.url} alt=""/></button><button type="button" className="thumb-remove" aria-label={t("Remove material {{n}}",{n:n+1})} onClick={()=>remove(n)}><X size={12}/></button></div>)}</div>
      <div className="multi-actions"><button type="button" className="button dark" onClick={()=>setRollOpen(true)}><Plus size={17}/>{t("Add material")}</button><Link className="button outline" to="/deposit/review">{t("Review materials")}</Link></div></div>
    {roll}
  </div>;
}

/* ---------- Review and submit the batch ---------- */

export function BatchReviewPage(){ const {t,msg}=useI18n();const {user}=useAccount();const navigate=useNavigate();const location=useLocation();const b=useBatch();const categories=useCategories();
  const [toast,setToast]=useState('');useEffect(()=>{const message=(location.state as {toast?:string}|null)?.toast;if(message){setToast(message);navigate(location.pathname,{replace:true,state:null});}},[location.key]);
  const [preview,setPreview]=useState<BatchItem|null>(null);const [rollFor,setRollFor]=useState<BatchItem|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState<Message>('');
  const ai=b.mode==='ai';const back=ai?'/deposit/scan':'/deposit/multiple';
  async function submit(){if(busy)return;const incomplete=b.items.find(i=>missingFields(i).length);
    if(incomplete){setError({key:'Complete the details for “{{name}}” first.',values:{name:incomplete.form.name||t('Untitled material')}});return;}
    setBusy(true);setError('');const total=b.items.length;
    try{for(const item of b.items){
      await submitItem(item);
      removeItem(item.key);
    }setBatch(emptyBatch(b.mode));navigate('/deposit',{state:{toast:total===1?'1 material recorded':`${total} materials recorded`}});}
    catch(e){setError(messageOf(e));}finally{setBusy(false);}
  }
  if(!user)return <div className="loading">{t("Loading your account…")}</div>;
  return <div className="flow-page batch-review"><TopBar to={back} title={ai?t("Created with AI"):t("Review materials")}/>{toast&&<Toast tone="status" message={toast} onDone={()=>setToast('')}/>}
    {ai&&b.items.length>0&&<p className="ai-note"><Sparkles size={16}/><span>{t("AI filled in these details from your photos. Check them before you submit.")}</span></p>}
    {!b.items.length?<div className="empty-state"><Package size={30}/><h2>{t("No materials yet")}</h2><p>{t("Add materials first, then review them here.")}</p><Link className="button dark full" to={back}>{ai?t("Scan materials"):t("Choose cover photos")}</Link></div>:
    <div className="review-list">{b.items.map(i=>{const missing=missingFields(i);return <section className="review-item" key={i.key}>
      <div className="review-head"><div><h2>{capitalize(i.form.name)||t("Untitled material")}</h2>{summary(i,categories)&&<p className="review-meta">{summary(i,categories)}</p>}</div><button type="button" className="icon-plain" aria-label={t("Remove {{name}}",{name:i.form.name||t('Untitled material')})} onClick={()=>removeItem(i.key)}><X size={22}/></button></div>
      {missing.length>0&&<span className="review-missing">{t("Needs: {{fields}}",{fields:missing.join(', ')})}</span>}
      <div className="review-photos">{i.photos.map((p,n)=><div className="review-photo" key={p.id}><MaterialPhoto src={p.url} alt={t("{{name}} photo {{index}}",{name:i.form.name,index:n+1})}/><button type="button" aria-label={t("Remove photo {{index}}",{index:n+1})} onClick={()=>patchItem(i.key,{photos:i.photos.filter(x=>x.id!==p.id)})}><X size={12}/></button></div>)}
        {i.video&&<div className="review-photo"><video src={i.video.url} muted preload="metadata"/><span className="roll-tag"><Video size={12}/></span></div>}
        {i.photos.length<9&&<button type="button" className="review-add" onClick={()=>setRollFor(i)}><ImagePlus size={20}/>{t("Add photos")}</button>}</div>
      <div className="review-actions"><button type="button" className="button outline" onClick={()=>setPreview(i)}>{t("Preview")}</button><Link className="button outline" to={`/deposit/review/${i.key}`}>{t("Edit")}</Link></div>
    </section>;})}</div>}
    {b.items.length>0&&<div className="flow-action">{error&&<div className="notice" role="alert">{msg(error)}</div>}<button type="button" className="button dark full" disabled={busy} onClick={()=>void submit()}>{busy?t("Submitting…"):b.items.length===1?t("Submit 1 material"):t("Submit {{n}} materials",{n:b.items.length})}</button></div>}
    <BottomSheet open={!!preview} onClose={()=>setPreview(null)} title={t("Preview")}>{preview&&<div className="batch-preview">{preview.photos.length>0&&<PhotoCarousel photos={preview.photos} altFor={n=>`${preview.form.name} ${n+1}`}/>}
      <h3>{capitalize(preview.form.name)||t("Untitled material")}</h3><dl className="specs">{summary(preview,categories)&&<div><dt>{t("Details")}</dt><dd>{summary(preview,categories)}</dd></div>}{preview.form.dimensions_spec&&<div><dt>{t("Dimensions")}</dt><dd>{preview.form.dimensions_spec}</dd></div>}{preview.form.color&&<div><dt>{t("Color")}</dt><dd>{capitalize(preview.form.color)}</dd></div>}</dl>{preview.form.notes&&<p className="notes-text">{preview.form.notes}</p>}</div>}</BottomSheet>
    {rollFor&&<CameraRoll label={t("Material photos")} max={9-rollFor.photos.length} allowVideo={!rollFor.video} onCancel={()=>setRollFor(null)} onDone={(photos,video)=>{const current=batch.items.find(x=>x.key===rollFor.key);if(current)patchItem(current.key,{photos:[...current.photos,...photos],...(video?{video}:{})});setRollFor(null);}}/>}
  </div>;
}

