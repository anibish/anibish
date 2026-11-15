import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
export interface PaymentRequest{orderId:string;amount:number;currency:string;idempotencyKey:string}
export interface PaymentResult{reference:string;amount:number;currency:string;mode:'sandbox'}
export interface PaymentProvider{capture(request:PaymentRequest):Promise<PaymentResult>;verifyWebhook(payload:string,signature:string):boolean}
export class SandboxPaymentProvider implements PaymentProvider{
 constructor(private secret:string){if(secret.length<32)throw new Error('A strong sandbox signing secret is required.')}
 async capture(r:PaymentRequest):Promise<PaymentResult>{if(!Number.isSafeInteger(r.amount)||r.amount<=0)throw new Error('Amount must be positive integer minor units.');if(!['INR','USD','EUR','GBP'].includes(r.currency))throw new Error('Unsupported currency.');return {reference:'sandbox_'+randomUUID(),amount:r.amount,currency:r.currency,mode:'sandbox'}}
 sign(payload:string){return createHmac('sha256',this.secret).update(payload).digest('hex')}
 verifyWebhook(payload:string,signature:string){if(!/^[a-f0-9]{64}$/.test(signature))return false;return timingSafeEqual(Buffer.from(this.sign(payload),'hex'),Buffer.from(signature,'hex'))}
}
