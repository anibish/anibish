import type {FastifyInstance} from 'fastify';
import {pool} from './db';

type Report={untrusted_browser_report:true;route:string;directive:string;blocked_resource:string;source_resource:string;disposition:string;line:number|null;column:number|null};
const directives=new Set(['default-src','script-src','script-src-elem','script-src-attr','style-src','style-src-elem','style-src-attr','img-src','font-src','connect-src','object-src','base-uri','form-action','frame-ancestors','worker-src','manifest-src','media-src','frame-src']);
function object(value:unknown):Record<string,unknown>|null{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;}
function location(value:unknown,origin:string){if(typeof value!=='string')return 'unknown';if(['inline','eval','data','blob'].includes(value))return value;try{return new URL(value,origin).origin===origin?'same-origin':'external-origin'}catch{return 'unknown'}}
function route(path:string){if(['/', '/login','/register','/recover','/account','/contact','/request-quote','/about','/portfolio','/reviews','/services','/awards'].includes(path))return path;for(const prefix of['/admin','/dashboard','/portfolio','/services','/blog','/legal'])if(path.startsWith(prefix+'/'))return prefix+'/*';return 'other-first-party-page';}
// Browser telemetry is attacker-controlled. Never retain URLs, queries, snippets,
// policy nonces, referrers, email addresses or arbitrary report body properties.
export function sanitizeCspReport(value:unknown,publicOrigin:string):Report[]{
 const origin=new URL(publicOrigin).origin;
 const items=Array.isArray(value)?value.slice(0,4):[value];const result:Report[]=[];
 for(const item of items){const wrapper=object(item);if(!wrapper)continue;const report=object(wrapper['csp-report'])||(wrapper.type==='csp-violation'?object(wrapper.body):null);if(!report)continue;
  const document=report['document-uri']??report.documentURL;if(typeof document!=='string')continue;let url:URL;try{url=new URL(document)}catch{continue}if(url.origin!==origin)continue;
  const directive=String(report['effective-directive']??report.effectiveDirective??'');if(!directives.has(directive))continue;
  const number=(v:unknown)=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=10000000?v:null;
  result.push({untrusted_browser_report:true,route:route(url.pathname),directive,blocked_resource:location(report['blocked-uri']??report.blockedURL,origin),source_resource:location(report['source-file']??report.sourceFile,origin),disposition:report.disposition==='report'?'report':'enforce',line:number(report['line-number']??report.lineNumber),column:number(report['column-number']??report.columnNumber)});
 }
 return result;
}
export function registerPrivateApiCaching(app:FastifyInstance){app.addHook('onSend',async(_req,reply,payload)=>{reply.header('Cache-Control','private, no-store').header('Pragma','no-cache');return payload});}
export function registerCspReports(app:FastifyInstance,save:(detail:Report)=>Promise<void>=async detail=>{await pool.query("INSERT INTO security_events(event,detail) VALUES('csp_violation',$1)",[JSON.stringify(detail)])}){
 app.addContentTypeParser(['application/csp-report','application/reports+json'],{parseAs:'string',bodyLimit:8192},(_req,body,done)=>{try{done(null,JSON.parse(String(body)))}catch{done(Object.assign(new Error('Invalid security report.'),{statusCode:400}))}});
 app.post('/security/csp-report',{bodyLimit:8192,config:{rateLimit:{max:12,timeWindow:60000}}},async(req,reply)=>{
  const reports=sanitizeCspReport(req.body,process.env.PUBLIC_ORIGIN||'http://localhost:3000');
  if(!reports.length)return reply.code(400).send({error:'No supported first-party security report.'});
  for(const report of reports)await save(report);
  return reply.code(204).send();
 });
}
