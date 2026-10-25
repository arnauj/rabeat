-- PayPal como método de pago (vía Stripe) y detalle del medio usado (Apple Pay, Google Pay, tarjeta…)
alter type public.payment_method add value if not exists 'paypal';

alter table public.orders add column if not exists payment_detail text;  -- apple_pay · google_pay · visa ·4242 · paypal

-- Seguimiento: incluye el medio de pago concreto
create or replace function public.get_tracking(p_token uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id, 'code', o.code, 'token', o.tracking_token,
    'order_type', o.order_type, 'table_name', o.table_name,
    'status', o.status, 'payment_status', o.payment_status, 'payment_method', o.payment_method, 'payment_detail', o.payment_detail,
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
