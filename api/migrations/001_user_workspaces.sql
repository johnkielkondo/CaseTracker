-- Run once in this project's Supabase SQL Editor BEFORE deploying the new frontend.
-- Additive migration: existing cases and accounts are not moved or deleted.
begin;

create table if not exists public.user_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_subjects text[] not null default array['Constitutional Law I','Criminal Law I','Persons and Family Relations','Statutory Construction'],
  archived_subjects text[] not null default '{}',
  theme text not null default 'blue' check (theme in ('blue','emerald','crimson','amethyst','slate','dark','custom')),
  custom_color text not null default '#0f3a68' check (custom_color ~ '^#[0-9a-fA-F]{6}$'),
  revision bigint not null default 0 check (revision >= 0),
  constraint subject_count_limit check (cardinality(active_subjects) + cardinality(archived_subjects) <= 200)
);

alter table public.user_workspaces enable row level security;
revoke all on public.user_workspaces from public, anon;
grant select, insert, update on public.user_workspaces to authenticated;

drop policy if exists workspace_owner_allow on public.user_workspaces;
create policy workspace_owner_allow on public.user_workspaces
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Restrictive policy remains an AND condition if a permissive policy is added later.
drop policy if exists workspace_owner_boundary on public.user_workspaces;
create policy workspace_owner_boundary on public.user_workspaces as restrictive
  for all to public
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.case_digests enable row level security;
revoke all on public.case_digests from public, anon;
grant select, insert, update, delete on public.case_digests to authenticated;

-- ::text supports the existing owner column whether it was created as text or uuid.
-- Existing policies are preserved; the restrictive boundary also limits broad policies.
drop policy if exists case_api_owner_allow on public.case_digests;
create policy case_api_owner_allow on public.case_digests
  for all to authenticated
  using (user_id::text = (select auth.uid())::text)
  with check (user_id::text = (select auth.uid())::text);

drop policy if exists case_api_owner_boundary on public.case_digests;
create policy case_api_owner_boundary on public.case_digests as restrictive
  for all to public
  using (user_id::text = (select auth.uid())::text)
  with check (user_id::text = (select auth.uid())::text);

create index if not exists case_digests_owner_subject_created_idx
  on public.case_digests (user_id, subject, created_at desc);

notify pgrst, 'reload schema';
commit;

-- Verify: both rows must show row_security_enabled = true.
select relname as table_name, relrowsecurity as row_security_enabled
from pg_class
where oid in ('public.case_digests'::regclass, 'public.user_workspaces'::regclass);
