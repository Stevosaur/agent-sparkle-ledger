-- ---------------------------------------------------------------------------
-- Plotline: accounts, billing, watchlist, tracked homes, alerts, leads, listings
--
-- Row level security is enabled on every table. Signed-in users can only read
-- and change their own rows; subscriptions, leads and the Telegram fields on
-- profiles are written by the server with the Supabase secret (service role)
-- key, which bypasses RLS.
--
-- Safe to re-run: every statement is idempotent.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, created by trigger on sign-up
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 120),
  telegram_chat_id text,
  telegram_link_code text unique,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Users may only edit their display name. The Telegram columns are written by the
-- server (link code + webhook) so nobody can point alerts at someone else's chat.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 120)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users that signed up before this migration ran.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- subscriptions: Stripe state per user (written by the Stripe webhook only)
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  status text,
  price_id text,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own" on public.subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- No insert/update/delete policies: only the service role writes subscriptions.
revoke insert, update, delete on public.subscriptions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- watchlist: saved property pages ("hdb:blk-872a-tampines-st-86", "condo:the-hillford", ...)
-- ---------------------------------------------------------------------------
create table if not exists public.watchlist (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ref text not null check (char_length(ref) between 3 and 200),
  label text check (label is null or char_length(label) <= 200),
  created_at timestamptz not null default now(),
  unique (user_id, ref)
);

alter table public.watchlist enable row level security;

drop policy if exists "watchlist_select_own" on public.watchlist;
create policy "watchlist_select_own" on public.watchlist
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "watchlist_insert_own" on public.watchlist;
create policy "watchlist_insert_own" on public.watchlist
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "watchlist_update_own" on public.watchlist;
create policy "watchlist_update_own" on public.watchlist
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "watchlist_delete_own" on public.watchlist;
create policy "watchlist_delete_own" on public.watchlist
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- tracked_homes: homes on /my-property/ with the owner's purchase details
-- ---------------------------------------------------------------------------
create table if not exists public.tracked_homes (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ref text not null check (char_length(ref) between 3 and 200),
  label text check (label is null or char_length(label) <= 200),
  flat_type text check (flat_type is null or char_length(flat_type) <= 40),
  area_sqm numeric check (area_sqm is null or (area_sqm > 0 and area_sqm < 100000)),
  floor int check (floor is null or (floor between -5 and 150)),
  purchase_price numeric check (purchase_price is null or (purchase_price > 0 and purchase_price < 1000000000)),
  purchase_month text check (purchase_month is null or purchase_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  created_at timestamptz not null default now()
);

create index if not exists tracked_homes_user_idx on public.tracked_homes (user_id, id);

alter table public.tracked_homes enable row level security;

drop policy if exists "tracked_homes_select_own" on public.tracked_homes;
create policy "tracked_homes_select_own" on public.tracked_homes
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "tracked_homes_insert_own" on public.tracked_homes;
create policy "tracked_homes_insert_own" on public.tracked_homes
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "tracked_homes_update_own" on public.tracked_homes;
create policy "tracked_homes_update_own" on public.tracked_homes
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "tracked_homes_delete_own" on public.tracked_homes;
create policy "tracked_homes_delete_own" on public.tracked_homes
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- saved_calculations: affordability / mortgage / valuation results a user saved
-- ---------------------------------------------------------------------------
create table if not exists public.saved_calculations (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('affordability', 'mortgage', 'valuation')),
  label text check (label is null or char_length(label) <= 200),
  input jsonb not null default '{}'::jsonb,
  result jsonb,
  created_at timestamptz not null default now()
);

create index if not exists saved_calculations_user_idx on public.saved_calculations (user_id, created_at desc);

alter table public.saved_calculations enable row level security;

drop policy if exists "saved_calculations_select_own" on public.saved_calculations;
create policy "saved_calculations_select_own" on public.saved_calculations
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "saved_calculations_insert_own" on public.saved_calculations;
create policy "saved_calculations_insert_own" on public.saved_calculations
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "saved_calculations_update_own" on public.saved_calculations;
create policy "saved_calculations_update_own" on public.saved_calculations
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "saved_calculations_delete_own" on public.saved_calculations;
create policy "saved_calculations_delete_own" on public.saved_calculations
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- alerts: notify the user when a property records a new sale / launch update
-- ---------------------------------------------------------------------------
create table if not exists public.alerts (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ref text not null check (char_length(ref) between 3 and 200),
  kind text not null check (kind in ('new-sale', 'new-launch')),
  channel text not null default 'telegram' check (channel in ('telegram', 'email')),
  active boolean not null default true,
  last_checked_month text check (last_checked_month is null or last_checked_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  created_at timestamptz not null default now(),
  unique (user_id, ref, kind)
);

create index if not exists alerts_active_idx on public.alerts (id) where active;

alter table public.alerts enable row level security;

drop policy if exists "alerts_select_own" on public.alerts;
create policy "alerts_select_own" on public.alerts
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "alerts_insert_own" on public.alerts;
create policy "alerts_insert_own" on public.alerts
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "alerts_update_own" on public.alerts;
create policy "alerts_update_own" on public.alerts
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "alerts_delete_own" on public.alerts;
create policy "alerts_delete_own" on public.alerts
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- leads: mortgage / enquiry / services forms. Written and read by the server only.
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id bigserial primary key,
  type text not null check (char_length(type) <= 40),
  name text check (name is null or char_length(name) <= 200),
  email text check (email is null or char_length(email) <= 320),
  phone text check (phone is null or char_length(phone) <= 40),
  message text check (message is null or char_length(message) <= 5000),
  context jsonb,
  user_id uuid references auth.users (id) on delete set null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create index if not exists leads_created_idx on public.leads (created_at desc);

alter table public.leads enable row level security;
-- No policies: anon and authenticated clients can neither read nor write leads.
revoke all on public.leads from anon, authenticated;

-- ---------------------------------------------------------------------------
-- home_listings: owner-listed homes for sale or rent (/homes/)
-- ---------------------------------------------------------------------------
create table if not exists public.home_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  listing_type text not null check (listing_type in ('sale', 'rent')),
  ref text check (ref is null or char_length(ref) <= 200),
  title text check (title is null or char_length(title) <= 200),
  description text check (description is null or char_length(description) <= 5000),
  asking_price numeric check (asking_price is null or (asking_price > 0 and asking_price < 1000000000)),
  flat_type text check (flat_type is null or char_length(flat_type) <= 40),
  area_sqm numeric check (area_sqm is null or (area_sqm > 0 and area_sqm < 100000)),
  floor_level int check (floor_level is null or floor_level between -5 and 150),
  bedrooms int check (bedrooms is null or bedrooms between 0 and 20),
  bathrooms int check (bathrooms is null or bathrooms between 0 and 20),
  contact_name text check (contact_name is null or char_length(contact_name) <= 120),
  whatsapp text check (whatsapp is null or char_length(whatsapp) <= 32),
  status text not null default 'active' check (status in ('active', 'closed')),
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists home_listings_active_idx on public.home_listings (created_at desc) where status = 'active';
create index if not exists home_listings_user_idx on public.home_listings (user_id);

alter table public.home_listings enable row level security;

drop policy if exists "home_listings_select_active_or_own" on public.home_listings;
create policy "home_listings_select_active_or_own" on public.home_listings
  for select to anon, authenticated
  using (status = 'active' or (select auth.uid()) = user_id);
drop policy if exists "home_listings_insert_own" on public.home_listings;
create policy "home_listings_insert_own" on public.home_listings
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "home_listings_update_own" on public.home_listings;
create policy "home_listings_update_own" on public.home_listings
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "home_listings_delete_own" on public.home_listings;
create policy "home_listings_delete_own" on public.home_listings
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists home_listings_touch_updated_at on public.home_listings;
create trigger home_listings_touch_updated_at
  before update on public.home_listings
  for each row execute function public.touch_updated_at();

-- created_at is server time on insert (listing order cannot be faked).
create or replace function public.stamp_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at = now();
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists home_listings_stamp_created_at on public.home_listings;
create trigger home_listings_stamp_created_at
  before insert on public.home_listings
  for each row execute function public.stamp_created_at();

-- ---------------------------------------------------------------------------
-- Per-user row quotas, enforced in the database as well as in the route handlers, so direct
-- PostgREST calls with a user's token cannot flood the tables (or starve the alerts cron).
-- Limits match src/lib/account/limits.ts. Row-level BEFORE triggers also see rows inserted earlier
-- in the same statement, so bulk inserts are capped too.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_row_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_rows integer := tg_argv[0]::integer;
  existing integer;
begin
  execute format('select count(*) from public.%I where user_id = $1', tg_table_name) into existing using new.user_id;
  if existing >= max_rows then
    raise exception 'limit_reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists watchlist_quota on public.watchlist;
create trigger watchlist_quota before insert on public.watchlist
  for each row execute function public.enforce_row_quota('200');
drop trigger if exists tracked_homes_quota on public.tracked_homes;
create trigger tracked_homes_quota before insert on public.tracked_homes
  for each row execute function public.enforce_row_quota('50');
drop trigger if exists alerts_quota on public.alerts;
create trigger alerts_quota before insert on public.alerts
  for each row execute function public.enforce_row_quota('50');
drop trigger if exists saved_calculations_quota on public.saved_calculations;
create trigger saved_calculations_quota before insert on public.saved_calculations
  for each row execute function public.enforce_row_quota('100');

alter table public.saved_calculations drop constraint if exists saved_calculations_size;
alter table public.saved_calculations add constraint saved_calculations_size
  check (octet_length(input::text) + coalesce(octet_length(result::text), 0) <= 32768);
alter table public.alerts drop constraint if exists alerts_ref_format;
alter table public.alerts add constraint alerts_ref_format
  check (ref ~ '^(hdb|condo|landed|landed-street|launch):[a-z0-9/-]+$');

-- ---------------------------------------------------------------------------
-- Table privileges. Supabase usually grants these through default privileges on the
-- public schema; they are repeated here so the app also works on projects where those
-- defaults were removed. Row level security still decides which rows each role sees,
-- and the revokes above (profiles, subscriptions, leads) are not widened.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant select on public.profiles, public.subscriptions to authenticated;
grant select, insert, update, delete on public.watchlist, public.tracked_homes, public.saved_calculations, public.alerts to authenticated;
grant usage, select on sequence public.watchlist_id_seq, public.tracked_homes_id_seq, public.saved_calculations_id_seq, public.alerts_id_seq to authenticated;
-- Listings: inserts go through POST /api/homes/ (validation, rate limit, coordinates from the property
-- reference) with the server key, so clients get no INSERT. Owners may only flip `status` (close/reopen)
-- or delete their own rows. Anonymous readers see every column except user_id.
grant select (id, listing_type, ref, title, description, asking_price, flat_type, area_sqm, floor_level,
  bedrooms, bathrooms, contact_name, whatsapp, status, lat, lng, created_at, updated_at)
  on public.home_listings to anon;
grant select on public.home_listings to authenticated;
grant update (status) on public.home_listings to authenticated;
grant delete on public.home_listings to authenticated;

-- The server key (service_role) bypasses RLS but still needs table privileges.
grant select, insert, update, delete on
  public.profiles, public.subscriptions, public.watchlist, public.tracked_homes,
  public.saved_calculations, public.alerts, public.leads, public.home_listings
  to service_role;
grant usage, select on sequence
  public.watchlist_id_seq, public.tracked_homes_id_seq, public.saved_calculations_id_seq,
  public.alerts_id_seq, public.leads_id_seq
  to service_role;
