-- rabeat · pedidos en mesa con QR

-- Comisión y recargo propios de los pedidos hechos desde la mesa del restaurante
alter table public.settings
  add column dine_in_commission_pct numeric(5, 2) not null default 5 check (dine_in_commission_pct between 0 and 100),
  add column dine_in_markup_pct numeric(5, 2) not null default 0 check (dine_in_markup_pct between 0 and 100);

create table public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  code text not null unique default encode(gen_random_bytes(6), 'hex'), -- va en el QR
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index on public.restaurant_tables (restaurant_id);

alter table public.restaurant_tables enable row level security;
create policy "gestionar mesas" on public.restaurant_tables
  for all using (public.can_manage_restaurant(restaurant_id)) with check (public.can_manage_restaurant(restaurant_id));
grant select, insert, update, delete on public.restaurant_tables to authenticated;

-- Pedidos: a domicilio (delivery) o en mesa (dine_in, sin dirección ni envío)
alter table public.orders
  add column order_type text not null default 'delivery' check (order_type in ('delivery', 'dine_in')),
  add column table_id uuid references public.restaurant_tables (id) on delete set null,
  add column table_name text,
  alter column address drop not null,
  alter column lat drop not null,
  alter column lng drop not null,
  alter column distance_km drop not null,
  alter column customer_email drop not null,
  alter column customer_phone drop not null,
  add constraint delivery_needs_address check (
    order_type = 'dine_in' or (address is not null and lat is not null and lng is not null and distance_km is not null
                               and customer_email is not null and customer_phone is not null)
  ),
  add constraint dine_in_needs_table check (order_type = 'delivery' or table_name is not null);

-- Los repartidores solo ven pedidos a domicilio
drop policy "ver pedidos" on public.orders;
create policy "ver pedidos" on public.orders
  for select using (
    public.is_superuser()
    or customer_id = auth.uid()
    or rider_id = auth.uid()
    or public.can_manage_restaurant(restaurant_id)
    or (
      public.my_role() = 'rider' and rider_id is null and order_type = 'delivery'
      and status in ('confirmed', 'preparing', 'ready')
    )
  );

-- Mesa pública a partir del código del QR
create or replace function public.get_table(p_code text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', t.id, 'name', t.name, 'code', t.code,
    'restaurant', jsonb_build_object('id', r.id, 'slug', r.slug, 'name', r.name)
  )
  from public.restaurant_tables t
  join public.restaurants r on r.id = t.restaurant_id
  where t.code = lower(trim(p_code)) and t.active and r.active
$$;
grant execute on function public.get_table(text) to anon, authenticated;

-- Estados: en mesa, el propio restaurante sirve el pedido
create or replace function public.set_order_status(p_order uuid, p_status public.order_status)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  o public.orders;
  me uuid := auth.uid();
  is_super boolean := public.is_superuser();
  is_owner boolean;
  is_rider boolean;
  allowed boolean := false;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Pedido no encontrado'; end if;

  is_owner := public.can_manage_restaurant(o.restaurant_id);
  is_rider := o.rider_id is not null and o.rider_id = me and public.my_role() = 'rider';

  if is_super then
    allowed := true;
  elsif is_owner then
    allowed := (o.status = 'confirmed' and p_status = 'preparing')
            or (o.status = 'preparing' and p_status = 'ready')
            or (o.order_type = 'dine_in' and o.status in ('preparing', 'ready') and p_status = 'delivered')
            or (o.status in ('confirmed', 'preparing', 'ready') and p_status = 'cancelled');
  elsif is_rider then
    allowed := (o.status in ('confirmed', 'preparing', 'ready') and p_status = 'on_the_way')
            or (o.status = 'on_the_way' and p_status = 'delivered');
  end if;

  if not allowed then
    raise exception 'No puedes pasar el pedido de % a %', o.status, p_status;
  end if;

  update public.orders set
    status = p_status,
    ready_at = case when p_status = 'ready' then coalesce(ready_at, now()) else ready_at end,
    picked_up_at = case when p_status = 'on_the_way' then coalesce(picked_up_at, now()) else picked_up_at end,
    delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
    cancelled_at = case when p_status = 'cancelled' then coalesce(cancelled_at, now()) else cancelled_at end,
    payment_status = case
      when p_status = 'delivered' and payment_method = 'cash' then 'paid'::public.payment_status
      else payment_status end,
    paid_at = case when p_status = 'delivered' and payment_method = 'cash' then coalesce(paid_at, now()) else paid_at end
  where id = p_order
  returning * into o;
  return o;
end;
$$;

create or replace function public.rider_accept_order(p_order uuid)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare o public.orders;
begin
  if public.my_role() is distinct from 'rider' then raise exception 'Solo los repartidores pueden aceptar pedidos'; end if;
  update public.orders
     set rider_id = auth.uid(), accepted_at = now()
   where id = p_order and rider_id is null and order_type = 'delivery' and status in ('confirmed', 'preparing', 'ready')
  returning * into o;
  if not found then raise exception 'Este pedido ya no está disponible'; end if;
  return o;
end;
$$;

-- Seguimiento: añade tipo de pedido y mesa
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
    'total', o.total, 'promo_code', o.promo_code, 'rating', o.rating,
    'rider_lat', o.rider_lat, 'rider_lng', o.rider_lng, 'rider_location_at', o.rider_location_at,
    'restaurant', jsonb_build_object(
      'id', r.id, 'slug', r.slug, 'name', r.name, 'cover_url', r.cover_url, 'address', r.address,
      'lat', r.lat, 'lng', r.lng, 'phone', r.phone, 'prep_min', r.prep_min, 'prep_max', r.prep_max
    ),
    'rider', case when p.id is null then null else jsonb_build_object('name', split_part(p.full_name, ' ', 1), 'phone', p.phone) end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'unit_price', i.unit_price, 'note', i.note) order by i.id)
      from public.order_items i where i.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  join public.restaurants r on r.id = o.restaurant_id
  left join public.profiles p on p.id = o.rider_id
  where o.tracking_token = p_token
$$;

-- Ventas del restaurante separando domicilio y mesa
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

-- Informe global: añade el desglose por tipo
create or replace function public.platform_report(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_superuser() then raise exception 'Solo superusuarios'; end if;
  -- orders.tip y orders.total ya incluyen las propinas extra pagadas
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
    'restaurant_payouts', (select coalesce(sum(restaurant_payout), 0) from s),
    'cash_orders', (select count(*) from s where payment_method = 'cash'),
    'by_restaurant', coalesce((
      select jsonb_agg(x order by (x ->> 'payout')::numeric desc) from (
        select jsonb_build_object(
          'id', r.id, 'name', r.name, 'orders', count(s.id),
          'dine_in_orders', count(s.id) filter (where s.order_type = 'dine_in'),
          'gross', sum(s.restaurant_subtotal), 'commission', sum(s.commission_amount),
          'payout', sum(s.restaurant_payout),
          -- efectivo cobrado por riders (domicilio) o por el propio local (mesa)
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
