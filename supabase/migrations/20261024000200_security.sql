-- rabeat · roles, permisos y seguridad a nivel de fila (RLS)

-- ---------- Funciones auxiliares ----------
create or replace function public.my_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() and active $$;

create or replace function public.is_superuser()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() = 'superuser', false) $$;

create or replace function public.can_manage_restaurant(p_restaurant uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_superuser() or exists (
    select 1 from public.restaurants r
    join public.profiles p on p.id = r.owner_id
    where r.id = p_restaurant and r.owner_id = auth.uid() and p.role = 'restaurant' and p.active
  )
$$;

-- ---------- Alta automática de perfil ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Solo un superusuario puede cambiar rol o activar/desactivar cuentas
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.active is distinct from old.active or new.email is distinct from old.email)
     and auth.uid() is not null -- service_role / tareas internas no llevan usuario
     and not public.is_superuser() then
    raise exception 'No tienes permiso para cambiar el rol, el estado o el email';
  end if;
  return new;
end;
$$;

create trigger protect_profile_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- Un restaurante no puede cederse ni cambiar el dueño; el superusuario sí
create or replace function public.protect_restaurant_owner()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_superuser() and auth.uid() is not null then
      new.owner_id := auth.uid();
      new.rating_sum := 0;
      new.rating_count := 0;
    end if;
  elsif not public.is_superuser() and auth.uid() is not null then
    new.owner_id := old.owner_id;
    new.rating_sum := old.rating_sum;
    new.rating_count := old.rating_count;
  end if;
  return new;
end;
$$;

create trigger protect_restaurant_owner
  before insert or update on public.restaurants
  for each row execute function public.protect_restaurant_owner();

-- Los platos deben pertenecer a una categoría del mismo restaurante
create or replace function public.check_dish_category()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.menu_categories c where c.id = new.category_id and c.restaurant_id = new.restaurant_id
  ) then
    raise exception 'La categoría no pertenece a este restaurante';
  end if;
  return new;
end;
$$;

create trigger check_dish_category
  before insert or update on public.dishes
  for each row execute function public.check_dish_category();

create or replace function public.touch_settings()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end; $$;
create trigger touch_settings before update on public.settings for each row execute function public.touch_settings();

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.restaurants enable row level security;
alter table public.opening_hours enable row level security;
alter table public.menu_categories enable row level security;
alter table public.dishes enable row level security;
alter table public.promo_codes enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.tip_payments enable row level security;
alter table public.favorites enable row level security;

-- profiles
create policy "perfil propio o superusuario" on public.profiles
  for select using (id = auth.uid() or public.is_superuser());
create policy "editar perfil propio" on public.profiles
  for update using (id = auth.uid() or public.is_superuser())
  with check (id = auth.uid() or public.is_superuser());

-- settings: lectura pública, escritura superusuario
create policy "ajustes públicos" on public.settings for select using (true);
create policy "ajustes superusuario" on public.settings
  for update using (public.is_superuser()) with check (public.is_superuser());

-- restaurants
create policy "restaurantes visibles" on public.restaurants
  for select using (active or owner_id = auth.uid() or public.is_superuser());
create policy "alta de restaurantes" on public.restaurants
  for insert with check (public.is_superuser() or public.my_role() = 'restaurant');
create policy "editar restaurantes" on public.restaurants
  for update using (public.can_manage_restaurant(id)) with check (public.can_manage_restaurant(id));
create policy "borrar restaurantes" on public.restaurants
  for delete using (public.can_manage_restaurant(id));

-- horarios, categorías y platos: visibles si el restaurante es visible; gestión por dueño o superusuario
create policy "horarios visibles" on public.opening_hours
  for select using (exists (select 1 from public.restaurants r where r.id = restaurant_id));
create policy "gestionar horarios" on public.opening_hours
  for all using (public.can_manage_restaurant(restaurant_id)) with check (public.can_manage_restaurant(restaurant_id));

create policy "categorías visibles" on public.menu_categories
  for select using (exists (select 1 from public.restaurants r where r.id = restaurant_id));
create policy "gestionar categorías" on public.menu_categories
  for all using (public.can_manage_restaurant(restaurant_id)) with check (public.can_manage_restaurant(restaurant_id));

create policy "platos visibles" on public.dishes
  for select using (exists (select 1 from public.restaurants r where r.id = restaurant_id));
create policy "gestionar platos" on public.dishes
  for all using (public.can_manage_restaurant(restaurant_id)) with check (public.can_manage_restaurant(restaurant_id));

-- promo codes: solo superusuario (la validación pública se hace en el servidor)
create policy "promos superusuario" on public.promo_codes
  for all using (public.is_superuser()) with check (public.is_superuser());

-- orders: sin inserción/edición directa; se crean en el servidor y se actualizan por RPC
create policy "ver pedidos" on public.orders
  for select using (
    public.is_superuser()
    or customer_id = auth.uid()
    or rider_id = auth.uid()
    or public.can_manage_restaurant(restaurant_id)
    or (
      public.my_role() = 'rider' and rider_id is null
      and status in ('confirmed', 'preparing', 'ready')
    )
  );

create policy "ver líneas de pedido" on public.order_items
  for select using (exists (select 1 from public.orders o where o.id = order_id));

create policy "ver propinas" on public.tip_payments
  for select using (exists (select 1 from public.orders o where o.id = order_id));

create policy "favoritos propios" on public.favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Permisos de tabla (RLS decide qué filas) ----------
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on public.restaurants, public.opening_hours, public.menu_categories, public.dishes,
  public.promo_codes, public.favorites to authenticated;
grant update (full_name, phone, default_address, role, active) on public.profiles to authenticated;
grant update on public.settings to authenticated;
revoke select on public.promo_codes from anon;
