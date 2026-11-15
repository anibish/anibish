import type {FastifyRequest} from 'fastify';
export type Actor={id:string;email:string;name:string;global_role:string|null;org_id:string;role:string;mfa_enabled:boolean;mfa_verified:boolean};
export type DomainRow={id:string;org_id:string;[key:string]:unknown};
export interface DomainContext{actor:(request:FastifyRequest,domain?:string,write?:boolean)=>Promise<Actor>;staff:(actor:Actor)=>boolean;scope:(actor:Actor,offset?:number)=>{sql:string,args:unknown[]};getScoped:(table:string,id:string,actor:Actor)=>Promise<DomainRow>;audit:(actor:Actor,action:string,resource:string,detail?:unknown)=>Promise<void>;notify:(org:string,title:string,body:string)=>Promise<void>}
