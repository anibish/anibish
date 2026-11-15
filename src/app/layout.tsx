import type {Metadata} from 'next';
import './globals.css';
import ActionFeedbackProvider from '@/components/action-feedback';
export const metadata:Metadata={metadataBase:new URL('https://anibish.com'),title:{default:'Anil Bishnoi — AI & Software Engineering Studio',template:'%s · anibish.com'},description:'20+ years of software engineering. AI, web, mobile, education technology and architecture by Anil Bishnoi. Start a project conversation.',robots:{index:true,follow:true},openGraph:{type:'website',siteName:'ANIBISH',title:'Anil Bishnoi — Engineering ideas into extraordinary digital products',url:'https://anibish.com'},alternates:{canonical:'/'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning><body><ActionFeedbackProvider>{children}</ActionFeedbackProvider></body></html>}
