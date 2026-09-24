import i18next from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import en from './locales/en.json';

export type Language = 'en' | 'zh-CN';
export type Message = string | {key:string;values?:Record<string,string|number|Message>};
export const LANGUAGE_KEY='rematerial.language';
export const isLanguage=(v:unknown):v is Language=>v==='en'||v==='zh-CN';
// English-only release; stored preferences remain available for a future rollout.
void i18next.use(initReactI18next).init({resources:{en:{translation:en}},lng:'en',fallbackLng:'en',supportedLngs:['en'],returnEmptyString:false,keySeparator:false,nsSeparator:false,interpolation:{escapeValue:false},initImmediate:false});
document.documentElement.lang='en';
document.title='Re:Material — Campus material sharing';
export default i18next;
export class ApiError extends Error {
  uiMessage:Message;
  constructor(data:{error?:string;error_key?:string;error_params?:Record<string,string|number>}){
    super(data.error || 'Something went wrong. Please try again.');
    this.uiMessage=this.message;
  }
}
export function messageOf(error:unknown):Message{return error instanceof ApiError?error.uiMessage:error instanceof Error?error.message:'Something went wrong. Please try again.';}
export function translateMessage(message:Message):string{
  if(!message)return '';
  const key=typeof message==='string'?message:message.key;
  const values=typeof message==='string'?{}:Object.fromEntries(Object.entries(message.values||{}).map(([k,v])=>[k,typeof v==='object'?translateMessage(v):v]));
  return String(i18next.t(key,{...values,lng:'en',defaultValue:key}));
}
export function useI18n(){const {t}=useTranslation();return {t:(key:string,values:Record<string,unknown>={})=>String(t(key,{...values,lng:'en',defaultValue:key})),msg:translateMessage,language:'en' as Language};}
// Application-owned validation follows the app language, not browser/OS settings.
export function validateForm(form:HTMLFormElement):Message|null{
  const input=Array.from(form.elements).find(el=>(el instanceof HTMLInputElement||el instanceof HTMLSelectElement||el instanceof HTMLTextAreaElement)&&!el.disabled&&!el.validity.valid) as HTMLInputElement|undefined;
  if(!input)return null;
  input.focus();const v=input.validity;
  if(v.valueMissing)return 'Please complete this required field.';
  if(v.typeMismatch)return 'Please enter a valid web address.';
  if(v.patternMismatch)return 'Use 3–24 letters, numbers or underscores for your username.';
  if(v.tooShort)return {key:'Please enter at least {{min}} characters.',values:{min:input.minLength}};
  if(v.tooLong)return {key:'Please enter no more than {{max}} characters.',values:{max:input.maxLength}};
  if(v.rangeUnderflow||v.rangeOverflow||v.stepMismatch||v.badInput)return 'Quantity must be a whole number between 1 and 1,000,000.';
  return 'Please check this field.';
}
