import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { Auth, api, type User } from './lib';
import i18n, { isLanguage, messageOf, useI18n, type Language, type Message } from './i18n';

const Preferences=createContext<{choose:(l:Language)=>Promise<void>;saving:boolean;error:Message}>({choose:async()=>{},saving:false,error:''});
export function LanguagePreferences({children}:{children:ReactNode}){
  const {user,setUser}=useContext(Auth);const current=useRef(user);current.current=user;
  const [saving,setSaving]=useState(false);const [error,setError]=useState<Message>('');const serial=useRef(Promise.resolve());
  async function save(language:Language,id:number){const response=await api<{user:User}>('/me/preferences',{language});if(current.current?.id===id)setUser(response.user);}
  useEffect(()=>{setError('');if(user&&isLanguage(user.language))void i18n.changeLanguage(user.language);},[user?.id]);
  async function choose(language:Language){
    await i18n.changeLanguage(language);setError('');const id=current.current?.id;if(!id)return;
    setSaving(true);
    serial.current=serial.current.catch(()=>{}).then(async()=>{if(current.current?.id===id)await save(language,id);}).catch(e=>setError(messageOf(e))).finally(()=>setSaving(false));
    await serial.current;
  }
  return <Preferences.Provider value={{choose,saving,error}}>{children}</Preferences.Provider>;
}
export function LanguageToggle(){const{language,t,msg}=useI18n();const{choose,saving,error}=useContext(Preferences);return <div className="auth-language"><div role="group" aria-label={t('Language')}><button type="button" lang="en" aria-pressed={language==='en'} disabled={saving} onClick={()=>void choose('en')}>EN</button><span aria-hidden="true">/</span><button type="button" lang="zh-CN" aria-pressed={language==='zh-CN'} disabled={saving} onClick={()=>void choose('zh-CN')}>中文</button></div>{error&&<p role="alert">{msg(error)}</p>}</div>;}
export function SettingsPage(){
  const{user,loading}=useContext(Auth);const{language,t,msg}=useI18n();const{choose,saving,error}=useContext(Preferences);const navigate=useNavigate();
  useEffect(()=>{if(!loading&&!user)navigate('/login?next=/me/settings',{replace:true});},[loading,user,navigate]);
  if(loading||!user)return <div className="loading">{t('Loading your account…')}</div>;
  return <div className="narrow-page settings-page"><Link className="back-link" to="/me"><ArrowLeft size={16}/>{t('Profile')}</Link><div className="page-heading"><h1>{t('Settings')}</h1></div><h2>{t('Language')}</h2><p className="section-description">{t('Choose your display language. Your account remembers it across devices.')}</p><div className="language-options" role="group" aria-label={t('Language')}>{([{code:'en',label:'English'},{code:'zh-CN',label:'简体中文'}] as const).map(item=><button key={item.code} lang={item.code} aria-pressed={language===item.code} disabled={saving} onClick={()=>void choose(item.code)}><span>{item.label}</span>{language===item.code&&<Check size={20}/>}</button>)}</div>{saving&&<p role="status">{t('Saving language preference…')}</p>}{error&&<div className="notice" role="alert">{msg(error)}<button onClick={()=>void choose(language)}>{t('Retry')}</button></div>}</div>;
}
