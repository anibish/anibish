UPDATE cms_pages SET published_seo='{}' WHERE published_seo IS NULL;
ALTER TABLE cms_pages ALTER COLUMN published_seo SET DEFAULT '{}';
CREATE FUNCTION record_project_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE snapshot jsonb; previous jsonb; project uuid; hidden boolean;
BEGIN
 snapshot=to_jsonb(NEW);
 previous=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
 project=CASE WHEN TG_TABLE_NAME='projects' THEN NEW.id ELSE (snapshot->>'project_id')::uuid END;
 hidden=COALESCE((snapshot->>'internal')::boolean,false) OR COALESCE((previous->>'internal')::boolean,false);
 INSERT INTO project_history(org_id,project_id,event,detail)
 VALUES(NEW.org_id,project,TG_TABLE_NAME||'.'||lower(TG_OP),jsonb_build_object('record_id',NEW.id,'before',previous,'after',snapshot,'internal',hidden));
 RETURN NEW;
END $$;
CREATE TRIGGER project_change AFTER INSERT OR UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION record_project_change();
CREATE TRIGGER task_change AFTER INSERT OR UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION record_project_change();
CREATE TRIGGER milestone_change AFTER INSERT OR UPDATE ON milestones FOR EACH ROW EXECUTE FUNCTION record_project_change();
CREATE TRIGGER delivery_change AFTER INSERT OR UPDATE ON deliveries FOR EACH ROW EXECUTE FUNCTION record_project_change();
