'use client';
import {useTransition} from 'react';
import Link from 'next/link';
export default function ErrorPage({retry}:{retry:()=>void}){
 const [pending,startTransition]=useTransition();
 return <main className="error-page" aria-busy={pending}>
  <meta name="robots" content="noindex"/>
  <div role="alert"><span className="eyebrow">THIS VIEW IS TEMPORARILY UNAVAILABLE</span><h1>We couldn’t load this view.</h1><p>Something interrupted this page. Try again to request its latest content.</p></div>
  {pending&&<p role="status" aria-live="polite">Loading this view again…</p>}
  <div className="form-actions"><button className="button" disabled={pending} onClick={()=>startTransition(()=>retry())}>{pending?'Trying again…':'Try again'}</button><Link className="button secondary" href="/" prefetch={false}>Back to the studio</Link></div>
 </main>
}
