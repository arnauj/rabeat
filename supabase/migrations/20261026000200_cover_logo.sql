-- rabeat · portadas que son un logo: se muestran enteras sobre un color de fondo
alter table public.restaurants
  add column cover_is_logo boolean not null default false,
  add column cover_bg text not null default '#111111' check (cover_bg ~ '^#[0-9a-fA-F]{6}$');
