'use client';
import {useRef,useState} from 'react';

export default function SecureFileDownload({href,name,status}:{href:string;name:string;status?:string}){
 const active=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function download(){
  if(active.current)return;active.current=true;setBusy(true);setError('');
  try{
   const response=await fetch(href,{credentials:'same-origin',signal:AbortSignal.timeout(30000)});
   if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(body.error||'The download could not be authorized. Sign in again or retry after scanning.');}
   const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){setError(e instanceof TypeError||(e as Error).name==='TimeoutError'?'The download could not be confirmed. Check your connection and retry; the private original is preserved.':(e as Error).message);}
  finally{active.current=false;setBusy(false);}
 }
 return <span className="secure-file-download"><button type="button" className="button secondary small" disabled={busy} onClick={()=>void download()}>{busy?'Checking access and scan…':error?'Retry download':'Download '+name}</button>{status&&<small>Scan status: {status.replaceAll('_',' ')}. Files remain private unless separately approved for public use.</small>}<span className="sr-only" role="status">{busy?'Checking authorized file access and malware scan.':''}</span>{error&&<span role="alert" style={{display:'block',overflowWrap:'anywhere'}}>{error}</span>}</span>;
}
