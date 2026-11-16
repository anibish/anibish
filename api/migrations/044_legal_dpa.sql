-- Adds an unpublished DPA owner-review document. Existing policy content,
-- approvals, enabled states, consent history and enrolled accounts are preserved.
ALTER TABLE legal_versions DROP CONSTRAINT legal_versions_policy_check;
ALTER TABLE legal_versions ADD CONSTRAINT legal_versions_policy_check CHECK(policy IN('privacy','terms','refunds','cookies','dpa'));
ALTER TABLE legal_drafts DROP CONSTRAINT legal_drafts_policy_check;
ALTER TABLE legal_drafts ADD CONSTRAINT legal_drafts_policy_check CHECK(policy IN('privacy','terms','refunds','cookies','dpa'));
ALTER TABLE legal_policy_state DROP CONSTRAINT legal_policy_state_policy_check;
ALTER TABLE legal_policy_state ADD CONSTRAINT legal_policy_state_policy_check CHECK(policy IN('privacy','terms','refunds','cookies','dpa'));
INSERT INTO legal_drafts(policy,html) VALUES('dpa','<h1>Client Data Processing Agreement — owner-review draft</h1><p>Owner/legal review required: load and review the prepared private DPA draft before publication. This is not an approved policy.</p><p>Confirm the contracting parties, processing roles, client instructions, data categories, duration, security measures, subprocessors, international transfers, incident cooperation and return or deletion arrangements. Do not invent legal entity information, provider assurances or client acceptance.</p><p>Publication of a general document does not sign a client-specific agreement or record a customer consent decision. Registration continues to require only the current approved Privacy Policy and Terms of Use.</p>') ON CONFLICT(policy) DO NOTHING;
INSERT INTO legal_policy_state(policy,enabled) VALUES('dpa',false) ON CONFLICT(policy) DO NOTHING;
