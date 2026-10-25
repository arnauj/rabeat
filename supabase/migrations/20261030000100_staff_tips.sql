-- Propinas para el equipo del restaurante desde el QR de una mesa, sin hacer pedido
create table public.staff_tips (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  table_id uuid references public.restaurant_tables (id) on delete set null,
  table_name text not null,
  amount numeric(10, 2) not null check (amount > 0),
  customer_name text,
  message text check (length(message) <= 280),
  payment_method public.payment_method not null,
  payment_detail text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  stripe_session_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index on public.staff_tips (restaurant_id, paid_at);

alter table public.staff_tips enable row level security;
-- Las crea el servidor (create con la clave de servicio); el restaurante y el superusuario las ven
create policy "ver propinas del equipo" on public.staff_tips
  for select using (public.can_manage_restaurant(restaurant_id));
grant select on public.staff_tips to authenticated;

-- Mesa pública: añade la portada para la pantalla de bienvenida del QR
create or replace function public.get_table(p_code text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', t.id, 'name', t.name, 'code', t.code,
    'restaurant', jsonb_build_object(
      'id', r.id, 'slug', r.slug, 'name', r.name, 'cover_url', r.cover_url,
      'cover_is_logo', r.cover_is_logo, 'cover_bg', r.cover_bg
    )
  )
  from public.restaurant_tables t
  join public.restaurants r on r.id = t.restaurant_id
  where t.code = lower(trim(p_code)) and t.active and r.active
$$;

-- Resumen de propinas cobradas (por restaurante y últimas recibidas)
create or replace function public.staff_tips_report(p_restaurant uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with s as (
    select t.*, r.name as restaurant_name
    from public.staff_tips t
    join public.restaurants r on r.id = t.restaurant_id
    where t.status = 'paid' and t.paid_at >= p_from and t.paid_at < p_to
      and (p_restaurant is null or t.restaurant_id = p_restaurant)
      and public.can_manage_restaurant(t.restaurant_id)
  )
  select jsonb_build_object(
    'total', coalesce((select sum(amount) from s), 0),
    'count', (select count(*) from s),
    'by_restaurant', coalesce((
      select jsonb_agg(jsonb_build_object('id', restaurant_id, 'name', name, 'total', total, 'count', n) order by total desc)
      from (select restaurant_id, min(restaurant_name) as name, sum(amount) as total, count(*) as n from s group by restaurant_id) x
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'amount', amount, 'table_name', table_name, 'customer_name', customer_name, 'message', message,
        'payment_method', payment_method, 'payment_detail', payment_detail, 'paid_at', paid_at, 'restaurant', restaurant_name
      ) order by paid_at desc)
      from (select * from s order by paid_at desc limit 30) y
    ), '[]'::jsonb)
  )
$$;
grant execute on function public.staff_tips_report(uuid, timestamptz, timestamptz) to authenticated;
