'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {api,send} from '@/lib/api';
import type {SitePage} from '@/lib/site-types';
import {portfolioItem} from '@/lib/portfolio';
import {PortfolioCaseStudy} from './portfolio-showcase';
import {confirmAction} from './action-feedback';
import {Badge,Modal} from './ui';

type Page=SitePage&{id:string;state:string;revision:number;content_hash:string;source_count:number;source_completed_count:number;saved_changes_not_live?:boolean};
type Coverage={counts:{completed_orders:number;cancelled_orders:number;github_repositories:number;published_portfolio:number;completed_orders_with_published_portfolio:number;completed_orders_with_draft:number;completed_orders_with_archived_portfolio?:number;completed_orders_unlinked:number};pages:Page[];notice:string};
type Receipt={published:number;already_published:number;replayed:boolean;message:string};
export default function PortfolioPublication(){
 const [data,setData]=useState<Coverage|null>(null),[query,setQuery]=useState(''),[view,setView]=useState('draft'),[selected,setSelected]=useState<string[]>([]),[preview,setPreview]=useState<Page|null>(null),[reviewed,setReviewed]=useState(false),[rights,setRights]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 const lock=useRef(false),retry=useRef<{reference:string;entries:{id:string;expected_revision:number;expected_content_hash:string}[]}|null>(null);
 const fetchCoverage=useCallback(async()=>{const result=await api<Coverage>('/portfolio-sources/coverage');setData(result);return result},[]);
 useEffect(()=>{let alive=true;void fetchCoverage().catch(e=>{if(alive)setError((e as Error).message)});return()=>{alive=false}},[fetchCoverage]);
 const resetApproval=()=>{setReviewed(false);setRights(false);retry.current=null};
 const rows=(data?.pages||[]).filter(p=>(view==='all'||p.state===view)&&(p.title+' '+p.slug+' '+String(p.content.description||'')).toLowerCase().includes(query.toLowerCase()));
 const drafts=rows.filter(p=>p.state==='draft'),selectedRows=(data?.pages||[]).filter(p=>p.state==='draft'&&selected.includes(p.id));
 async function reload(){if(lock.current)return;lock.current=true;setBusy('Reloading saved coverage…');setError('');try{await fetchCoverage();setSelected([]);resetApproval();setMessage('Coverage reloaded. Review the current drafts before approving publication.')}catch(e){setError((e as Error).message+' Existing rows remain visible. Retry reloading before making a publication decision.')}finally{lock.current=false;setBusy('')}}
 function choose(ids:string[]){if(lock.current)return;setSelected(ids);resetApproval();setMessage('')}
 async function publish(){
  if(lock.current||!reviewed||!rights||!selectedRows.length)return;
  if(!await confirmAction(`Publish these ${selectedRows.length} exact draft descriptions on the public website? Private source evidence stays private. This does not establish a count of unique projects.`))return;
  if(lock.current)return;lock.current=true;setBusy('Publishing the reviewed selection…');setError('');setMessage('');
  const entries=selectedRows.map(p=>({id:p.id,expected_revision:p.revision,expected_content_hash:p.content_hash})).sort((a,b)=>a.id.localeCompare(b.id));
  if(!retry.current||JSON.stringify(retry.current.entries)!==JSON.stringify(entries))retry.current={reference:crypto.randomUUID(),entries};
  try{
   const result=await api<Receipt>('/portfolio-sources/publish-batch',{method:'POST',body:send({client_reference:retry.current.reference,entries:retry.current.entries,publication_rights_confirmed:true,content_review_confirmed:true})});
   setMessage(result.message);setSelected([]);resetApproval();
   try{await fetchCoverage()}catch{setError('Publication was confirmed, but the list could not be refreshed. Reload saved coverage before publishing another selection.')}
  }catch(e){setError((e as Error).message+' Your selection is preserved. If the connection was interrupted, retry this same selection or reload saved coverage to confirm its state. A changed draft requires fresh review.')}
  finally{lock.current=false;setBusy('')}
 }
 const counts=data?.counts;
 return <section className="portfolio-publication section" aria-busy={Boolean(busy)}>
  <span className="eyebrow">SOURCE COVERAGE / PUBLICATION DECISIONS</span><h2>Account for the work.</h2>
  <p>Repository records, completed orders and published portfolio entries are different counts. Related orders may belong to a collection; an unresolved delivery record is not automatically a unique project.</p>
  {counts&&<dl className="portfolio-coverage-grid">{[['Completed Fiverr orders',counts.completed_orders],['Orders covered by public entries',counts.completed_orders_with_published_portfolio],['Orders linked to private drafts',counts.completed_orders_with_draft],['Orders awaiting an association',counts.completed_orders_unlinked],['GitHub repositories inventoried',counts.github_repositories],['Published portfolio entries',counts.published_portfolio]].map(([label,value])=><div className="panel" key={String(label)}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
  {counts&&<p className="source-note">{counts.cancelled_orders} cancelled orders are excluded from the completed total. Source clearance flags and approval of a particular public description have separate scopes.</p>}
  <div className="form-actions"><button className="button secondary" disabled={Boolean(busy)} onClick={()=>void reload()}>Reload saved coverage</button><a className="text-link" href="/work" target="_blank" rel="noreferrer">Open public work</a></div>
  {busy&&<p role="status" aria-live="polite">{busy}</p>}{message&&<p role="status" className="feedback success">{message}</p>}{error&&<p role="alert" className="feedback error">{error}</p>}{!data&&!error&&<p role="status">Loading private portfolio coverage…</p>}
  {data&&<>
   <div className="two-column"><label>Search portfolio decisions<input disabled={Boolean(busy)} value={query} onChange={e=>setQuery(e.target.value)}/></label><label>Publication view<select disabled={Boolean(busy)} value={view} onChange={e=>setView(e.target.value)}><option value="draft">Private drafts</option><option value="published">Published entries</option><option value="archived">Archived entries</option><option value="all">All entries</option></select></label></div>
   <p>{rows.length} matching entries · {selectedRows.length} selected drafts</p>
   {drafts.length>0&&<div className="form-actions"><button className="button secondary" disabled={Boolean(busy)} onClick={()=>choose([...new Set([...selected,...drafts.map(p=>p.id)])])}>Select matching drafts</button><button className="text-link" disabled={Boolean(busy)||!selected.length} onClick={()=>choose([])}>Clear selection</button></div>}
   <div className="portfolio-decision-list">{rows.map(p=><article className="panel" data-portfolio-id={p.id} data-portfolio-slug={p.slug} key={p.id}>
    <div className="form-actions">{p.state==='draft'?<label className="checkbox"><input type="checkbox" disabled={Boolean(busy)} checked={selected.includes(p.id)} onChange={e=>choose(e.target.checked?[...selected,p.id]:selected.filter(id=>id!==p.id))}/><strong>{p.title}</strong></label>:<h3>{p.title}</h3>}<Badge>{p.state}</Badge></div>
    <p>{String(p.content.description||'No introduction is saved.')}</p><p className="source-note">Revision {p.revision} · {p.source_completed_count} completed order references · {p.source_count} private source references{p.saved_changes_not_live?' · Saved changes are not yet public':''}</p>
    <button className="button secondary small" disabled={Boolean(busy)} onClick={()=>setPreview(p)}>Preview exact public description</button>
   </article>)}</div>
   {!rows.length&&<div className="empty-state"><h3>{view==='draft'?'No private drafts match this view.':'No portfolio entries match this view.'}</h3><p>{counts?.completed_orders_unlinked?'Unassociated orders remain in the private source inventory. Import reviewed draft proposals before making a publication decision.':'Change the search or publication view to inspect the saved records.'}</p></div>}
   <div className="soft-panel form-card"><h3>Approve the selected descriptions.</h3><p>Read the exact draft previews and confirm confidentiality/publicity rights. This approval covers the selected public descriptions; it does not release private repositories, order messages, original evidence or client files.</p>
    <label className="checkbox"><input type="checkbox" disabled={Boolean(busy)||!selectedRows.length} checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I reviewed the exact selected descriptions, their evidence limits and order grouping.</label>
    <label className="checkbox"><input type="checkbox" disabled={Boolean(busy)||!selectedRows.length} checked={rights} onChange={e=>setRights(e.target.checked)}/>I confirm publication rights and privacy clearance for these selected public descriptions.</label>
    <button className="button" disabled={Boolean(busy)||!selectedRows.length||!reviewed||!rights} onClick={()=>void publish()}>{busy==='Publishing the reviewed selection…'?'Publishing…':`Publish ${selectedRows.length} reviewed drafts`}</button>
   </div>
  </>}
  {preview&&<Modal title="Exact portfolio publication preview" onClose={()=>setPreview(null)}><p className="source-note">Private preview · saved revision {preview.revision}. Source references remain private. Approval is recorded only when the selected draft is published.</p><PortfolioCaseStudy slug={preview.slug.replace(/^portfolio\//,'')} previewItem={portfolioItem(preview)}/></Modal>}
 </section>;
}
