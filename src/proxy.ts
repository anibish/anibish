import {NextRequest,NextResponse} from 'next/server';
export async function proxy(request:NextRequest){
 const nonce=Buffer.from(crypto.randomUUID()).toString('base64');
 const production=process.env.NODE_ENV==='production';
 const policy=["default-src 'self'",`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${production?'':" 'unsafe-eval'"}`,"style-src 'self' 'unsafe-inline'","img-src 'self' data: blob:","font-src 'self'","connect-src 'self'","object-src 'none'","base-uri 'none'","form-action 'self'","frame-ancestors 'none'","report-uri /api/security/csp-report",...(production&&request.nextUrl.protocol==='https:'?['upgrade-insecure-requests']:[])].join('; ');
 const headers=new Headers(request.headers);
 // Next reads this request policy to nonce its own bootstrap and streamed scripts.
 // Overwrite incoming values: a client must never choose the response nonce.
 headers.set('x-nonce',nonce);headers.set('Content-Security-Policy',policy);
 const secure=(response:NextResponse)=>{response.headers.set('Content-Security-Policy',policy);return response};
 try{
  const response=await fetch((process.env.API_INTERNAL_URL||'http://127.0.0.1:3001')+'/public/redirects',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(800)});
  if(response.ok){const redirects=await response.json() as {source:string;destination:string;status:number}[];const target=redirects.find(r=>r.source===request.nextUrl.pathname);if(target&&/^\/(?!\/)/.test(target.destination)&&[301,302,307,308].includes(target.status))return secure(NextResponse.redirect(new URL(target.destination,request.url),target.status))}
 }catch{}
 return secure(NextResponse.next({request:{headers}}));
}
export const config={matcher:['/((?!api|_next|assets|icon.svg|favicon.ico|robots.txt|sitemap.xml).*)']};
