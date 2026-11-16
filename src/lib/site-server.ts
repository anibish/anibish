import {cache} from 'react';
import type {SiteData,SitePage,PublicService} from './site-types';

type FailureKind='timeout'|'network'|'upstream'|'rate_limited'|'http'|'invalid_response';
const attempts=2,timeoutMs=3500,retryDelayMs=200;
export class SiteUnavailableError extends Error{
 readonly name='SiteUnavailableError';
 constructor(readonly kind:FailureKind,readonly attempts:number,readonly status?:number){super('Published site content is temporarily unavailable.')}
}
function record(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value)}
function optionalStrings(value:Record<string,unknown>,keys:string[]){return keys.every(key=>value[key]===undefined||typeof value[key]==='string')}
function publishedSite(value:unknown):SiteData|null{
 if(!record(value)||'error'in value||!Array.isArray(value.pages))return null;
 const pages:SitePage[]=[];
 for(const page of value.pages){
  if(!record(page)||!['slug','title','kind'].every(key=>typeof page[key]==='string')||!record(page.content)||!record(page.seo))return null;
  if(!optionalStrings(page.seo,['title','description','canonical'])||(page.seo.noindex!==undefined&&typeof page.seo.noindex!=='boolean')||!optionalStrings(page.content,['headline','description','body','mode','email','phone']))return null;
  if(page.content.blocks!==undefined&&(!Array.isArray(page.content.blocks)||!page.content.blocks.every(block=>record(block)&&optionalStrings(block,['title','body','eyebrow','media_id','href','label']))))return null;
  if(page.content.links!==undefined&&(!Array.isArray(page.content.links)||!page.content.links.every(link=>record(link)&&typeof link.label==='string'&&typeof link.href==='string')))return null;
  pages.push({slug:page.slug as string,title:page.title as string,kind:page.kind as string,content:page.content,seo:page.seo});
 }
 const site:SiteData={pages};
 if(value.services!==undefined){
  if(!Array.isArray(value.services))return null;
  const services:PublicService[]=[];
  for(const service of value.services){
   if(!record(service)||!['slug','title','category','description','pricing_model'].every(key=>typeof service[key]==='string')||!record(service.data))return null;
   services.push({slug:service.slug as string,title:service.title as string,category:service.category as string,description:service.description as string,pricing_model:service.pricing_model as string,data:service.data});
  }
  site.services=services;
 }
 if(value.features!==undefined){if(!record(value.features)||typeof value.features.admin!=='boolean'||typeof value.features.customer!=='boolean')return null;site.features={admin:value.features.admin,customer:value.features.customer}}
 if(value.redirects!==undefined){
  if(!Array.isArray(value.redirects))return null;
  const redirects:NonNullable<SiteData['redirects']>=[];
  for(const redirect of value.redirects){if(!record(redirect)||typeof redirect.source!=='string'||typeof redirect.destination!=='string'||!Number.isInteger(redirect.status)||![301,302,307,308].includes(redirect.status as number))return null;redirects.push({source:redirect.source,destination:redirect.destination,status:redirect.status as number})}
  site.redirects=redirects;
 }
 return site;
}
// Injected transport/deadline keep failure and freshness checks independent of a live API.
export async function fetchPublishedSite(options:{fetcher?:typeof fetch;deadlineMs?:number;wait?:(milliseconds:number)=>Promise<void>}={}):Promise<SiteData>{
 const fetcher=options.fetcher||fetch,wait=options.wait||((milliseconds:number)=>new Promise<void>(resolve=>setTimeout(resolve,milliseconds)));
 for(let attempt=1;attempt<=attempts;attempt++){
  try{
   const response=await fetcher((process.env.API_INTERNAL_URL||'http://127.0.0.1:3001')+'/public/site',{cache:'no-store',credentials:'omit',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(options.deadlineMs??timeoutMs)});
   if(!response.ok){
    void response.body?.cancel().catch(()=>{});
    throw new SiteUnavailableError(response.status===429?'rate_limited':response.status===408?'timeout':response.status>=500?'upstream':'http',attempt,response.status);
   }
   let body:unknown;try{body=await response.json()}catch(error){if(['AbortError','TimeoutError'].includes((error as Error).name))throw error;if(error instanceof TypeError)throw new SiteUnavailableError('network',attempt);throw new SiteUnavailableError('invalid_response',attempt)}
   const site=publishedSite(body);if(!site)throw new SiteUnavailableError('invalid_response',attempt);
   return site;
  }catch(error){
   const failure=error instanceof SiteUnavailableError?error:new SiteUnavailableError(['AbortError','TimeoutError'].includes((error as Error).name)?'timeout':'network',attempt);
   // A rate-limit rejection or permanent protocol/4xx error must not trigger a burst of retries.
   if(attempt===attempts||!['timeout','network','upstream'].includes(failure.kind))throw failure;
   await wait(retryDelayMs);
  }
 }
 throw new SiteUnavailableError('network',attempts);
}
// React cache shares metadata/body work only within this render. No previous publication snapshot is retained.
export const getSite=cache(()=>fetchPublishedSite());
