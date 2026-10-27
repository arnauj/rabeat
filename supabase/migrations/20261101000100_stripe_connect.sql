-- Stripe Connect: cada restaurante cobra en su propia cuenta Express (destination charges).
-- rabeat cobra al cliente y Stripe transfiere al instante la parte del restaurante a su cuenta.
-- Sin cuenta activa, el cobro sigue centralizado y se liquida a mano en Panel → Liquidaciones.

-- Cuenta conectada de cada restaurante. Solo la escribe el servidor (stripe-connect y el webhook).
create table public.restaurant_stripe_accounts (
  restaurant_id uuid primary key references public.restaurants (id) on delete cascade,
  account_id text not null unique,
  details_submitted boolean not null default false,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  -- Capacidad «transfers» activa: ya se le pueden enviar sus ventas
  transfers_active boolean not null default false,
  requirements_due text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.restaurant_stripe_accounts enable row level security;
create policy "ver cuenta de cobros" on public.restaurant_stripe_accounts
  for select using (public.can_manage_restaurant(restaurant_id));
grant select on public.restaurant_stripe_accounts to authenticated;

-- Importe transferido automáticamente al restaurante en cada cobro (null = cobro centralizado)
alter table public.orders
  add column if not exists stripe_account_id text,
  add column if not exists connect_amount numeric(10, 2);
alter table public.staff_tips
  add column if not exists stripe_account_id text,
  add column if not exists connect_amount numeric(10, 2);

-- Informe global: añade lo ya transferido por Stripe a cada restaurante
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
    'connect_transferred', (select coalesce(sum(connect_amount), 0) from s),
    'cash_orders', (select count(*) from s where payment_method = 'cash'),
    'by_restaurant', coalesce((
      select jsonb_agg(x order by (x ->> 'payout')::numeric desc) from (
        select jsonb_build_object(
          'id', r.id, 'name', r.name, 'orders', count(s.id),
          'dine_in_orders', count(s.id) filter (where s.order_type = 'dine_in'),
          'gross', sum(s.restaurant_subtotal), 'tax', sum(s.restaurant_tax), 'commission', sum(s.commission_amount),
          'payout', sum(s.restaurant_payout),
          'connect_transferred', coalesce(sum(s.connect_amount), 0),
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

-- Propinas al equipo: añade la parte ya transferida por Stripe
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
      select jsonb_agg(jsonb_build_object('id', restaurant_id, 'name', name, 'total', total, 'count', n, 'connect_total', connect_total) order by total desc)
      from (
        select restaurant_id, min(restaurant_name) as name, sum(amount) as total, count(*) as n, coalesce(sum(connect_amount), 0) as connect_total
        from s group by restaurant_id
      ) x
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
