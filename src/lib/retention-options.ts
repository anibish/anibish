/** Selector metadata only; these are not approved policies or statutory periods. */
export const retentionOptions=[
 {value:'customer_accounts',label:'Customer accounts (deactivated only)',trigger:'disabled_at'},
 {value:'leads',label:'Leads and enquiries',trigger:'created_at'},
 {value:'project_messages',label:'Project messages',trigger:'created_at'},
 {value:'files',label:'Uploaded files (database metadata)',trigger:'created_at'},
 {value:'email_attachments',label:'Email attachments (local cache metadata)',trigger:'received_at'},
 {value:'mail_cache',label:'Email cache (local database only)',trigger:'received_at'},
 {value:'deliverables',label:'Deliverable versions',trigger:'created_at'},
 {value:'audit_logs',label:'Audit and decision logs',trigger:'record_timestamp'},
 {value:'security_events',label:'Authentication and HTTP security logs',trigger:'created_at'},
 {value:'financial_documents',label:'Financial documents and transaction records',trigger:'record_timestamp'},
 {value:'backups',label:'Encrypted backup archives (external; no selector)',trigger:'backup_expiration'},
 {value:'support_tickets',label:'Support tickets',trigger:'created_at'},
 {value:'consent_records',label:'Legal and marketing consent records',trigger:'record_timestamp'},
 {value:'reviews',label:'Reviews and private review evidence metadata',trigger:'record_timestamp'},
 {value:'sessions',label:'Expired authentication sessions',trigger:'expires_at'},
 {value:'auth_tokens',label:'Expired verification and recovery tokens',trigger:'expires_at'},
] as const;
export type RetentionCategory=typeof retentionOptions[number]['value'];
export function retentionOption(value:unknown){return retentionOptions.find(option=>option.value===(value==='enquiries'?'leads':value));}
