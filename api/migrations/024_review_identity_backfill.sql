-- Reviews published before candidate identities were added retain their exact text.
-- Add only the private-candidate identity and occurrence to their public snapshots.
UPDATE cms_pages p SET
 content=p.content||jsonb_build_object('candidate_id',r.id,'occurrence',r.occurrence),
 published_content=COALESCE(p.published_content,p.content)||jsonb_build_object('candidate_id',r.id,'occurrence',r.occurrence)
FROM review_candidates r
WHERE p.kind='review' AND r.state='published'
 AND p.slug=COALESCE(r.legacy_slug,'historical-'||r.id)
 AND p.content->>'candidate_id' IS NULL;
