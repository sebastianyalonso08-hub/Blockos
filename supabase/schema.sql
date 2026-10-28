-- Ejecuta en Supabase SQL Editor.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 20),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
on public.profiles for select using (true);

create policy "Users can insert their own profile"
on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update their own profile"
on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  desired_username text;
begin
  desired_username := coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    'Player' || substr(new.id::text, 1, 8)
  );
  insert into public.profiles (id, username)
  values (new.id, desired_username)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.create_profile_for_new_user();


-- Catalog, ownership, currency and equipped avatar items. Run this entire file in Supabase SQL Editor.
create table if not exists public.catalog_items (
 id text primary key, name text not null, category text not null check (category in ('face','head','hat','shirt','pants')), description text not null default '', price integer not null default 0 check (price >= 0), image_url text not null default '', created_at timestamptz not null default now()
);
create table if not exists public.inventory (
 user_id uuid not null references public.profiles(id) on delete cascade, item_id text not null references public.catalog_items(id) on delete cascade, purchased_at timestamptz not null default now(), primary key(user_id,item_id)
);
create table if not exists public.avatar_equipped (
 user_id uuid not null references public.profiles(id) on delete cascade, category text not null check (category in ('face','head','hat','shirt','pants')), item_id text not null references public.catalog_items(id) on delete cascade, primary key(user_id,category)
);
alter table public.catalog_items enable row level security; alter table public.inventory enable row level security; alter table public.avatar_equipped enable row level security;
drop policy if exists "Catalog is public" on public.catalog_items; create policy "Catalog is public" on public.catalog_items for select using (true);
drop policy if exists "Read own inventory" on public.inventory; create policy "Read own inventory" on public.inventory for select using (auth.uid() = user_id);
drop policy if exists "Buy own items" on public.inventory; create policy "Buy own items" on public.inventory for insert with check (auth.uid() = user_id);
drop policy if exists "Read own avatar" on public.avatar_equipped; create policy "Read own avatar" on public.avatar_equipped for select using (auth.uid() = user_id);
drop policy if exists "Equip own avatar" on public.avatar_equipped; create policy "Equip own avatar" on public.avatar_equipped for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
insert into public.catalog_items(id,name,category,description,price,image_url) values
 ('face-smile','Classic Smile','face','The original happy face.',0,'/assets/faces/classic-smile.svg'),
 ('face-serious','Serious Face','face','A simple classic expression.',5,'/assets/faces/serious.svg'),
 ('head-classic','Classic Round Head','head','Classic cylindrical R6 head.',0,''),
 ('hat-green','Classic Green Hat','hat','A green classic hat.',10,''),
 ('shirt-blue','Blue Classic Shirt','shirt','Classic blue torso color.',0,''),
 ('pants-green','Green Classic Pants','pants','Classic green legs.',0,'')
on conflict (id) do nothing;


-- Catalog, ownership, currency and equipped avatar items. Run this entire file in Supabase SQL Editor.
create table if not exists public.catalog_items (
 id text primary key, name text not null, category text not null check (category in ('face','head','hat','shirt','pants')), description text not null default '', price integer not null default 0 check (price >= 0), image_url text not null default '', created_at timestamptz not null default now()
);
create table if not exists public.inventory (
 user_id uuid not null references public.profiles(id) on delete cascade, item_id text not null references public.catalog_items(id) on delete cascade, purchased_at timestamptz not null default now(), primary key(user_id,item_id)
);
create table if not exists public.avatar_equipped (
 user_id uuid not null references public.profiles(id) on delete cascade, category text not null check (category in ('face','head','hat','shirt','pants')), item_id text not null references public.catalog_items(id) on delete cascade, primary key(user_id,category)
);
alter table public.catalog_items enable row level security; alter table public.inventory enable row level security; alter table public.avatar_equipped enable row level security;
drop policy if exists "Catalog is public" on public.catalog_items; create policy "Catalog is public" on public.catalog_items for select using (true);
drop policy if exists "Read own inventory" on public.inventory; create policy "Read own inventory" on public.inventory for select using (auth.uid() = user_id);
drop policy if exists "Buy own items" on public.inventory; create policy "Buy own items" on public.inventory for insert with check (auth.uid() = user_id);
drop policy if exists "Read own avatar" on public.avatar_equipped; create policy "Read own avatar" on public.avatar_equipped for select using (auth.uid() = user_id);
drop policy if exists "Equip own avatar" on public.avatar_equipped; create policy "Equip own avatar" on public.avatar_equipped for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
insert into public.catalog_items(id,name,category,description,price,image_url) values
 ('face-smile','Classic Smile','face','The original happy face.',0,'/assets/faces/classic-smile.svg'),
 ('face-serious','Serious Face','face','A simple classic expression.',5,'/assets/faces/serious.svg'),
 ('head-classic','Classic Round Head','head','Classic cylindrical R6 head.',0,''),
 ('hat-green','Classic Green Hat','hat','A green classic hat.',10,''),
 ('shirt-blue','Blue Classic Shirt','shirt','Classic blue torso color.',0,''),
 ('pants-green','Green Classic Pants','pants','Classic green legs.',0,'')
on conflict (id) do nothing;

alter table public.profiles add column if not exists coins integer not null default 100 check (coins >= 0);
create or replace function public.purchase_catalog_item(p_item_id text) returns text language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid(); item public.catalog_items%rowtype; balance integer;
begin
 if uid is null then raise exception 'Sign in first.'; end if;
 select * into item from public.catalog_items where id=p_item_id; if not found then raise exception 'Item not found.'; end if;
 if exists(select 1 from public.inventory where user_id=uid and item_id=p_item_id) then return 'owned'; end if;
 select coins into balance from public.profiles where id=uid for update;
 if balance < item.price then raise exception 'Not enough Blockos coins.'; end if;
 update public.profiles set coins=coins-item.price where id=uid;
 insert into public.inventory(user_id,item_id) values(uid,p_item_id);
 return 'purchased';
end; $$;
grant execute on function public.purchase_catalog_item(text) to authenticated;
create or replace function public.equip_catalog_item(p_item_id text) returns text language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid(); item public.catalog_items%rowtype;
begin
 if uid is null then raise exception 'Sign in first.'; end if;
 select * into item from public.catalog_items where id=p_item_id; if not found then raise exception 'Item not found.'; end if;
 if not exists(select 1 from public.inventory where user_id=uid and item_id=p_item_id) then raise exception 'Buy this item first.'; end if;
 insert into public.avatar_equipped(user_id,category,item_id) values(uid,item.category,item.id) on conflict(user_id,category) do update set item_id=excluded.item_id;
 return 'equipped';
end; $$;
grant execute on function public.equip_catalog_item(text) to authenticated;

-- Community features for Blockos Ville Classic V5.
create table if not exists public.forum_posts (
 id bigint generated always as identity primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 title text not null check (char_length(title) between 3 and 100),
 body text not null check (char_length(body) between 1 and 5000),
 category text not null check (category in ('general','creations','building-help')),
 created_at timestamptz not null default now()
);
alter table public.forum_posts enable row level security;
drop policy if exists "Forum topics are public" on public.forum_posts;
create policy "Forum topics are public" on public.forum_posts for select using (true);
drop policy if exists "Signed in users can create topics" on public.forum_posts;
create policy "Signed in users can create topics" on public.forum_posts for insert to authenticated with check (auth.uid() = user_id);

grant select on public.forum_posts to anon, authenticated;
grant insert on public.forum_posts to authenticated;


create table if not exists public.support_requests (
 id bigint generated always as identity primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 subject text not null check (char_length(subject) between 3 and 120),
 details text not null check (char_length(details) between 1 and 5000),
 status text not null default 'open' check (status in ('open','in_progress','closed')),
 created_at timestamptz not null default now()
);
alter table public.support_requests enable row level security;
drop policy if exists "Users can create support requests" on public.support_requests;
create policy "Users can create support requests" on public.support_requests for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can read own support requests" on public.support_requests;
create policy "Users can read own support requests" on public.support_requests for select to authenticated using (auth.uid() = user_id);
grant insert, select on public.support_requests to authenticated;
