import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Camera, Clock3, MapPin } from 'lucide-react';
import type { IScannerControls } from '@zxing/browser';
import { hubConfig } from './hub-config';
import { StepBar, type FlowStep } from './ui';
import { useI18n, messageOf, type Message } from './i18n';

function ErrorMessage({error}:{error:Message}) { const {msg}=useI18n(); return error?<div className="notice" role="alert">{msg(error)}</div>:null; }

/** One template for every drop-off and pickup step: back, steps, material, title (= current step), content, fixed action. */
export function FlowPage({back,steps,current,strip,children,action,hint}:{back:{to:string;label:string};steps:FlowStep[];current:number;strip?:ReactNode;children?:ReactNode;action?:ReactNode;hint?:ReactNode}) {
  return <div className="flow-page"><Link className="back-link" to={back.to}><ArrowLeft size={16}/>{back.label}</Link><StepBar steps={steps} current={current}/>{strip}
    <div className="page-heading"><h1>{steps[current-1].label}</h1></div>{children}
    {action&&<div className="flow-action">{hint&&<p className="flow-hint" role="status">{hint}</p>}{action}</div>}</div>;
}

/** Illustration of the sign at each zone. Deliberately not a real, scannable QR. */
export function ZoneSign({name,code}:{name:string;code?:string}) {
  const seed=[...name].reduce((n,c)=>n*31+c.charCodeAt(0)>>>0,7);
  const finder=(x:number,y:number)=>x<3&&y<3||x>5&&y<3||x<3&&y>5;
  const cells=Array.from({length:81},(_,i)=>{const x=i%9,y=Math.floor(i/9);return finder(x,y)?(x%6===1&&y%6===1?false:true):((seed>>>(i%29))+i*7)%3===0;});
  return <figure className="zone-sign" aria-label={`Illustration of the ${name} zone sign`}><svg viewBox="0 0 9 9" aria-hidden="true">{cells.map((on,i)=>on&&<rect key={i} x={i%9} y={Math.floor(i/9)} width="1" height="1"/>)}</svg><div><small>ZONE</small><b>{name}</b>{code&&<strong>{code}</strong>}</div><figcaption>Illustration · scan the QR on the real sign</figcaption></figure>;
}

/** Hub location, hours, route map and zone sign. Empty settings in hub-config.ts are simply left out. */
export function HubGuide({zone,zoneCode}:{zone?:string;zoneCode?:string}) {
  const photo=zone?hubConfig.zonePhotos[zone]:'';
  return <div className="hub-guide">
    {(hubConfig.location||hubConfig.hours)&&<section className="hub-card"><b>{hubConfig.name}</b>{hubConfig.location&&<p><MapPin size={16}/>{hubConfig.location}</p>}{hubConfig.hours&&<p><Clock3 size={16}/>{hubConfig.hours}</p>}</section>}
    {hubConfig.routeMap&&<figure className="hub-figure"><img src={hubConfig.routeMap} alt={`Route to the ${hubConfig.name}`}/></figure>}
    {zone&&<section className="guide-block"><h2>Find the {zone} zone</h2><p>Look for this sign.</p><ZoneSign name={zone} code={zoneCode}/>{photo&&<figure className="hub-figure"><img src={photo} alt={`${zone} zone`}/></figure>}</section>}
  </div>;
}

/** Zone check by camera, with a typed 2-letter code as the fallback (always offered, opened automatically if the camera fails). */
export function FindArea({zone,onVerify}:{zone:string;onVerify:(body:{qr?:string;zone_code?:string})=>Promise<void>}) {
  const [manual,setManual]=useState(false);const [code,setCode]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState<Message>('');
  async function submit(e:FormEvent){e.preventDefault();if(busy||code.trim().length<2)return;setBusy(true);setError('');try{await onVerify({zone_code:code.trim()});}catch(err){setError(messageOf(err));}finally{setBusy(false);}}
  return <><div className="zone-confirm"><MapPin size={21}/><div><small>YOUR MATERIAL ZONE</small><b>{zone}</b></div></div>
    <CameraScanner autoStart onScan={qr=>onVerify({qr})} onUnavailable={()=>setManual(true)}/>
    {manual?<form className="manual-zone material-form" noValidate onSubmit={submit}><label>Zone code<input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} maxLength={2} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="e.g. BF"/></label><p className="field-help">It’s printed under the QR on the zone sign.</p><ErrorMessage error={error}/><button className="button outline full" disabled={busy||code.trim().length<2}>{busy?'Checking…':'Confirm zone'}</button></form>
      :<button type="button" className="text-link manual-toggle" onClick={()=>setManual(true)}>Can’t scan? Enter zone code</button>}</>;
}

export function CameraScanner({onScan,autoStart=false,onUnavailable}:{onScan:(qr:string)=>Promise<void>;autoStart?:boolean;onUnavailable?:()=>void}) { const {t}=useI18n(); 
  const video=useRef<HTMLVideoElement>(null);const controls=useRef<IScannerControls|null>(null);const stream=useRef<MediaStream|null>(null);const generation=useRef(0);const mounted=useRef(true);const [state,setState]=useState<'idle'|'starting'|'running'>('idle');const [error,setError]=useState<Message>('');const last=useRef({qr:'',at:0});const verifying=useRef(false);
  function stop(){generation.current++;controls.current?.stop();controls.current=null;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;if(video.current)video.current.srcObject=null;}
  useEffect(()=>{mounted.current=true;if(autoStart)void start();return()=>{mounted.current=false;stop();};},[]);
  async function start(){stop();const session=generation.current;setError('');setState('starting');
    try{
      if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access needs localhost or HTTPS. Open this page in a camera-enabled browser.');
      const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280}},audio:false});
      if(!mounted.current||generation.current!==session){media.getTracks().forEach(t=>t.stop());return;}stream.current=media;
      const {BrowserQRCodeReader}=await import('@zxing/browser');
      if(!mounted.current||generation.current!==session){media.getTracks().forEach(t=>t.stop());return;}
      const reader=new BrowserQRCodeReader(undefined,{delayBetweenScanAttempts:250});
      const scan=await reader.decodeFromStream(media,video.current!,async(result)=>{
        if(!result||verifying.current||!mounted.current||generation.current!==session)return;const qr=result.getText();if(qr===last.current.qr&&Date.now()-last.current.at<2500)return;last.current={qr,at:Date.now()};verifying.current=true;
        try{await onScan(qr);stop();}catch(e){if(mounted.current)setError(messageOf(e));}finally{verifying.current=false;}
      });
      if(!mounted.current||generation.current!==session){scan.stop();media.getTracks().forEach(t=>t.stop());return;}controls.current=scan;setState('running');
    }catch(e){stop();if(!mounted.current)return;setState('idle');onUnavailable?.();const err=e as Error;setError(err.name==='NotAllowedError'?'Camera permission was denied. Enable camera access in your browser settings, then try again.':err.name==='NotFoundError'?'No camera was found. Connect a camera and try again.':err.name==='NotReadableError'?'The camera is in use. Close other camera apps and try again.':messageOf(err));}
  }
  return <section className="scanner"><div className="camera-window"><video ref={video} muted playsInline autoPlay aria-label={t("Zone QR camera preview")}/>{state==='idle'&&<div className="camera-prompt"><Camera size={38}/><p>{t("Point your camera at the Zone QR.")}</p></div>}<span className="scan-corners"/></div><ErrorMessage error={error}/>{state==='running'?<><p className="field-help" role="status">{t("Camera active. Keep the QR inside the frame.")}</p><button className="button outline full" onClick={()=>{stop();setState('idle');}}>{t("Stop camera")}</button></>:<button className="button dark full" disabled={state==='starting'} onClick={start}>{state==='starting'?t("Opening camera…"):error?t("Retry camera"):t("Start camera")}<Camera size={18}/></button>}</section>;
}

