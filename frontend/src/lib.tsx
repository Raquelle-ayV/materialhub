import { createContext } from 'react';
import { ApiError, type Language } from './i18n';
export type User = { id:number; username:string; balance:number; held:number; available:number; language:Language|null };
export async function api<T>(path:string, body?:unknown):Promise<T> {
  const res = await fetch(`/api${path}`, body === undefined ? {credentials:'same-origin'} : {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data = await res.json();
  if (!res.ok) throw new ApiError(data);
  return data;
}
export const Auth = createContext<{user:User|null; loading:boolean; setUser:(user:User|null)=>void}>({user:null,loading:true,setUser:()=>{}});
