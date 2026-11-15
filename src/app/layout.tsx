import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: {default:'Anil Bishnoi — Software engineering, thoughtfully crafted.',template:'%s · anibish.com'}, description:'The personal software engineering studio of Anil Bishnoi. AI, web, mobile and architecture. Phase 1 visual prototype.', robots:{index:false,follow:false} };
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en" suppressHydrationWarning><body>{children}</body></html>}
