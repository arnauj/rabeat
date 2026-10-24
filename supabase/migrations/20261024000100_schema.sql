-- rabeat · esquema principal
create extension if not exists pgcrypto;

create type public.app_role as enum ('superuser', 'restaurant', 'rider', 'customer');
create type public.order_status as enum (
  'pending_payment', 'confirmed', 'preparing', 'ready', 'on_the_way', 'delivered', 'cancelled'
);
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');
create type public.payment_method as enum ('card', 'cash', 'test');

-- Perfiles (1:1 con auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  phone text not null default '',
  default_address jsonb, -- {street, details, notes, lat, lng}
  role public.app_role not null default 'customer',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Ajustes globales de la plataforma (una sola fila)
create table public.settings (
  id smallint primary key default 1 check (id = 1),
  restaurant_commission_pct numeric(5, 2) not null default 15 check (restaurant_commission_pct between 0 and 100),
  price_markup_pct numeric(5, 2) not null default 8 check (price_markup_pct between 0 and 100),
  delivery_base_fee numeric(6, 2) not null default 1.50 check (delivery_base_fee >= 0),
  delivery_fee_per_km numeric(6, 2) not null default 0.60 check (delivery_fee_per_km >= 0),
  delivery_max_km numeric(5, 2) not null default 10 check (delivery_max_km > 0),
  max_tip numeric(6, 2) not null default 50,
  timezone text not null default 'Atlantic/Canary',
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1);

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  owner_id uuid references public.profiles (id) on delete set null,
  name text not null check (length(trim(name)) > 1),
  category text not null default 'canaria',
  cuisine text not null default '',
  description text not null default '',
  cover_url text,
  address text not null default '',
  lat double precision,
  lng double precision,
  phone text not null default '',
  email text not null default '',
  min_order numeric(6, 2) not null default 0 check (min_order >= 0),
  prep_min integer not null default 15 check (prep_min >= 0),
  prep_max integer not null default 25 check (prep_max >= prep_min),
  active boolean not null default true,            -- visible en la app
  accepting_orders boolean not null default true,  -- pausa temporal de pedidos
  rating_sum integer not null default 0,
  rating_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index on public.restaurants (owner_id);

-- Varios tramos por día. Si closes <= opens, el tramo termina al día siguiente.
create table public.opening_hours (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = domingo
  opens time not null,
  closes time not null,
  check (opens <> closes or (opens = '00:00' and closes = '24:00'))
);
create index on public.opening_hours (restaurant_id);

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  position integer not null default 0
);
create index on public.menu_categories (restaurant_id);

create table public.dishes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  category_id uuid not null references public.menu_categories (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  price numeric(8, 2) not null check (price >= 0), -- precio del restaurante (sin recargo)
  image_url text,
  allergens text[] not null default '{}' check (
    allergens <@ array[
      'gluten', 'crustaceos', 'huevo', 'pescado', 'cacahuete', 'soja', 'lacteos',
      'frutos_cascara', 'apio', 'mostaza', 'sesamo', 'sulfitos', 'altramuces', 'moluscos'
    ]
  ),
  kcal integer,
  portion text not null default '',
  prep_minutes integer,
  tags text[] not null default '{}',
  available boolean not null default true,
  position integer not null default 0,
  orders_count integer not null default 0
);
create index on public.dishes (restaurant_id);
create index on public.dishes (category_id);

create table public.promo_codes (
  code text primary key check (code = upper(code) and code ~ '^[A-Z0-9]{3,20}$'),
  kind text not null check (kind in ('percent', 'fixed')),
  value numeric(8, 2) not null check (value > 0),
  min_subtotal numeric(8, 2) not null default 0,
  max_uses integer,
  uses integer not null default 0,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  tracking_token uuid not null unique default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  customer_id uuid references public.profiles (id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  address jsonb not null, -- {street, details, notes}
  lat double precision not null,
  lng double precision not null,
  distance_km numeric(6, 2) not null,
  scheduled_for timestamptz,
  status public.order_status not null default 'pending_payment',
  payment_status public.payment_status not null default 'pending',
  payment_method public.payment_method not null,
  stripe_session_id text,
  -- importes (los que ve el cliente)
  subtotal numeric(10, 2) not null,
  delivery_fee numeric(10, 2) not null,
  tip numeric(10, 2) not null default 0,
  discount numeric(10, 2) not null default 0,
  promo_code text references public.promo_codes (code) on delete set null,
  total numeric(10, 2) not null,
  -- reparto económico
  restaurant_subtotal numeric(10, 2) not null, -- precios del restaurante
  markup_pct numeric(5, 2) not null,
  markup_amount numeric(10, 2) not null,
  commission_pct numeric(5, 2) not null,
  commission_amount numeric(10, 2) not null,
  restaurant_payout numeric(10, 2) not null,
  -- reparto
  rider_id uuid references public.profiles (id) on delete set null,
  rider_lat double precision,
  rider_lng double precision,
  rider_location_at timestamptz,
  rating smallint check (rating between 1 and 5),
  notified jsonb not null default '{}',
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  accepted_at timestamptz,
  ready_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz
);
create index on public.orders (restaurant_id, created_at desc);
create index on public.orders (customer_id, created_at desc);
create index on public.orders (rider_id, created_at desc);
create index on public.orders (status);

create table public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  dish_id uuid references public.dishes (id) on delete set null,
  name text not null,
  base_price numeric(8, 2) not null,
  unit_price numeric(8, 2) not null,
  qty integer not null check (qty between 1 and 50),
  note text not null default ''
);
create index on public.order_items (order_id);

-- Propinas extra añadidas después del pedido
create table public.tip_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  amount numeric(8, 2) not null check (amount > 0),
  status public.payment_status not null default 'pending',
  stripe_session_id text,
  created_at timestamptz not null default now()
);

create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, restaurant_id)
);
