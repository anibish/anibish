import {notFound,permanentRedirect,redirect} from 'next/navigation';
import {allRoutes} from '@/lib/data';
import {getSite} from '@/lib/site-server';
import {SiteProvider} from '@/components/site-context';
import Studio from '@/components/studio';
import type {Metadata} from 'next';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{slug?:string[]}>}):Promise<Metadata>{const {slug=[]}=await params;const path='/'+slug.join('/'),site=await getSite(),page=site.pages.find(p=>p.slug===(slug.join('/')||'home'));const label=page?.seo?.title||(slug.length?slug.at(-1)!.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' '):'Anil Bishnoi — AI & Software Engineering Studio');return {title:label,description:page?.seo?.description||'20+ years of software engineering. AI, web, mobile, education technology and architecture by Anil Bishnoi.',alternates:{canonical:page?.seo?.canonical||path},robots:{index:!/^\/(admin|dashboard|client|account|login|register|checkout|design-system)/.test(path)&&!page?.seo?.noindex,follow:true}}}
export default async function Page({params}:{params:Promise<{slug?:string[]}>}){const {slug=[]}=await params;const path='/'+slug.join('/'),site=await getSite();const target=site.redirects?.find(r=>r.source===path);if(target){if(target.status===301||target.status===308)permanentRedirect(target.destination);redirect(target.destination)}if(!allRoutes.includes(path)&&!site.pages.some(p=>p.slug===slug.join('/'))&&!site.services?.some(s=>path==='/services/'+s.slug))notFound();return <SiteProvider initial={site}><Studio path={path}/></SiteProvider>}
