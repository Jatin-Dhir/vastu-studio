-- Vastu Studio access control: accounts, one device at a time, server-held charts,
-- broadcasts and usage stats. Run once in the project's SQL editor (or `supabase db push`).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables --
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text unique,
  name text not null default '',
  role text not null default 'user' check (role in ('user', 'admin')),
  expires_at timestamptz,               -- null = no end date
  disabled boolean not null default false,
  active_device text,                   -- the one device currently holding the seat
  active_device_name text,
  device_claimed_at timestamptz,
  last_seen timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

-- the practitioner's charts — never shipped inside the app, only served to a valid seat
create table if not exists public.charts (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.broadcasts (
  id bigserial primary key,
  message text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists usage_events_created_idx on public.usage_events (created_at desc);
create index if not exists usage_events_user_idx on public.usage_events (user_id, created_at desc);

-- every new auth user gets a profile row (the admin function fills the rest)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone, name)
  values (new.id, new.phone, coalesce(new.raw_user_meta_data->>'name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------- functions --
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and not disabled);
$$;

-- the verdict for one profile on one device
create or replace function public.profile_state(pr public.profiles, p_device text) returns jsonb
language plpgsql stable as $$
declare st text;
begin
  st := case
    when pr.disabled then 'disabled'
    when pr.expires_at is not null and pr.expires_at < now() then 'expired'
    when pr.active_device is not null and pr.active_device <> p_device then 'other_device'
    else 'ok' end;
  return jsonb_build_object(
    'state', st, 'id', pr.id, 'name', pr.name, 'phone', pr.phone, 'role', pr.role,
    'expires_at', pr.expires_at, 'active_device_name', pr.active_device_name);
end $$;

create or replace function public.access_state(p_device text) returns text
language plpgsql stable security definer set search_path = public as $$
declare pr public.profiles%rowtype;
begin
  select * into pr from public.profiles where id = auth.uid();
  if not found then return 'no_profile'; end if;
  return public.profile_state(pr, p_device)->>'state';
end $$;

-- sign-in on a device: the newest login always takes the seat
create or replace function public.claim_device(p_device text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pr public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update public.profiles
     set active_device = p_device, active_device_name = p_name, device_claimed_at = now(), last_seen = now()
   where id = auth.uid()
   returning * into pr;
  if not found then return jsonb_build_object('state', 'no_profile'); end if;
  return public.profile_state(pr, p_device);
end $$;

-- sign-out: free the seat only if this device holds it
create or replace function public.release_device(p_device text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set active_device = null, active_device_name = null
   where id = auth.uid() and active_device = p_device;
end $$;

-- periodic check from the app; refreshes last_seen while the seat is valid
create or replace function public.heartbeat(p_device text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pr public.profiles%rowtype; res jsonb;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into pr from public.profiles where id = auth.uid();
  if not found then return jsonb_build_object('state', 'no_profile'); end if;
  res := public.profile_state(pr, p_device);
  if res->>'state' = 'ok' then
    update public.profiles set last_seen = now() where id = pr.id;
  end if;
  return res;
end $$;

-- the charts, only for a valid seat
create or replace function public.get_charts(p_device text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if public.access_state(p_device) <> 'ok' then raise exception 'no access'; end if;
  return (select coalesce(jsonb_object_agg(key, data), '{}'::jsonb) from public.charts);
end $$;

-- ------------------------------------------------------------- admin RPCs --
create or replace function public.admin_list_users() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'phone', p.phone, 'role', p.role,
      'expires_at', p.expires_at, 'disabled', p.disabled,
      'active_device_name', p.active_device_name, 'last_seen', p.last_seen,
      'created_at', p.created_at, 'notes', p.notes,
      'events_7d', (select count(*) from public.usage_events e
                    where e.user_id = p.id and e.created_at > now() - interval '7 days')
    ) order by p.created_at desc), '[]'::jsonb)
    from public.profiles p);
end $$;

create or replace function public.admin_set_access(
  p_user uuid, p_expires_at timestamptz, p_disabled boolean, p_name text default null, p_notes text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.profiles
     set expires_at = p_expires_at, disabled = p_disabled,
         name = coalesce(p_name, name), notes = coalesce(p_notes, notes)
   where id = p_user;
end $$;

-- sign the user out of whatever device holds the seat
create or replace function public.admin_kick(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.profiles set active_device = null, active_device_name = null where id = p_user;
end $$;

create or replace function public.admin_set_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_role not in ('user', 'admin') then raise exception 'bad role'; end if;
  update public.profiles set role = p_role where id = p_user;
end $$;

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'active_7d', (select count(*) from public.profiles where last_seen > now() - interval '7 days'),
    'expiring_30d', (select count(*) from public.profiles
                     where expires_at is not null and expires_at between now() and now() + interval '30 days'),
    'expired', (select count(*) from public.profiles where expires_at is not null and expires_at < now()),
    'disabled', (select count(*) from public.profiles where disabled),
    'events_30d', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb)
                   from (select kind, count(*) n from public.usage_events
                         where created_at > now() - interval '30 days' group by kind) t),
    'opens_by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d), '[]'::jsonb)
                     from (select date_trunc('day', created_at)::date d, count(*) n from public.usage_events
                           where kind = 'open' and created_at > now() - interval '14 days' group by 1) t)
  );
end $$;

-- --------------------------------------------------------------- policies --
alter table public.profiles enable row level security;
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select using (id = auth.uid());
drop policy if exists "admin reads profiles" on public.profiles;
create policy "admin reads profiles" on public.profiles for select using (public.is_admin());
-- no client-side insert/update/delete: every write goes through the functions above

alter table public.charts enable row level security;
-- deliberately no policies: the charts are only ever read through get_charts()

alter table public.broadcasts enable row level security;
drop policy if exists "read active broadcasts" on public.broadcasts;
create policy "read active broadcasts" on public.broadcasts for select using (auth.uid() is not null and active);
drop policy if exists "admin manages broadcasts" on public.broadcasts;
create policy "admin manages broadcasts" on public.broadcasts for all using (public.is_admin()) with check (public.is_admin());

alter table public.usage_events enable row level security;
drop policy if exists "log own events" on public.usage_events;
create policy "log own events" on public.usage_events for insert with check (user_id = auth.uid());
drop policy if exists "admin reads events" on public.usage_events;
create policy "admin reads events" on public.usage_events for select using (public.is_admin());
