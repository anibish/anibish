ALTER TABLE sessions ADD COLUMN active_org_id uuid REFERENCES organizations(id);
ALTER TABLE quotes ADD COLUMN parent_id uuid REFERENCES quotes(id);
