import type {MetadataRoute} from 'next';
import {publicRoutes} from '@/lib/data';
export default function sitemap():MetadataRoute.Sitemap{return publicRoutes.filter(p=>!['/login','/register','/forgot-password','/account','/checkout','/design-system','/awards'].includes(p)).map(p=>({url:'https://anibish.com'+(p==='/'?'':p),changeFrequency:'monthly',priority:p==='/'?1:0.7}))}
