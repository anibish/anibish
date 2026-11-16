-- Owner-approved marketing copy, 16 November2026. This is a content-only change.
-- Verified delivery/review records are not changed or fabricated to substantiate it.
DO $$
DECLARE page cms_pages%ROWTYPE; owner_actor uuid; next_content jsonb; next_title text:='2,000+ Projects Delivered. Exceptional Quality. 5-Star Client Experiences.';
 eyebrow text:='PROVEN EXCELLENCE IN SOFTWARE DEVELOPMENT';
 paragraph text:='Over two decades of transforming ideas into high-quality digital solutions through technical expertise, reliable execution and a commitment to client satisfaction.';
BEGIN
 SELECT * INTO page FROM cms_pages WHERE slug='freelance-delivery-history' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Selected Work CMS source is missing; no unrelated content was changed'; END IF;
 SELECT id INTO owner_actor FROM users WHERE lower(email)='mail@anibish.com' AND global_role='super_admin' AND mfa_enabled LIMIT 1;
 IF page.title=next_title AND page.kind='page' AND page.content->>'eyebrow'=eyebrow AND page.content->>'description'=paragraph THEN
  NULL; -- Repeated execution cannot create another revision or undo subsequent owner decisions.
 ELSIF page.revision=1 AND page.kind='experience' AND page.state='published' AND page.title='136 completed Fiverr orders'
  AND page.content IS NOT DISTINCT FROM page.published_content AND page.content->>'completed_order_count'='136'
  AND page.content->>'description'='136 completed Fiverr orders, verified in the owner’s completed-order history on 16 November 2026. Repeat orders may belong to the same engagement; this is not a count of unique projects or positive reviews.' THEN
  next_content:=page.content||jsonb_build_object('eyebrow',eyebrow,'description',paragraph);
  -- Marketing copy is a page section, not newly verified professional-experience evidence.
  UPDATE cms_pages SET title=next_title,kind='page',content=next_content,published_content=next_content,
   revision=revision+1,updated_by=owner_actor,updated_at=now(),published_at=now() WHERE id=page.id;
  IF owner_actor IS NOT NULL THEN
   INSERT INTO cms_revisions(page_id,revision,event,content,seo,actor_id) VALUES
    (page.id,page.revision,'observed_before_owner_copy',page.content,page.seo,owner_actor),
    (page.id,page.revision+1,'owner_authorized_copy_maintenance',next_content,page.seo,owner_actor);
  END IF;
  INSERT INTO audit_log(actor_id,action,resource,detail) VALUES(owner_actor,'cms.owner_authorized_copy_maintenance',page.id::text,
   jsonb_build_object('execution_channel','authorized deployment migration; no browser session asserted','authorization','Explicit direct owner instruction,16 November2026','verified_order_metadata_preserved',true));
 ELSE RAISE EXCEPTION 'Selected Work has newer owner edits; review before applying the approved replacement';
 END IF;

END $$;
