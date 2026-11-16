import type {MetadataRoute} from 'next';
import {publicRoutes} from '@/lib/data';
import {getSite} from '@/lib/site-server';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
 const site=await getSite(),settings=site.pages.find(p=>p.kind==='sitemap')?.content as {hidden_paths?:string[]}|undefined;
 const hidden=new Set(['/login','/register','/forgot-password','/account','/checkout','/design-system',...(settings?.hidden_paths||[])]);
 const paths=new Set(publicRoutes.filter(p=>!hidden.has(p)&&(!p.startsWith('/services/')||site.services===undefined)));
 for(const service of site.services||[])paths.add('/services/'+service.slug);
 for(const page of site.pages){if(['page','home','legal','blog','case_study','portfolio'].includes(page.kind)&&!page.seo?.noindex)paths.add(page.slug==='home'?'/':'/'+page.slug);if(page.seo?.noindex)paths.delete('/'+page.slug)}
 return [...paths].filter(p=>!hidden.has(p)).map(p=>({url:'https://anibish.com'+(p==='/'?'':p),changeFrequency:'monthly',priority:p==='/'?1:0.7}));
}
