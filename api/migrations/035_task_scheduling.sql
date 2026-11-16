-- Date-only task planning. Project, milestone and contract targets are untouched.
ALTER TABLE tasks ADD COLUMN start_date date;
ALTER TABLE tasks ADD COLUMN schedule_revision integer NOT NULL DEFAULT 1 CHECK(schedule_revision>0);
ALTER TABLE tasks ADD CONSTRAINT task_planning_date_order
 CHECK(start_date IS NULL OR due_date IS NULL OR start_date<=due_date);
CREATE INDEX tasks_project_planning_dates ON tasks(project_id,due_date,start_date);

CREATE FUNCTION maintain_task_schedule_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.start_date IS DISTINCT FROM NEW.start_date OR OLD.due_date IS DISTINCT FROM NEW.due_date THEN
  NEW.schedule_revision:=OLD.schedule_revision+1;
 ELSE
  NEW.schedule_revision:=OLD.schedule_revision;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER task_schedule_revision BEFORE UPDATE OF start_date,due_date ON tasks
 FOR EACH ROW EXECUTE FUNCTION maintain_task_schedule_revision();

CREATE FUNCTION record_task_schedule_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor uuid; rationale text;
BEGIN
 IF OLD.start_date IS NOT DISTINCT FROM NEW.start_date AND OLD.due_date IS NOT DISTINCT FROM NEW.due_date THEN
  RETURN NEW;
 END IF;
 actor:=NULLIF(current_setting('anibish.schedule_actor',true),'')::uuid;
 rationale:=NULLIF(current_setting('anibish.schedule_reason',true),'');
 INSERT INTO project_history(org_id,project_id,actor_id,event,detail)
 VALUES(NEW.org_id,NEW.project_id,actor,'task.schedule_updated',jsonb_build_object(
  'task_id',NEW.id,'task_title',NEW.title,'revision',NEW.schedule_revision,
  'before',jsonb_build_object('start_date',to_char(OLD.start_date,'YYYY-MM-DD'),'due_date',to_char(OLD.due_date,'YYYY-MM-DD')),
  'after',jsonb_build_object('start_date',to_char(NEW.start_date,'YYYY-MM-DD'),'due_date',to_char(NEW.due_date,'YYYY-MM-DD')),
  'reason',COALESCE(rationale,'Task dates changed through another workflow.'),
  'source',CASE WHEN actor IS NULL THEN 'task_date_update' ELSE 'schedule_editor' END,
  'internal',true));
 RETURN NEW;
END $$;
CREATE TRIGGER task_schedule_history AFTER UPDATE OF start_date,due_date ON tasks
 FOR EACH ROW EXECUTE FUNCTION record_task_schedule_change();
