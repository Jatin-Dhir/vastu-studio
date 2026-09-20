-- Hardening pass after the 2026-09-21 audit.

-- 1. A profile's phone comes from the account's own address, never from client-supplied
--    metadata: a self-signup cannot claim somebody else's number.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare ph text;
begin
  ph := case
    when new.email like '%@phone.vastustudio.app' then '+' || split_part(new.email, '@', 1)
    else coalesce(new.phone, new.raw_user_meta_data->>'phone')
  end;
  insert into public.profiles (id, phone, name)
  values (new.id, ph, coalesce(new.raw_user_meta_data->>'name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

-- 2. The app never reads profiles directly (everything goes through the RPCs), so the
--    admin's notes and device columns need no direct read path at all.
drop policy if exists "own profile" on public.profiles;

-- 3. Usage events: live accounts only, only the kinds the app logs, small payloads.
drop policy if exists "log own events" on public.usage_events;
create policy "log own events" on public.usage_events for insert
  with check (
    user_id = auth.uid()
    and kind in ('open', 'login', 'analysis', 'report')
    and (meta is null or pg_column_size(meta) < 2048)
    and exists (select 1 from public.profiles p where p.id = auth.uid() and not p.disabled)
  );

-- 4. Deleting an account that once posted a broadcast must not fail on the reference.
alter table public.broadcasts drop constraint if exists broadcasts_created_by_fkey;
alter table public.broadcasts add constraint broadcasts_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

-- 5. None of the studio's functions are for anonymous callers. They all fail closed on a
--    missing auth.uid() already; this removes the default public grant so they are not
--    even reachable. The auth trigger keeps its grant: it fires under the auth admin.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('access_state', 'admin_kick', 'admin_list_users', 'admin_set_access',
                        'admin_set_role', 'admin_stats', 'claim_device', 'get_charts',
                        'heartbeat', 'is_admin', 'profile_state', 'release_device')
  loop
    execute format('revoke execute on function %s from anon, public', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;
alter default privileges in schema public revoke execute on functions from anon, public;

-- 6. Follow-ups from the database linter: the auth trigger is not an API (only the auth
--    admin fires it), and the state helper pins its search_path like the others.
revoke execute on function public.handle_new_user() from anon, authenticated, public;
grant execute on function public.handle_new_user() to supabase_auth_admin;
alter function public.profile_state(public.profiles, text) set search_path = public;
do $$
begin
  revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
exception when others then null; -- not ours to change on this project
end $$;
