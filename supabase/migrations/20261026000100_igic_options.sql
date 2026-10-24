-- rabeat · IGIC, datos ampliados de platos y opciones (menús, tamaños, extras)

-- IGIC: los precios se introducen sin impuesto; el sistema lo calcula
alter table public.settings
  add column igic_pct numeric(5, 2) not null default 7 check (igic_pct between 0 and 30);

alter table public.dishes
  add column code text not null default '',            -- número en la carta: "26-A"
  add column name_en text not null default '',
  add column description_en text not null default '',
  add column tax_pct numeric(5, 2) check (tax_pct between 0 and 30), -- null = tipo general
  add column schedule jsonb;                           -- null = siempre; [{weekday, opens, closes}]

-- Grupos de opciones: "Primer plato" (elige 1), "Proteína" (1 incluida, extra +2,50 €)…
create table public.dish_option_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  dish_id uuid not null references public.dishes (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  min_select integer not null default 0 check (min_select >= 0),
  max_select integer not null default 1 check (max_select >= 1),
  free_select integer,                                  -- incluidas sin coste (null = todas)
  extra_price numeric(8, 2) not null default 0 check (extra_price >= 0), -- por cada una por encima de free_select
  position integer not null default 0,
  check (max_select >= min_select)
);
create index on public.dish_option_groups (dish_id);

create table public.dish_options (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  group_id uuid not null references public.dish_option_groups (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  price_delta numeric(8, 2) not null default 0,         -- sin IGIC, como el precio del plato
  allergens text[] not null default '{}' check (
    allergens <@ array[
      'gluten', 'crustaceos', 'huevo', 'pescado', 'cacahuete', 'soja', 'lacteos',
      'frutos_cascara', 'apio', 'mostaza', 'sesamo', 'sulfitos', 'altramuces', 'moluscos'
    ]
  ),
  available boolean not null default true,
  position integer not null default 0
);
create index on public.dish_options (group_id);

alter table public.dish_option_groups enable row level security;
alter table public.dish_options enable row level security;
create policy "grupos visibles" on public.dish_option_groups
  for select using (exists (select 1 from public.restaurants r where r.id = restaurant_id));
create policy "gestionar grupos" on public.dish_option_groups
  for all using (public.can_manage_restaurant(restaurant_id)) with check (public.can_manage_restaurant(restaurant_id));
create policy "opciones visibles" on public.dish_options
  for select using (exists (select 1 from public.restaurants r where r.id = restaurant_id));
create policy "gestionar opciones" on public.dish_options
  for all using (public.can_manage_restaurant(restaurant_id)) with check (public.can_manage_restaurant(restaurant_id));
grant select on public.dish_option_groups, public.dish_options to anon, authenticated;
grant insert, update, delete on public.dish_option_groups, public.dish_options to authenticated;

-- Importes con IGIC
alter table public.orders
  add column tax_amount numeric(10, 2) not null default 0,     -- IGIC incluido en el total
  add column restaurant_tax numeric(10, 2) not null default 0, -- IGIC de la comida (lo declara el restaurante)
  add column tax_breakdown jsonb not null default '[]';        -- [{rate, base, tax}]

alter table public.order_items
  add column tax_pct numeric(5, 2) not null default 0,
  add column options jsonb not null default '[]';              -- [{group, name, price}]

-- Seguimiento: IGIC y opciones de cada línea
create or replace function public.get_tracking(p_token uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id, 'code', o.code, 'token', o.tracking_token,
    'order_type', o.order_type, 'table_name', o.table_name,
    'status', o.status, 'payment_status', o.payment_status, 'payment_method', o.payment_method,
    'scheduled_for', o.scheduled_for, 'created_at', o.created_at, 'paid_at', o.paid_at,
    'accepted_at', o.accepted_at, 'ready_at', o.ready_at, 'picked_up_at', o.picked_up_at,
    'delivered_at', o.delivered_at, 'cancelled_at', o.cancelled_at,
    'customer_name', o.customer_name, 'address', o.address, 'lat', o.lat, 'lng', o.lng,
    'distance_km', o.distance_km,
    'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee, 'tip', o.tip, 'discount', o.discount,
    'total', o.total, 'tax_amount', o.tax_amount, 'tax_breakdown', o.tax_breakdown,
    'promo_code', o.promo_code, 'rating', o.rating,
    'rider_lat', o.rider_lat, 'rider_lng', o.rider_lng, 'rider_location_at', o.rider_location_at,
    'restaurant', jsonb_build_object(
      'id', r.id, 'slug', r.slug, 'name', r.name, 'cover_url', r.cover_url, 'address', r.address,
      'lat', r.lat, 'lng', r.lng, 'phone', r.phone, 'prep_min', r.prep_min, 'prep_max', r.prep_max
    ),
    'rider', case when p.id is null then null else jsonb_build_object('name', split_part(p.full_name, ' ', 1), 'phone', p.phone) end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'unit_price', i.unit_price, 'note', i.note, 'options', i.options) order by i.id)
      from public.order_items i where i.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  join public.restaurants r on r.id = o.restaurant_id
  left join public.profiles p on p.id = o.rider_id
  where o.tracking_token = p_token
$$;

-- Ventas: añade el IGIC de la comida (el neto a cobrar ya lo incluye)
create or replace function public.restaurant_sales(p_restaurant uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  ids uuid[];
  tz text := (select timezone from public.settings where id = 1);
  result jsonb;
begin
  if p_restaurant is not null then
    if not public.can_manage_restaurant(p_restaurant) then raise exception 'Sin permiso'; end if;
    ids := array[p_restaurant];
  elsif public.is_superuser() then
    select array_agg(id) into ids from public.restaurants;
  else
    select array_agg(id) into ids from public.restaurants where owner_id = auth.uid();
  end if;

  with s as (
    select o.* from public.orders o
    where o.restaurant_id = any (coalesce(ids, '{}')) and o.created_at >= p_from and o.created_at < p_to and public.is_sale(o)
  )
  select jsonb_build_object(
    'orders', (select count(*) from s),
    'delivery_orders', (select count(*) from s where order_type = 'delivery'),
    'dine_in_orders', (select count(*) from s where order_type = 'dine_in'),
    'dine_in_gross', (select coalesce(sum(restaurant_subtotal), 0) from s where order_type = 'dine_in'),
    'gross', (select coalesce(sum(restaurant_subtotal), 0) from s),
    'tax', (select coalesce(sum(restaurant_tax), 0) from s),
    'commission', (select coalesce(sum(commission_amount), 0) from s),
    'payout', (select coalesce(sum(restaurant_payout), 0) from s),
    'avg_ticket', (select coalesce(round(avg(restaurant_subtotal), 2), 0) from s),
    'cancelled', (select count(*) from public.orders o where o.restaurant_id = any (coalesce(ids, '{}'))
                    and o.created_at >= p_from and o.created_at < p_to and o.status = 'cancelled'),
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d, 'orders', n, 'gross', g) order by d)
      from (
        select (created_at at time zone tz)::date as d, count(*) as n, sum(restaurant_subtotal) as g
        from s group by 1
      ) x
    ), '[]'::jsonb),
    'top_dishes', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'qty', q, 'gross', g) order by q desc)
      from (
        select i.name, sum(i.qty) as q, sum(i.qty * i.base_price) as g
        from public.order_items i join s on s.id = i.order_id
        group by i.name order by q desc limit 8
      ) t
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Informe global: IGIC total y la parte que declara cada restaurante
create or replace function public.platform_report(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_superuser() then raise exception 'Solo superusuarios'; end if;
  with s as (
    select o.* from public.orders o
    where o.created_at >= p_from and o.created_at < p_to and public.is_sale(o)
  )
  select jsonb_build_object(
    'orders', (select count(*) from s),
    'dine_in_orders', (select count(*) from s where order_type = 'dine_in'),
    'dine_in_commission', (select coalesce(sum(commission_amount), 0) from s where order_type = 'dine_in'),
    'gmv', (select coalesce(sum(total), 0) from s),
    'markup', (select coalesce(sum(markup_amount), 0) from s),
    'commission', (select coalesce(sum(commission_amount), 0) from s),
    'delivery', (select coalesce(sum(delivery_fee), 0) from s),
    'discounts', (select coalesce(sum(discount), 0) from s),
    'tips', (select coalesce(sum(tip), 0) from s),
    'tax', (select coalesce(sum(tax_amount), 0) from s),
    'restaurant_tax', (select coalesce(sum(restaurant_tax), 0) from s),
    'restaurant_payouts', (select coalesce(sum(restaurant_payout), 0) from s),
    'cash_orders', (select count(*) from s where payment_method = 'cash'),
    'by_restaurant', coalesce((
      select jsonb_agg(x order by (x ->> 'payout')::numeric desc) from (
        select jsonb_build_object(
          'id', r.id, 'name', r.name, 'orders', count(s.id),
          'dine_in_orders', count(s.id) filter (where s.order_type = 'dine_in'),
          'gross', sum(s.restaurant_subtotal), 'tax', sum(s.restaurant_tax), 'commission', sum(s.commission_amount),
          'payout', sum(s.restaurant_payout),
          'cash_collected', coalesce(sum(s.total) filter (where s.payment_method = 'cash' and s.order_type = 'delivery'), 0),
          'cash_in_restaurant', coalesce(sum(s.total) filter (where s.payment_method = 'cash' and s.order_type = 'dine_in'), 0)
        ) as x
        from s join public.restaurants r on r.id = s.restaurant_id
        group by r.id, r.name
      ) q
    ), '[]'::jsonb),
    'by_rider', coalesce((
      select jsonb_agg(x order by (x ->> 'tips')::numeric desc) from (
        select jsonb_build_object(
          'id', p.id, 'name', p.full_name, 'email', p.email,
          'deliveries', count(s.id) filter (where s.status = 'delivered'),
          'tips', sum(s.tip),
          'cash_collected', coalesce(sum(s.total) filter (where s.payment_method = 'cash' and s.status = 'delivered'), 0)
        ) as x
        from s join public.profiles p on p.id = s.rider_id
        group by p.id, p.full_name, p.email
      ) q
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
