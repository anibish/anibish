import { notFound } from 'next/navigation';
import { allRoutes } from '@/lib/data';
import Studio from '@/components/studio';
export function generateStaticParams(){return allRoutes.map(route=>({slug:route.split('/').filter(Boolean)}))}
export default async function Page({params}:{params:Promise<{slug?:string[]}>}){const {slug=[]}=await params;const path='/'+slug.join('/');if(!allRoutes.includes(path))notFound();return <Studio path={path}/>}
