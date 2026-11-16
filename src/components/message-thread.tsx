'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {api,ApiError,send} from '@/lib/api';
import {Field} from './ui';
type Row=Record<string,unknown>;
type Payload={body:string;internal:boolean;file_ids:string[];reply_to?:string};
type Draft={body:string;internal:boolean;existing:string[];replyTo:string;upload:File|null;fingerprint:string;signature:string};
type Prepared={id:string;name:string;context:string;fingerprint:string;internal:boolean};
type Attempt={key:string;context:string;payload:Payload;signature:string;previouslyUncertain:boolean};
export default function MessageThread({thread,admin}:{thread:Row;admin:boolean}){
 const threadId=String(thread.id),orgId=String(thread.org_id),projectId=String(thread.project_id||''),context=JSON.stringify([threadId,orgId,projectId,admin]);
 const [messages,setMessages]=useState<Row[]>([]),[files,setFiles]=useState<Row[]>([]),[error,setError]=useState(''),[connectionError,setConnectionError]=useState(''),[fileError,setFileError]=useState(''),[filesLoading,setFilesLoading]=useState(false),[status,setStatus]=useState('Connecting…'),[sendStatus,setSendStatus]=useState(''),[search,setSearch]=useState(''),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[rejected,setRejected]=useState(false),[prepared,setPrepared]=useState<Prepared|null>(null);
 const formRef=useRef<HTMLFormElement>(null),activeContext=useRef(context),generation=useRef(0),sending=useRef(false),preparedRef=useRef<Prepared|null>(null),attemptRef=useRef<Attempt|null>(null),sendKey=useRef<string|null>(null);
 const refresh=useCallback(async()=>{const version=generation.current;try{const rows=await api<Row[]>('/conversations/'+threadId+'/messages');if(activeContext.current!==context||generation.current!==version)return;setMessages(rows);setStatus('Connected · refreshes every four seconds');setConnectionError('')}catch(e){if(activeContext.current!==context||generation.current!==version)return;setStatus('Connection interrupted · reconnecting automatically');setConnectionError((e as Error).message)}},[context,threadId]);
 const loadFiles=useCallback(async()=>{const version=generation.current;setFilesLoading(true);try{const rows=await api<Row[]>('/files');if(activeContext.current!==context||generation.current!==version)return;setFiles(rows);setFileError('')}catch(e){if(activeContext.current!==context||generation.current!==version)return;setFiles([]);setFileError((e as Error).message)}finally{if(activeContext.current===context&&generation.current===version)setFilesLoading(false)}},[context]);
 useEffect(()=>{activeContext.current=context;generation.current++;sending.current=false;preparedRef.current=null;attemptRef.current=null;sendKey.current=null;setPrepared(null);setMessages([]);setFiles([]);setError('');setConnectionError('');setFileError('');setSendStatus('');setUncertain(false);setRejected(false);setBusy(false);formRef.current?.reset();void refresh();void loadFiles();const timer=setInterval(refresh,4000);return()=>{clearInterval(timer);generation.current++}},[context,refresh,loadFiles]);
 async function draftFrom(data:FormData):Promise<Draft>{
  const body=String(data.get('body')||''),internal=data.get('internal')==='on',existing=[...new Set(data.getAll('files').map(String))].sort(),replyTo=String(data.get('reply_to')||''),selected=data.get('upload'),upload=selected instanceof File&&selected.size?selected:null;
  let fingerprint='';if(upload){if(upload.size>10*1024*1024)throw Error('Choose an attachment no larger than 10 MB.');const digest=await crypto.subtle.digest('SHA-256',await upload.arrayBuffer());fingerprint=JSON.stringify([upload.name,upload.type,upload.size,upload.lastModified,Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')])}
  return {body,internal,existing,replyTo,upload,fingerprint,signature:JSON.stringify([body,internal,existing,replyTo,fingerprint])};
 }
 async function withSend(task:(current:()=>boolean)=>Promise<void>){
  if(sending.current||activeContext.current!==context)return;sending.current=true;setBusy(true);setError('');setSendStatus('');setRejected(false);const version=generation.current,current=()=>activeContext.current===context&&generation.current===version;
  try{await task(current)}catch(e){if(current())setError((e as Error).message)}finally{if(current()){sending.current=false;setBusy(false)}}
 }
 async function postAttempt(attempt:Attempt,currentSignature:string|undefined,current:()=>boolean){
  if(!current()||attempt.context!==context)return;
  try{
   const saved=await api<{id:string;replayed?:boolean;message?:string}>('/conversations/'+threadId+'/messages',{method:'POST',body:send({...attempt.payload,idempotency_key:attempt.key})});
   if(!current())return;if(!saved.id)throw Error('The saved message could not be confirmed.');
   attemptRef.current=null;sendKey.current=null;setUncertain(false);setRejected(false);
   if(currentSignature===attempt.signature){formRef.current?.reset();preparedRef.current=null;setPrepared(null);setSendStatus(saved.replayed?'Earlier message confirmed. No duplicate was created.':'Message saved.')}else setSendStatus('Earlier message confirmed. Your newer edits are still an unsent draft.');
   await refresh();
  }catch(e){
   if(current()){
    if(!attempt.previouslyUncertain&&e instanceof ApiError&&[400,401,403,404].includes(e.status)){
     attemptRef.current=null;setUncertain(false);setRejected(true);
    }else{attempt.previouslyUncertain=true;setUncertain(true);setRejected(false)}
   }
   throw e;
  }
 }
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();if(sending.current)return;const data=new FormData(e.currentTarget);
  await withSend(async current=>{
   const draft=await draftFrom(data);if(!current())return;
   if(attemptRef.current){if(draft.signature!==attemptRef.current.signature)throw Error('An earlier send is unresolved. Confirm it with “Retry last send unchanged” before sending your edits.');await postAttempt(attemptRef.current,draft.signature,current);return}
   const ids=new Set(draft.existing);const cached=preparedRef.current;
   if(draft.upload){
    if(cached?.context===context&&cached.fingerprint===draft.fingerprint&&cached.internal&&!draft.internal)throw Error('This attachment was prepared for an internal note. Remove the prepared attachment before choosing a public upload.');
    if(cached?.context===context&&cached.fingerprint===draft.fingerprint&&cached.internal===draft.internal)ids.add(cached.id);
    else{
     if(ids.size>=10)throw Error('Choose at most ten attachments, including the new upload.');
     const upload=new FormData();upload.set('org_id',orgId);upload.set('internal',String(draft.internal));if(projectId)upload.set('project_id',projectId);upload.set('file',draft.upload);
     let file:{id:string;name?:string};try{file=await api('/files',{method:'POST',body:upload})}catch(e){if(e instanceof ApiError&&[400,401,403,404].includes(e.status))throw Error('Attachment upload was rejected. No message was sent. '+e.message);throw Error('Attachment upload was not confirmed. No message was sent. Reload available files before retrying an uncertain upload. '+(e as Error).message)}
     if(!current())return;if(!file||typeof file.id!=='string'||!file.id.trim())throw Error('The uploaded attachment reference could not be confirmed. No message was sent. Reload available files before retrying.');const next={id:file.id,name:file.name||draft.upload.name,context,fingerprint:draft.fingerprint,internal:draft.internal};preparedRef.current=next;setPrepared(next);ids.add(file.id);
    }
   }
   if(ids.size>10)throw Error('Choose at most ten attachments.');
   const attempt:Attempt={key:sendKey.current||crypto.randomUUID(),context,payload:{body:draft.body,internal:draft.internal,file_ids:[...ids].sort(),...draft.replyTo?{reply_to:draft.replyTo}:{}},signature:draft.signature,previouslyUncertain:false};sendKey.current=attempt.key;attemptRef.current=attempt;await postAttempt(attempt,draft.signature,current);
  });
 }
 async function retryUnchanged(){const attempt=attemptRef.current,form=formRef.current;if(!attempt||!form)return;const data=new FormData(form);await withSend(async current=>{let signature:string|undefined;try{signature=(await draftFrom(data)).signature}catch{}await postAttempt(attempt,signature,current)})}
 return <>
  <div className="toolbar"><label className="search">Search this conversation<input aria-label="Search conversation" value={search} onChange={e=>setSearch(e.target.value)}/></label><p role="status">{status}</p></div>
  {connectionError&&<p role="alert" className="feedback error">{connectionError} <button className="text-link" onClick={()=>void refresh()}>Reconnect</button></p>}
  {error&&<p role="alert" className="feedback error">{error} Your message text is preserved.</p>}{sendStatus&&<p role="status" className="feedback success">{sendStatus}</p>}
  {rejected&&<p role="status" className="feedback warning">The request was rejected before the message was saved. Your draft and prepared attachment are kept. Correct the error or sign in again before retrying.</p>}
  {uncertain&&<div className="feedback warning" role="status"><p>The send has not been confirmed. Check the conversation, then retry the last send unchanged. Your draft and prepared attachment are retained; editing does not start a new message.</p><button type="button" className="button secondary" disabled={busy} onClick={()=>void retryUnchanged()}>Retry last send unchanged</button></div>}
  <div className="live-message-thread" aria-live="polite">{messages.filter(m=>String(m.body).toLowerCase().includes(search.toLowerCase())).map(m=><article key={String(m.id)} className={m.internal?'internal-message':''}><small>{String(m.author)} {m.internal?'· Internal note':''}</small>{Boolean(m.reply_to)&&<small>Reply to {String(messages.find(p=>p.id===m.reply_to)?.body||'an earlier message').slice(0,100)}</small>}<p>{String(m.body)}</p>{((m.file_ids||[]) as string[]).map(id=><p key={id}><a href={'/api/files/'+id+'/download'} target="_blank" rel="noreferrer">Download {String(files.find(f=>f.id===id)?.name||'attachment')}</a></p>)}<time>{new Date(String(m.created_at)).toLocaleString()}</time></article>)}{!messages.length&&<p>No messages yet. Share the context you have.</p>}</div>
  {filesLoading&&<p role="status">Loading available private files…</p>}{fileError&&<p role="alert" className="feedback error">Available files could not be loaded: {fileError}</p>}<button type="button" className="text-link" disabled={busy||filesLoading} onClick={()=>void loadFiles()}>Reload available files</button>
  <form ref={formRef} className="live-compose" onSubmit={submit}><fieldset disabled={busy}><legend>Compose a private workspace message</legend><Field label="Your message"><textarea required name="body" rows={3} maxLength={20000}/></Field><Field label="Reply to (optional)"><select name="reply_to"><option value="">New message</option>{messages.slice(-50).map(m=><option key={String(m.id)} value={String(m.id)}>{String(m.author)} · {String(m.body).slice(0,80)}</option>)}</select></Field><Field label="Attach an existing file"><select multiple name="files">{files.filter(f=>f.org_id===thread.org_id&&(!f.project_id||f.project_id===thread.project_id)).map(f=><option key={String(f.id)} value={String(f.id)}>{String(f.name)}{f.internal?' · Internal':''}</option>)}</select></Field><Field label="Upload attachment (optional)"><input type="file" name="upload" accept=".pdf,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.zip"/></Field>{admin&&<label className="checkbox"><input type="checkbox" name="internal"/>Internal note · message and newly uploaded attachments are hidden from customers.</label>}<button disabled={busy} className="button">{busy?'Saving message…':'Send message'}</button></fieldset><small>Attachments use authenticated downloads. Files are limited to 10 MB. Pending retry details stay only in this view; check saved history before leaving an uncertain send.</small></form>
  {prepared&&<div className="feedback" role="status"><p>Prepared private attachment: {prepared.name}. Retrying the same send reuses this stored file.</p><button type="button" disabled={busy} onClick={()=>{preparedRef.current=null;setPrepared(null);const input=formRef.current?.elements.namedItem('upload') as HTMLInputElement|null;if(input)input.value=''}}>Remove prepared attachment from this draft</button><small>This does not delete the stored file or remove it from any saved message.</small></div>}
 </>
}
