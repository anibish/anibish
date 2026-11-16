export type AccountActionKind='verify'|'reset'|'invitation';
const tokenPattern=/^[a-f0-9]{64}$/;
const kinds=new Set<AccountActionKind>(['verify','reset','invitation']);

export function accountActionHref(token:string,kind:AccountActionKind):string {
 if(!tokenPattern.test(token))return '/account';
 return '/account#'+new URLSearchParams({token,kind}).toString();
}

function action(url:URL){
 const fragment=new URLSearchParams(url.hash.slice(1)),query=url.searchParams;
 const candidates=[...fragment.getAll('token'),...fragment.getAll('invite'),...query.getAll('token'),...query.getAll('invite')];
 const invited=fragment.has('invite')||query.has('invite');
 const modes=[...fragment.getAll('kind'),...query.getAll('kind')];
 const kind=invited?'invitation':modes[0]||'';
 const valid=candidates.length===1&&tokenPattern.test(candidates[0])&&kinds.has(kind as AccountActionKind)&&modes.length<=1;
 return {token:valid?candidates[0]:'',kind:valid?kind as AccountActionKind:'',invalid:candidates.length>0&&!valid};
}

/** Legacy query links still work, but are removed from browser history after hydration. */
export function readAccountLocation(value:string){
 const url=new URL(value),fragment=new URLSearchParams(url.hash.slice(1)),current=action(url);
 let next=fragment.get('next')||url.searchParams.get('next')||'';
 if(next.startsWith('/account?')||next.startsWith('/account#')){
  const destination=new URL(next,url.origin),invitation=action(destination);
  next=invitation.kind==='invitation'?accountActionHref(invitation.token,'invitation'):'';
 }
 // Return paths are authorized against the signed-in role by the caller.
 if(!next.startsWith('/')||next.startsWith('//')||/[\r\n\\]/.test(next))next='';
 const sensitiveFragment=['token','invite','next'].some(key=>fragment.has(key));
 const redacted=new URL(url);
 for(const key of ['token','invite','next'])redacted.searchParams.delete(key);
 if(sensitiveFragment)redacted.hash='';
 return {...current,next,redactedPath:redacted.pathname+redacted.search+redacted.hash};
}
