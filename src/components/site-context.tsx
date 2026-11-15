'use client';
import {createContext,useContext} from 'react';
import type {SiteData} from '@/lib/site-types';
import {services,type Review} from '@/lib/data';
const SiteContext=createContext<SiteData>({pages:[]});
export function SiteProvider({initial,children}:{initial:SiteData;children:React.ReactNode}){return <SiteContext.Provider value={initial}>{children}</SiteContext.Provider>}
export function useSite(){return useContext(SiteContext)}
export function useSitePage(slug:string){return useSite().pages.find(p=>p.slug===slug)}
export function safeLink(value:string){return /^(\/(?!\/)|https:\/\/|mailto:|tel:)/.test(value)?value:'/contact'}

export function useServices(){const site=useSite();return site.services===undefined?services:site.services.map(s=>({slug:s.slug,title:s.title,category:s.category,description:s.description,tagline:String(s.data.tagline||s.title),icon:String(s.data.icon||'Sparkles'),price:String(s.data.display_price||'Custom quote'),kind:s.pricing_model==='quote'?'Quotation':'Fixed scope'}));}

export function useReviews():Review[]{return useSite().pages.filter(p=>p.kind==='review').map(p=>({id:Number(p.content.source_number||0),handle:p.title,country:'Client feedback',quote:String(p.content.body||''),tag:String(p.content.category||'Engineering'),excerpt:p.content.excerpt===true,featured:p.content.featured===true,service_slug:String(p.content.service_slug||''),project_slug:String(p.content.project_slug||''),source:p.content.platform_verified===true?String(p.content.platform):'Not specified',rating:p.content.rating==null?undefined:Number(p.content.rating)}));}
