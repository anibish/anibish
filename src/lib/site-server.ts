import {cache} from 'react';
import type {SiteData} from './site-types';
export const getSite=cache(async():Promise<SiteData>=>{try{const response=await fetch((process.env.API_INTERNAL_URL||'http://127.0.0.1:3001')+'/public/site',{cache:'no-store',signal:AbortSignal.timeout(2000)});if(response.ok)return response.json()}catch{}return {pages:[]}});
