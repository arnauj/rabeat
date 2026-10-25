-- Comisión y recargo propios de cada restaurante (vacío = se aplica el valor general de settings)
alter table public.restaurants
  add column if not exists commission_pct numeric(5, 2) check (commission_pct between 0 and 100),
  add column if not exists markup_pct numeric(5, 2) check (markup_pct between 0 and 100),
  add column if not exists dine_in_commission_pct numeric(5, 2) check (dine_in_commission_pct between 0 and 100),
  add column if not exists dine_in_markup_pct numeric(5, 2) check (dine_in_markup_pct between 0 and 100);

-- Solo el superusuario fija comisiones; el restaurante no puede cambiarse las suyas
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
      new.commission_pct := null;
      new.markup_pct := null;
      new.dine_in_commission_pct := null;
      new.dine_in_markup_pct := null;
    end if;
  elsif not public.is_superuser() and auth.uid() is not null then
    new.owner_id := old.owner_id;
    new.rating_sum := old.rating_sum;
    new.rating_count := old.rating_count;
    new.commission_pct := old.commission_pct;
    new.markup_pct := old.markup_pct;
    new.dine_in_commission_pct := old.dine_in_commission_pct;
    new.dine_in_markup_pct := old.dine_in_markup_pct;
  end if;
  return new;
end;
$$;
