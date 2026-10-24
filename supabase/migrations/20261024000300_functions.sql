-- rabeat · funciones de negocio (RPC)

-- ---------- Estado de pedidos ----------
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
   where id = p_order and rider_id is null and status in ('confirmed', 'preparing', 'ready')
  returning * into o;
  if not found then raise exception 'Este pedido ya no está disponible'; end if;
  return o;
end;
$$;

create or replace function public.rider_release_order(p_order uuid)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare o public.orders;
begin
  update public.orders
     set rider_id = null, accepted_at = null, rider_lat = null, rider_lng = null
   where id = p_order and rider_id = auth.uid() and status in ('confirmed', 'preparing', 'ready')
  returning * into o;
  if not found then raise exception 'No puedes liberar este pedido'; end if;
  return o;
end;
$$;

create or replace function public.rider_update_location(p_order uuid, p_lat double precision, p_lng double precision)
returns void
language sql security definer set search_path = public
as $$
  update public.orders
     set rider_lat = p_lat, rider_lng = p_lng, rider_location_at = now()
   where id = p_order and rider_id = auth.uid() and status in ('confirmed', 'preparing', 'ready', 'on_the_way');
$$;

-- ---------- Seguimiento público por token ----------
create or replace function public.get_tracking(p_token uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id, 'code', o.code, 'token', o.tracking_token,
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

create or replace function public.rate_order(p_token uuid, p_rating integer)
returns void
language plpgsql security definer set search_path = public
as $$
declare o public.orders;
begin
  if p_rating not between 1 and 5 then raise exception 'Valoración no válida'; end if;
  select * into o from public.orders where tracking_token = p_token and status = 'delivered' for update;
  if not found then raise exception 'Solo puedes valorar pedidos entregados'; end if;
  update public.restaurants
     set rating_sum = rating_sum - coalesce(o.rating, 0) + p_rating,
         rating_count = rating_count + case when o.rating is null then 1 else 0 end
   where id = o.restaurant_id;
  update public.orders set rating = p_rating where id = o.id;
end;
$$;

-- ---------- Pago confirmado (solo servidor) ----------
create or replace function public.mark_order_paid(p_order uuid, p_session text default null)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare o public.orders;
begin
  update public.orders
     set payment_status = 'paid',
         paid_at = coalesce(paid_at, now()),
         status = case when status = 'pending_payment' then 'confirmed'::public.order_status else status end,
         stripe_session_id = coalesce(p_session, stripe_session_id)
   where id = p_order and payment_status <> 'paid'
  returning * into o;
  if found then
    perform public.on_order_confirmed(o.id);
  else
    select * into o from public.orders where id = p_order;
  end if;
  return o;
end;
$$;

-- Efectos al confirmar un pedido (pagado o en efectivo): usos de promo y contador de platos
create or replace function public.on_order_confirmed(p_order uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.promo_codes pc set uses = uses + 1
    from public.orders o where o.id = p_order and o.promo_code = pc.code;
  update public.dishes d set orders_count = orders_count + i.qty
    from public.order_items i where i.order_id = p_order and i.dish_id = d.id;
end;
$$;

revoke execute on function public.mark_order_paid(uuid, text) from public, anon, authenticated;
revoke execute on function public.on_order_confirmed(uuid) from public, anon, authenticated;

-- ---------- Informes ----------
-- Pedidos que cuentan como venta: confirmados en adelante y no cancelados
create or replace function public.is_sale(o public.orders)
returns boolean language sql immutable
as $$ select o.status in ('confirmed', 'preparing', 'ready', 'on_the_way', 'delivered') $$;

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
          'gross', sum(s.restaurant_subtotal), 'commission', sum(s.commission_amount),
          'payout', sum(s.restaurant_payout),
          'cash_collected', coalesce(sum(s.total) filter (where s.payment_method = 'cash'), 0)
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

create or replace function public.rider_earnings(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'deliveries', count(*) filter (where o.status = 'delivered'),
    'tips', coalesce(sum(o.tip) filter (where o.status = 'delivered'), 0),
    'km', coalesce(sum(o.distance_km) filter (where o.status = 'delivered'), 0),
    'cash_to_return', coalesce(sum(o.total) filter (where o.status = 'delivered' and o.payment_method = 'cash'), 0)
  )
  from public.orders o
  where o.rider_id = auth.uid() and o.created_at >= p_from and o.created_at < p_to
$$;

grant execute on function public.get_tracking(uuid), public.rate_order(uuid, integer) to anon, authenticated;
grant execute on function public.set_order_status(uuid, public.order_status), public.rider_accept_order(uuid),
  public.rider_release_order(uuid), public.rider_update_location(uuid, double precision, double precision),
  public.restaurant_sales(uuid, timestamptz, timestamptz), public.platform_report(timestamptz, timestamptz),
  public.rider_earnings(timestamptz, timestamptz) to authenticated;
