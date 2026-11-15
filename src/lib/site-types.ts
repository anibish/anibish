export type ContentBlock={title?:string;body?:string;eyebrow?:string;media_id?:string;href?:string;label?:string};
export type SitePage={slug:string;title:string;kind:string;content:{headline?:string;description?:string;body?:string;mode?:string;blocks?:ContentBlock[];links?:{label:string;href:string}[];email?:string;phone?:string;[key:string]:unknown};seo:{title?:string;description?:string;canonical?:string;noindex?:boolean}};
export type PublicService={slug:string;title:string;category:string;description:string;pricing_model:string;data:Record<string,unknown>};
export type SiteData={pages:SitePage[];services?:PublicService[];redirects?:{source:string;destination:string;status:number}[]};
