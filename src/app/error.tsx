'use client';
export default function Error({reset}:{reset:()=>void}){return <main className="error-page"><span className="eyebrow">SOMETHING INTERRUPTED THIS VIEW</span><h1>A fresh start might help.</h1><p>Your prototype data is safe. Try loading this view again.</p><button className="button" onClick={reset}>Try again</button></main>}
