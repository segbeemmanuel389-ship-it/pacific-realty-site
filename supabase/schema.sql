-- =====================================================================
-- Pacific Realty Solution Ltd  -  database setup
-- Run ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- It is safe to run again; existing data is not deleted.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- 1. Owners (only people listed here are administrators) ----------
create table if not exists public.owners (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.owners o where o.user_id = auth.uid()); $$;

revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to anon, authenticated;

-- ---------- 2. Client profiles (created automatically at sign-up) ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  phone      text,
  email      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', ''),
          nullif(new.raw_user_meta_data->>'phone', ''),
          new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 3. Properties ----------
create table if not exists public.properties (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (char_length(title) between 3 and 200),
  description     text,
  price_ngn       numeric(16,2) check (price_ngn is null or price_ngn >= 0),
  price_label     text,
  area            text not null,               -- short place name used by the search filter, e.g. "Orchid"
  location_detail text,                        -- full address line shown on the card
  property_type   text not null default 'residential'
                  check (property_type in ('residential','commercial','land')),
  listing_status  text not null default 'for_sale'
                  check (listing_status in ('for_sale','for_rent','new_project','distress_sale','ongoing_project')),
  bedrooms        int check (bedrooms is null or bedrooms between 0 and 50),
  bathrooms       int check (bathrooms is null or bathrooms between 0 and 50),
  features        text[] not null default '{}',
  images          text[] not null default '{}', -- public image links; the first one is the cover
  is_available    boolean not null default true,
  is_featured     boolean not null default false,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------- 4. Enquiries (filled by the email function in the next setup step) ----------
create table if not exists public.enquiries (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  name            text not null,
  email           text not null,
  phone           text,
  message         text not null,
  property_id     uuid references public.properties(id) on delete set null,
  property_title  text,
  source          text not null default 'contact_form',
  status          text not null default 'new' check (status in ('new','contacted','closed')),
  email_status    text not null default 'pending' check (email_status in ('pending','sent','failed')),
  email_error     text,
  idempotency_key text unique,
  ip_hash         text
);

-- ---------- 5. Saved properties (hearts of signed-in clients) ----------
create table if not exists public.saved_properties (
  user_id     uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, property_id)
);

-- ---------- 6. Keep "updated_at" fresh ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists touch_properties on public.properties;
create trigger touch_properties before update on public.properties
  for each row execute function public.touch_updated_at();
drop trigger if exists touch_profiles on public.profiles;
create trigger touch_profiles before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------- 7. Row Level Security: who can see / change what ----------
alter table public.owners           enable row level security;
alter table public.profiles         enable row level security;
alter table public.properties       enable row level security;
alter table public.enquiries        enable row level security;
alter table public.saved_properties enable row level security;

-- owners: you can only see your own row (nobody can add themselves)
drop policy if exists "owners read own row" on public.owners;
create policy "owners read own row" on public.owners for select to authenticated using (user_id = auth.uid());

-- profiles: a client sees and edits only their own; the owner can read all
drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "profiles owner read all" on public.profiles;
create policy "profiles owner read all" on public.profiles for select to authenticated using (public.is_owner());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- properties: everyone can read available ones; only the owner can change anything
drop policy if exists "public reads available properties" on public.properties;
create policy "public reads available properties" on public.properties for select to anon, authenticated using (is_available = true);
drop policy if exists "owner reads all properties" on public.properties;
create policy "owner reads all properties" on public.properties for select to authenticated using (public.is_owner());
drop policy if exists "owner adds properties" on public.properties;
create policy "owner adds properties" on public.properties for insert to authenticated with check (public.is_owner());
drop policy if exists "owner edits properties" on public.properties;
create policy "owner edits properties" on public.properties for update to authenticated using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner deletes properties" on public.properties;
create policy "owner deletes properties" on public.properties for delete to authenticated using (public.is_owner());

-- enquiries: private. No public access at all; only the owner can read them or change their status.
drop policy if exists "owner reads enquiries" on public.enquiries;
create policy "owner reads enquiries" on public.enquiries for select to authenticated using (public.is_owner());
drop policy if exists "owner updates enquiries" on public.enquiries;
create policy "owner updates enquiries" on public.enquiries for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- saved properties: each client manages only their own
drop policy if exists "saved read own" on public.saved_properties;
create policy "saved read own" on public.saved_properties for select to authenticated using (user_id = auth.uid());
drop policy if exists "saved add own" on public.saved_properties;
create policy "saved add own" on public.saved_properties for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "saved delete own" on public.saved_properties;
create policy "saved delete own" on public.saved_properties for delete to authenticated using (user_id = auth.uid());

-- ---------- 8. Table permissions (RLS above still decides the rows) ----------
grant usage on schema public to anon, authenticated;
revoke all on public.owners, public.profiles, public.properties, public.enquiries, public.saved_properties from anon, authenticated;
grant select on public.properties to anon, authenticated;
grant insert, update, delete on public.properties to authenticated;
grant select on public.owners to authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant select on public.enquiries to authenticated;
grant update (status) on public.enquiries to authenticated;
grant select, insert, delete on public.saved_properties to authenticated;

-- ---------- 9. Photo storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-images', 'property-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "owner lists property images" on storage.objects;
create policy "owner lists property images" on storage.objects for select to authenticated
  using (bucket_id = 'property-images' and public.is_owner());
drop policy if exists "owner uploads property images" on storage.objects;
create policy "owner uploads property images" on storage.objects for insert to authenticated
  with check (bucket_id = 'property-images' and public.is_owner());
drop policy if exists "owner updates property images" on storage.objects;
create policy "owner updates property images" on storage.objects for update to authenticated
  using (bucket_id = 'property-images' and public.is_owner());
drop policy if exists "owner deletes property images" on storage.objects;
create policy "owner deletes property images" on storage.objects for delete to authenticated
  using (bucket_id = 'property-images' and public.is_owner());

-- =====================================================================
-- LAST STEP (do this AFTER you have created your own account on the site):
-- make your account the administrator. Replace the email, then run:
--
--   insert into public.owners (user_id)
--   select id from auth.users where email = 'YOUR-OWNER-EMAIL-HERE';
--
-- =====================================================================
