'use client';
import Image from 'next/image';
import type {SitePage} from '@/lib/site-types';
import {Button} from './ui';
import {safeLink} from './site-context';
export default function CmsRenderer({page}:{page:SitePage}){return <><div className="page-intro"><span className="eyebrow">{page.kind==='home'?'THE INDEPENDENT ENGINEERING STUDIO':page.kind.replaceAll('_',' ')}</span><h1 style={{whiteSpace:'pre-line'}}>{page.content.headline||page.title}</h1>{page.content.description&&<p>{page.content.description}</p>}</div><section className="section cms-content">{page.content.body&&<div className="cms-prose">{page.content.body.split('\n\n').map((p,i)=><p key={i}>{p}</p>)}</div>}{page.content.blocks?.map((b,i)=><article className="cms-content-block" key={i}>{b.eyebrow&&<span className="eyebrow">{b.eyebrow}</span>}{b.title&&<h2>{b.title}</h2>}{b.body&&<p style={{whiteSpace:'pre-line'}}>{b.body}</p>}{b.media_id&&<Image src={'/api/public/media/'+b.media_id} alt={b.title||'Project image'} width={1200} height={700} sizes="(max-width:760px) 90vw, 1200px" unoptimized/>}{b.href&&b.label&&<Button href={safeLink(b.href)} secondary>{b.label}</Button>}</article>)}</section></>}
