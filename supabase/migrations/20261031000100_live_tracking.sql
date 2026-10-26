-- Seguimiento en directo: el rider envía su posición una vez para todos sus pedidos en curso
create or replace function public.rider_ping(p_lat double precision, p_lng double precision)
returns integer
language sql security definer set search_path = public
as $$
  with u as (
    update public.orders
       set rider_lat = p_lat, rider_lng = p_lng, rider_location_at = now()
     where rider_id = auth.uid() and status in ('confirmed', 'preparing', 'ready', 'on_the_way')
       and p_lat between -90 and 90 and p_lng between -180 and 180
    returning 1
  )
  select count(*)::int from u
$$;
revoke execute on function public.rider_ping(double precision, double precision) from public, anon;
grant execute on function public.rider_ping(double precision, double precision) to authenticated;
