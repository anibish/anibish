import type {MetadataRoute} from 'next';
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:'*',allow:'/',disallow:['/admin','/dashboard','/client','/api/','/account','/checkout','/design-system']},sitemap:'https://anibish.com/sitemap.xml',host:'https://anibish.com'}}
