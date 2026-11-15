import {NextRequest,NextResponse} from 'next/server';
export async function proxy(request:NextRequest){
 try{
  const response=await fetch((process.env.API_INTERNAL_URL||'http://127.0.0.1:3001')+'/public/redirects',{cache:'no-store',signal:AbortSignal.timeout(800)});
  if(response.ok){const redirects=await response.json() as {source:string;destination:string;status:number}[];const target=redirects.find(r=>r.source===request.nextUrl.pathname);if(target&&/^\/(?!\/)/.test(target.destination)&&[301,302,307,308].includes(target.status))return NextResponse.redirect(new URL(target.destination,request.url),target.status)}
 }catch{}
 return NextResponse.next();
}
export const config={matcher:['/((?!api|_next|assets|icon.svg|favicon.ico|robots.txt|sitemap.xml).*)']};
