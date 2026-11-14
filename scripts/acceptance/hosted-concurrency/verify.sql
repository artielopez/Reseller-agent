-- Substitute this run's three UUIDs. Expected: completed, true, 1, 1, 1, Open.
select status,attempt_started,
 (select count(*) from public.suggested_replies where owner_id='__OWNER_ID__') as replies,
 (select count(*) from public.suggested_replies where owner_id='__OWNER_ID__' and status='Draft' and source='agent' and approved_at is null) as unapproved_agent_drafts,
 (select coalesce(sum(requests),0) from public.ai_usage where owner_id='__OWNER_ID__') as attempts,
 (select status from public.buyer_inquiries where id='__INQUIRY_ID__') as inquiry_status
 from public.draft_jobs where id='__JOB_ID__' and owner_id='__OWNER_ID__';
