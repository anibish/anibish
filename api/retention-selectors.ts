import type {PoolClient} from 'pg';
import {z} from 'zod';
import {retentionOption,type RetentionCategory} from '../src/lib/retention-options';
import {fail} from './security';

const text=z.string().trim().min(10).max(5000);
export const retentionRule=z.object({
 category:z.string().max(100).refine(value=>Boolean(retentionOption(value))),
 period_days:z.number().int().min(1).max(36500),period_confirmed:z.literal(true),legal_hold:z.boolean().default(true),
 purpose:text,legal_basis:text,trigger:z.string().max(100),approval_reference:text,
 method:z.string().trim().min(5).max(2000),exceptions:z.string().trim().min(5).max(5000),responsible_party:z.string().trim().min(3).max(300),
}).passthrough().superRefine((rule,context)=>{if(retentionOption(rule.category)?.trigger!==rule.trigger)context.addIssue({code:'custom',path:['trigger'],message:'Select the documented fixed timestamp for this category.'});});
type Rule=z.infer<typeof retentionRule>;
type Source={name:string;query:string};
// All SQL identifiers/filters are fixed source code. Caller strings never become SQL.
const table=(name:string,column:string,filter='TRUE'):Source=>({name,query:`SELECT ${column} AS retention_at FROM ${name} WHERE ${filter}`});
const sources:Record<Exclude<RetentionCategory,'backups'>,Source[]>={
 customer_accounts:[table('users','disabled_at',"global_role IS NULL AND disabled_at IS NOT NULL")],
 leads:[table('leads','created_at')],project_messages:[table('messages','created_at')],files:[table('files','created_at')],
 email_attachments:[{name:'mail_attachments',query:'SELECT m.received_at AS retention_at FROM mail_attachments a JOIN mail_messages m ON m.id=a.message_id'}],
 mail_cache:[table('mail_messages','received_at')],deliverables:[table('deliveries','created_at')],
 audit_logs:[table('audit_log','created_at'),table('compliance_events','created_at'),table('privacy_request_events','created_at'),table('file_scan_events','created_at'),table('mail_draft_sync_events','created_at'),table('portfolio_source_history','created_at'),table('review_candidate_versions','created_at'),table('cms_revisions','created_at')],
 security_events:[table('security_events','created_at'),table('security_request_events','created_at')],
 financial_documents:[table('invoices','created_at'),table('invoice_history','created_at'),table('quotes','created_at'),table('orders','created_at'),table('contracts','accepted_at'),table('payments','created_at'),table('refunds','created_at'),table('credit_notes','created_at'),table('manual_transfers','created_at'),table('payment_events','created_at'),table('billing_agreements','created_at')],
 support_tickets:[table('tickets','created_at')],consent_records:[table('legal_consents','accepted_at'),table('marketing_consents','recorded_at')],
 reviews:[table('review_candidates','updated_at'),table('review_candidate_versions','created_at'),table('cms_pages','updated_at',"kind='review'"),table('assets','created_at',"source_path LIKE 'reviews/%'")],
 sessions:[table('sessions','expires_at')],auth_tokens:[table('auth_tokens','expires_at')],
};
export async function selectRetentionCandidates(db:Pick<PoolClient,'query'>,input:unknown){
 const parsed=retentionRule.safeParse(input);if(!parsed.success)fail(409,'An owner-approved purpose, legal or contractual basis, fixed trigger, confirmed period, method, exceptions and responsible party are required. No records were selected.');
 const rule:Rule=parsed.data,option=retentionOption(rule.category)!;
 const common={category:rule.category,canonical_category:option.value,trigger:rule.trigger,period_days:rule.period_days,legal_hold:rule.legal_hold,record_deletion_performed:false,destructive_execution_enabled:false,external_provider_operations_performed:false,deletion_eligibility_assessed:false,basis:rule.approval_reference,legal_basis:rule.legal_basis,count_unit:'retained database records; related versions are separate records',limitations:['Age aggregates are review inputs, not deletion eligibility. Contract duties, individual holds, dependencies and backup expiration require separate authorized assessment.','Only the listed database components are counted. Provider originals, archive contents, object-store bytes, replicas and offsite copies are not selected or deleted.']};
 if(option.value==='backups')return {candidate_count:null,detail:{...common,selection_status:'unsupported_external',count_complete:false,components:[],unknown_age_count:null,reason:'Encrypted backup archives and offsite/provider copies are outside this database selector. No archive was read, expired or deleted.'}};
 if(rule.legal_hold)return {candidate_count:0,detail:{...common,selection_status:'blocked_by_legal_hold',count_complete:false,components:[],unknown_age_count:null}};
 const components=[];
 for(const source of sources[option.value]){
  const row=(await db.query(`SELECT count(*) FILTER(WHERE retention_at<now()-($1::int*interval '1 day'))::int AS age_candidates,count(*) FILTER(WHERE retention_at IS NULL)::int AS unknown_age_count FROM (${source.query}) retention_source`,[rule.period_days])).rows[0];
  components.push({source:source.name,age_candidates:Number(row.age_candidates),unknown_age_count:Number(row.unknown_age_count)});
 }
 return {candidate_count:components.reduce((n,c)=>n+c.age_candidates,0),detail:{...common,selection_status:'database_age_aggregate_only',count_complete:components.every(c=>c.unknown_age_count===0),components,unknown_age_count:components.reduce((n,c)=>n+c.unknown_age_count,0)}};
}
