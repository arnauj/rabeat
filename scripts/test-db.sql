-- Pruebas de permisos y flujo de pedido sobre la base local
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FALLO: %', msg; end if;
  raise notice 'ok · %', msg;
end $$;

-- Usuarios
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'super@x.es', '{"full_name":"Super"}'),
  ('00000000-0000-0000-0000-000000000002', 'resto@x.es', '{"full_name":"Resto"}'),
  ('00000000-0000-0000-0000-000000000003', 'otro@x.es', '{"full_name":"Otro"}'),
  ('00000000-0000-0000-0000-000000000004', 'rider@x.es', '{"full_name":"Yeray Rider","phone":"600"}'),
  ('00000000-0000-0000-0000-000000000005', 'cliente@x.es', '{"full_name":"Cliente"}');
update public.profiles set role = 'superuser' where email = 'super@x.es';
update public.profiles set role = 'restaurant' where email in ('resto@x.es', 'otro@x.es');
update public.profiles set role = 'rider' where email = 'rider@x.es';
select pg_temp.ok((select count(*) = 5 from public.profiles), 'perfiles creados por trigger');
update public.restaurants set owner_id = '00000000-0000-0000-0000-000000000002' where slug = 'conejo-burger';

-- Anónimo
begin;
set local role anon;
select pg_temp.ok((select count(*) = 8 from public.restaurants), 'anon ve restaurantes');
select pg_temp.ok((select count(*) > 0 from public.dishes), 'anon ve platos');
select pg_temp.ok((select count(*) = 0 from public.orders), 'anon no ve pedidos');
select pg_temp.ok((select count(*) = 0 from public.profiles), 'anon no ve perfiles');
select pg_temp.ok((select restaurant_commission_pct = 15 from public.settings), 'anon lee ajustes');
commit;

-- Cliente no puede hacerse superusuario
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
do $$ begin
  update public.profiles set role = 'superuser' where id = auth.uid();
  raise exception 'FALLO: el cliente pudo cambiar su rol';
exception when raise_exception then
  if sqlerrm like 'FALLO%' then raise; end if;
  raise notice 'ok · cliente no puede cambiar su rol';
end $$;
update public.profiles set full_name = 'Cliente Feliz' where id = auth.uid();
select pg_temp.ok((select full_name = 'Cliente Feliz' from public.profiles where id = auth.uid()), 'cliente edita su nombre');
select pg_temp.ok((select count(*) = 1 from public.profiles), 'cliente solo ve su perfil');
update public.settings set restaurant_commission_pct = 0;
select pg_temp.ok((select restaurant_commission_pct = 15 from public.settings), 'cliente no cambia ajustes');
do $$ begin
  insert into public.restaurants (slug, name) values ('hack', 'Hack');
  raise exception 'FALLO: cliente creó restaurante';
exception when insufficient_privilege then raise notice 'ok · cliente no crea restaurantes';
end $$;
commit;

-- Restaurante
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
insert into public.restaurants (slug, name, owner_id) values ('mi-local', 'Mi Local', '00000000-0000-0000-0000-000000000003');
select pg_temp.ok((select owner_id = auth.uid() from public.restaurants where slug = 'mi-local'), 'el dueño se fuerza al usuario actual');
insert into public.opening_hours (restaurant_id, weekday, opens, closes)
  select id, 1, '12:00', '16:00' from public.restaurants where slug = 'mi-local';
insert into public.opening_hours (restaurant_id, weekday, opens, closes)
  select id, 1, '20:00', '01:00' from public.restaurants where slug = 'mi-local';
insert into public.menu_categories (restaurant_id, name) select id, 'Entrantes' from public.restaurants where slug = 'mi-local';
insert into public.dishes (restaurant_id, category_id, name, price, allergens)
  select r.id, c.id, 'Croquetas', 6.5, '{gluten,huevo}' from public.restaurants r join public.menu_categories c on c.restaurant_id = r.id where r.slug = 'mi-local';
select pg_temp.ok((select count(*) = 1 from public.dishes d join public.restaurants r on r.id = d.restaurant_id where r.slug = 'mi-local'), 'restaurante crea carta');
update public.dishes set price = 0.01 where restaurant_id = (select id from public.restaurants where slug = 'sushi-atlantico');
select pg_temp.ok((select min(price) > 1 from public.dishes where restaurant_id = (select id from public.restaurants where slug = 'sushi-atlantico')), 'restaurante no edita platos ajenos');
update public.dishes set price = 11 where name = 'La Clásica';
select pg_temp.ok((select price = 11 from public.dishes where name = 'La Clásica'), 'restaurante edita su restaurante asignado');
update public.restaurants set owner_id = null, rating_sum = 999999 where slug = 'conejo-burger';
select pg_temp.ok((select owner_id is not null and rating_sum < 999999 from public.restaurants where slug = 'conejo-burger'), 'no puede cederse ni inflar valoraciones');
do $$ begin
  insert into public.dishes (restaurant_id, category_id, name, price)
  select r.id, (select c.id from public.menu_categories c where c.restaurant_id = r.id limit 1), 'X', 1 from public.restaurants r where r.slug = 'sushi-atlantico';
  raise exception 'FALLO: insertó plato en restaurante ajeno';
exception when insufficient_privilege then raise notice 'ok · no inserta platos en restaurantes ajenos';
end $$;
commit;

-- Superusuario
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
update public.settings set restaurant_commission_pct = 20, price_markup_pct = 10;
select pg_temp.ok((select restaurant_commission_pct = 20 from public.settings), 'superusuario cambia comisiones');
update public.dishes set available = false where name = 'Tiramisú';
select pg_temp.ok((select not available from public.dishes where name = 'Tiramisú'), 'superusuario edita cualquier carta');
select pg_temp.ok((select count(*) = 5 from public.profiles), 'superusuario ve todos los perfiles');
commit;

-- Pedido creado por el servidor (service role)
insert into public.orders (code, restaurant_id, customer_id, customer_name, customer_email, customer_phone, address, lat, lng, distance_km,
  status, payment_method, subtotal, delivery_fee, tip, total, restaurant_subtotal, markup_pct, markup_amount, commission_pct, commission_amount, restaurant_payout)
select 'RBTEST1', id, '00000000-0000-0000-0000-000000000005', 'Cliente', 'cliente@x.es', '611', '{"street":"Triana 42"}', 28.1, -15.41, 2.1,
  'pending_payment', 'card', 24.2, 2.76, 2, 28.96, 22, 10, 2.2, 20, 4.4, 17.6
from public.restaurants where slug = 'conejo-burger';
insert into public.order_items (order_id, dish_id, name, base_price, unit_price, qty)
select o.id, d.id, d.name, 11, 12.1, 2 from public.orders o, public.dishes d where o.code = 'RBTEST1' and d.name = 'La Clásica';

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select pg_temp.ok((select count(*) = 0 from public.orders), 'rider no ve pedidos sin pagar');
commit;

select public.mark_order_paid((select id from public.orders where code = 'RBTEST1'), 'cs_test');
select pg_temp.ok((select status = 'confirmed' and payment_status = 'paid' from public.orders where code = 'RBTEST1'), 'pago confirmado');
select pg_temp.ok((select orders_count = 5402 from public.dishes where name = 'La Clásica'), 'contador de platos');

select tracking_token as tok from public.orders where code = 'RBTEST1' \gset
begin;
set local role anon;
do $$ begin
  perform public.mark_order_paid((select id from public.orders limit 1));
  raise exception 'FALLO: anon marcó pagado';
exception when insufficient_privilege then raise notice 'ok · anon no puede marcar pagado';
end $$;
select pg_temp.ok(public.get_tracking(:'tok') ->> 'status' = 'confirmed', 'seguimiento por token');
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.ok((select count(*) = 0 from public.orders), 'otro restaurante no ve el pedido');
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select pg_temp.ok((select count(*) = 1 from public.orders), 'rider ve pedido disponible');
do $$ begin
  perform public.set_order_status((select id from public.orders where code = 'RBTEST1'), 'delivered');
  raise exception 'FALLO: rider no asignado cambió estado';
exception when raise_exception then
  if sqlerrm like 'FALLO%' then raise; end if;
  raise notice 'ok · rider no asignado no cambia estado';
end $$;
select public.rider_accept_order((select id from public.orders where code = 'RBTEST1'));
select pg_temp.ok((select rider_id = auth.uid() from public.orders where code = 'RBTEST1'), 'rider acepta');
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select public.set_order_status((select id from public.orders where code = 'RBTEST1'), 'preparing');
select public.set_order_status((select id from public.orders where code = 'RBTEST1'), 'ready');
select pg_temp.ok((select status = 'ready' from public.orders where code = 'RBTEST1'), 'restaurante prepara y marca listo');
do $$ begin
  perform public.set_order_status((select id from public.orders where code = 'RBTEST1'), 'delivered');
  raise exception 'FALLO: restaurante marcó entregado';
exception when raise_exception then
  if sqlerrm like 'FALLO%' then raise; end if;
  raise notice 'ok · restaurante no puede marcar entregado';
end $$;
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select public.rider_update_location((select id from public.orders where code = 'RBTEST1'), 28.11, -15.42);
select public.set_order_status((select id from public.orders where code = 'RBTEST1'), 'on_the_way');
select public.set_order_status((select id from public.orders where code = 'RBTEST1'), 'delivered');
select pg_temp.ok((select status = 'delivered' and rider_lat = 28.11 from public.orders where code = 'RBTEST1'), 'rider recoge y entrega');
select pg_temp.ok((select (public.rider_earnings(now() - interval '1 day', now() + interval '1 day') ->> 'tips')::numeric = 2), 'ganancias del rider');
commit;

begin;
set local role anon;
select public.rate_order(:'tok', 5);
commit;
select pg_temp.ok((select rating = 5 from public.orders where code = 'RBTEST1'), 'valoración guardada');

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select pg_temp.ok((select (public.restaurant_sales(null, now() - interval '1 day', now() + interval '1 day') ->> 'payout')::numeric = 17.6), 'ventas del restaurante');
select public.restaurant_sales(null, now() - interval '1 day', now() + interval '1 day');
do $$ begin
  perform public.platform_report(now() - interval '1 day', now());
  raise exception 'FALLO: restaurante vio informe global';
exception when raise_exception then
  if sqlerrm like 'FALLO%' then raise; end if;
  raise notice 'ok · restaurante no ve el informe global';
end $$;
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.platform_report(now() - interval '1 day', now() + interval '1 day');
commit;

-- ---------- Pedidos en mesa ----------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
insert into public.restaurant_tables (restaurant_id, name) select id, 'Mesa 4' from public.restaurants where slug = 'conejo-burger';
select pg_temp.ok((select count(*) = 1 from public.restaurant_tables), 'restaurante crea mesa');
commit;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.ok((select count(*) = 0 from public.restaurant_tables), 'otro restaurante no ve las mesas ajenas');
do $$ begin
  insert into public.restaurant_tables (restaurant_id, name) select id, 'X' from public.restaurants where slug = 'conejo-burger';
  raise exception 'FALLO: creó mesa ajena';
exception when insufficient_privilege then raise notice 'ok · no crea mesas en restaurantes ajenos';
end $$;
commit;
select code as tcode from public.restaurant_tables where name = 'Mesa 4' \gset
begin;
set local role anon;
select pg_temp.ok(public.get_table(:'tcode') -> 'restaurant' ->> 'slug' = 'conejo-burger', 'anon resuelve la mesa del QR');
select pg_temp.ok(public.get_table('noexiste') is null, 'código de mesa inexistente');
commit;

insert into public.orders (code, order_type, table_id, table_name, restaurant_id, customer_name, status, payment_method,
  subtotal, delivery_fee, total, restaurant_subtotal, markup_pct, markup_amount, commission_pct, commission_amount, restaurant_payout)
select 'RBMESA1', 'dine_in', t.id, t.name, t.restaurant_id, 'Mesa 4', 'confirmed', 'cash', 11, 0, 11, 11, 0, 0, 5, 0.55, 10.45
from public.restaurant_tables t where t.name = 'Mesa 4';
do $$ begin
  insert into public.orders (code, restaurant_id, customer_name, payment_method, subtotal, delivery_fee, total, restaurant_subtotal, markup_pct, markup_amount, commission_pct, commission_amount, restaurant_payout)
  select 'RBBAD', id, 'x', 'cash', 1, 0, 1, 1, 0, 0, 0, 0, 1 from public.restaurants limit 1;
  raise exception 'FALLO: pedido a domicilio sin dirección';
exception when check_violation then raise notice 'ok · domicilio exige dirección';
end $$;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select pg_temp.ok((select count(*) = 0 from public.orders where code = 'RBMESA1'), 'rider no ve pedidos en mesa');
do $$ begin
  perform public.rider_accept_order((select id from public.orders where code = 'RBMESA1'));
  raise exception 'FALLO: rider aceptó pedido en mesa';
exception when raise_exception then
  if sqlerrm like 'FALLO%' then raise; end if;
  raise notice 'ok · rider no acepta pedidos en mesa';
end $$;
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select public.set_order_status((select id from public.orders where code = 'RBMESA1'), 'preparing');
select public.set_order_status((select id from public.orders where code = 'RBMESA1'), 'delivered');
select pg_temp.ok((select status = 'delivered' and payment_status = 'paid' from public.orders where code = 'RBMESA1'), 'restaurante sirve y cobra en mesa');
select pg_temp.ok((public.restaurant_sales(null, now() - interval '1 day', now() + interval '1 day') ->> 'dine_in_orders')::int = 1, 'ventas separan mesa');
commit;
\echo TODAS LAS PRUEBAS OK
