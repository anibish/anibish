'use client';
import {useRef,useState} from 'react';
import {api,send} from '@/lib/api';
import {confirmAction} from './action-feedback';
import {Field,Notice} from './ui';
type Row=Record<string,unknown>;
function explainFailure(error:unknown){return error instanceof TypeError||['AbortError','TimeoutError'].includes((error as Error).name)?'Connection interrupted. The result is uncertain. Reload saved records before retrying.':(error as Error).message}
export default function CmsTools(){
 const [tool,setTool]=useState(''),[rows,setRows]=useState<Row[]>([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[pending,setPending]=useState('');
 const locked=useRef(false);
 async function fetchRows(next=tool){setRows(await api<Row[]>(next==='media'?'/files':'/cms/redirects'))}
 async function load(next=tool){
  if(locked.current)return;locked.current=true;setPending('Loading saved records…');setError('');setMessage('');setTool(next);
  try{await fetchRows(next)}catch(e){setError(explainFailure(e))}finally{locked.current=false;setPending('')}
 }
 async function save(label:string,action:()=>Promise<unknown>,success:string,onSaved?:()=>void){
  if(locked.current)return;locked.current=true;setPending(label);setError('');setMessage('');
  try{
   await action();onSaved?.();setMessage(success);
   try{await fetchRows()}catch{setError('The change was saved, but the list could not be refreshed. Reload saved records before making another change.')}
  }catch(e){setError(explainFailure(e))}finally{locked.current=false;setPending('')}
 }
 const busy=Boolean(pending);
 return <div className="cms-tools">
  <div className="record-actions"><button className="button secondary small" disabled={busy} onClick={()=>void load('media')}>Media library</button><button className="button secondary small" disabled={busy} onClick={()=>void load('redirects')}>Redirect management</button>{tool&&<button className="text-link" disabled={busy} onClick={()=>setTool('')}>Close tools</button>}</div>
  {tool&&<section className="panel form-card" aria-busy={busy}>
   <h2>{tool==='media'?'A considered media library.':'Keep every link useful.'}</h2>
   {pending&&<p role="status" aria-live="polite">{pending}</p>}
   {error&&<div role="alert" className="feedback error">{error}<button className="text-link" disabled={busy} onClick={()=>void load()}>Reload saved records</button></div>}
   {message&&<p role="status" className="feedback success">{message}</p>}
   {tool==='media'?<>
    <Notice>Files are private by default. Public image delivery requires explicit confirmation of publication rights. Original review evidence remains private.</Notice>
    <form onSubmit={e=>{e.preventDefault();const form=e.currentTarget;void save('Uploading private media…',()=>api('/files',{method:'POST',body:new FormData(form)}),'Private media uploaded.',()=>form.reset())}}>
     <Field label="Upload private media"><input name="file" required type="file" accept=".png,.jpg,.jpeg,.webp,.pdf" disabled={busy}/></Field><button className="button small" disabled={busy}>Upload media</button>
    </form>
    <div className="table-wrap"><table><thead><tr><th>Media</th><th>Reference</th><th>Publication control</th></tr></thead><tbody>{rows.filter(r=>String(r.mime).startsWith('image/')||r.mime==='application/pdf').map(r=><tr key={String(r.id)}>
     <td><a target="_blank" rel="noreferrer" href={'/api/files/'+r.id+'/download'}>{String(r.name)}</a><small>{String(r.mime)} · {String(r.size)} bytes</small></td><td><code>{String(r.id)}</code><small>Use this reference in a page gallery.</small></td>
     <td><form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget),approved=f.get('action')==='approve';if(!approved&&!await confirmAction('Revoke public delivery for this media? Published pages using it may no longer display the image.'))return;await save('Saving media permission…',()=>api('/cms/media/'+r.id+'/approve',{method:'POST',body:send({publication_rights_confirmed:true,approved})}),'Media publication setting saved.')}}>
      <label className="checkbox"><input required type="checkbox" disabled={busy}/>I confirm publication rights for this file.</label><select name="action" disabled={busy} aria-label={'Publication action for '+r.name}><option value="approve">Approve public delivery</option><option value="revoke">Revoke public delivery</option></select><button className="button secondary small" disabled={busy}>Save media permission</button>
     </form></td>
    </tr>)}</tbody></table></div>
   </>:<>
    <form onSubmit={e=>{e.preventDefault();const form=e.currentTarget,f=new FormData(form);void save('Saving redirect…',()=>api('/cms/redirects',{method:'POST',body:send({source:f.get('source'),destination:f.get('destination'),status:Number(f.get('status'))})}),'Redirect saved.',()=>form.reset())}}>
     <fieldset disabled={busy}><legend>Redirect details</legend><div className="two-column"><Field label="Previous path"><input name="source" required placeholder="/old-page" pattern="/[a-z0-9/\-]*"/></Field><Field label="Destination path"><input name="destination" required placeholder="/services"/></Field></div><Field label="Redirect status"><select name="status"><option value="301">301 · Permanent</option><option value="302">302 · Temporary</option></select></Field><button className="button small">Save redirect</button></fieldset>
    </form>
    <div className="table-wrap"><table><thead><tr><th>Previous path</th><th>Destination</th><th>State</th><th>Actions</th></tr></thead><tbody>{rows.map(r=><tr key={String(r.id)}><td>{String(r.source)}</td><td>{String(r.destination)} · {String(r.status)}</td><td>{r.enabled?'Enabled':'Disabled'}</td><td>{Boolean(r.enabled)&&<button className="text-link" disabled={busy} onClick={async()=>{if(await confirmAction('Disable this redirect? Existing links may stop forwarding to the destination.'))await save('Disabling redirect…',()=>api('/cms/redirects/'+r.id,{method:'DELETE'}),'Redirect disabled.')}}>Disable redirect</button>}</td></tr>)}</tbody></table></div>
    <small>Privileged and API paths cannot be redirected. Destination paths stay on this site.</small>
   </>}
  </section>}
 </div>
}
