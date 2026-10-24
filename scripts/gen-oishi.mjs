// Genera supabase/data/oishi.sql a partir de supabase/data/oishi.json
// (carta extraída de https://arrecifeparallevar.es/oishi/ · precios sin IGIC)
import { readFileSync, writeFileSync } from 'node:fs'

const data = JSON.parse(readFileSync(new URL('../supabase/data/oishi.json', import.meta.url), 'utf8'))
const COVER = process.argv[2] ?? null

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const arr = (a) => `array[${a.map(q).join(', ')}]::text[]`
const tidy = (s) => s.replace(/\s+Con\s+/g, ' con ').replace(/\s+With\s+/g, ' with ').trim()
const out = ['-- Oishi (Arrecife) · generado con scripts/gen-oishi.mjs', 'begin;']
const R = `(select id from public.restaurants where slug = 'oishi')`

// La portada es el logo del restaurante (fondo negro)
out.push(`insert into public.restaurants (slug, name, category, cuisine, description, cover_url, cover_is_logo, cover_bg, address, lat, lng, phone, min_order, prep_min, prep_max, active, accepting_orders)
values ('oishi', 'Oishi', 'sushi', 'Japonesa · China · Sushi',
  'Sabores asiáticos auténticos y sushi preparado al momento, con una amplia variedad de platos llenos de frescura y tradición.',
  ${q(COVER)}, ${COVER ? 'true' : 'false'}, '#000000', 'C. Juan de Quesada, 19, Arrecife (Lanzarote)', 28.9625395, -13.5433257, '928 50 56 89', 20, 20, 30, true, true)
on conflict (slug) do nothing;`)

// Lunes cerrado; de martes a domingo 12:00–16:00 y 19:00–23:00
for (const d of [2, 3, 4, 5, 6, 0])
  out.push(`insert into public.opening_hours (restaurant_id, weekday, opens, closes) values (${R}, ${d}, '12:00', '16:00'), (${R}, ${d}, '19:00', '23:00');`)

let pos = 0
const category = (name) => {
  out.push(`insert into public.menu_categories (restaurant_id, name, position) values (${R}, ${q(name)}, ${pos++});`)
  return `(select id from public.menu_categories where restaurant_id = ${R} and name = ${q(name)})`
}
const dish = (cat, d, i, extra = {}) =>
  out.push(`insert into public.dishes (restaurant_id, category_id, code, name, name_en, description, description_en, portion, price, allergens, position, schedule)
values (${R}, ${cat}, ${q(d.code ?? '')}, ${q(d.name)}, ${q(d.name_en ?? '')}, ${q(d.description ?? '')}, ${q(d.description_en ?? '')}, ${q(d.portion ?? '')}, ${d.price}, ${arr(d.allergens ?? [])}, ${i}, ${extra.schedule ? q(JSON.stringify(extra.schedule)) + '::jsonb' : 'null'});`)
const D = (name) => `(select id from public.dishes where restaurant_id = ${R} and name = ${q(name)})`
const group = (dishName, g, i) => {
  out.push(`insert into public.dish_option_groups (restaurant_id, dish_id, name, min_select, max_select, free_select, extra_price, position)
values (${R}, ${D(dishName)}, ${q(g.name)}, ${g.min}, ${g.max}, ${g.free ?? 'null'}, ${g.extra ?? 0}, ${i});`)
  const G = `(select id from public.dish_option_groups where dish_id = ${D(dishName)} and name = ${q(g.name)})`
  g.options.forEach((o, k) =>
    out.push(`insert into public.dish_options (restaurant_id, group_id, name, price_delta, allergens, position) values (${R}, ${G}, ${q(o.name)}, ${o.price ?? 0}, ${arr(o.allergens ?? [])}, ${k});`),
  )
}

// Menú del día (solo a mediodía, de martes a jueves)
const menuCat = category('Menú del día')
const md = data.menu_del_dia
dish(menuCat, {
  name: 'Menú del Día',
  name_en: 'Lunch Menu',
  description: 'Elige 3 platos para crear tu menú perfecto. El tercer plato va acompañado de arroz blanco o frito.',
  description_en: 'Choose 3 dishes. The third course is served with white or fried rice.',
  price: md.price,
}, 0, { schedule: [2, 3, 4].map((weekday) => ({ weekday, opens: '12:00', closes: '16:00' })) })
md.groups.forEach((g, i) =>
  group('Menú del Día', {
    name: g.name,
    min: 1,
    max: 1,
    options: g.options.filter((o) => !o.name.startsWith('Acompañado')).map((o) => ({ name: tidy(o.name), allergens: o.allergens })),
  }, i),
)
group('Menú del Día', { name: 'Acompañamiento del tercer plato', min: 1, max: 1, options: [{ name: 'Arroz blanco' }, { name: 'Arroz frito', allergens: ['gluten', 'soja', 'huevo'] }] }, 3)

// Carta
for (const c of data.categories) {
  const cat = category(c.name)
  c.dishes.forEach((d, i) => dish(cat, d, i))
}

// Poke o burrito a medida
const poke = 'Oishi Poke y Burrito'
const pokeCat = `(select id from public.menu_categories where restaurant_id = ${R} and name = 'Poke Bowls y Burritos')`
dish(pokeCat, {
  name: poke,
  name_en: 'Build your own Poke or Burrito',
  description: 'Créalo paso a paso: tamaño, base, proteína, toppings, dressing y salsa.',
  description_en: 'Build it step by step: size, base, protein, toppings, dressing and sauce.',
  price: 9.9,
}, 99)
const steps = [
  { name: 'Formato', min: 1, max: 1, options: [{ name: 'Poke bowl' }, { name: 'Burrito', allergens: ['gluten'] }] },
  { name: 'Tamaño', min: 1, max: 1, options: [{ name: 'Pequeño' }, { name: 'Grande', price: 2 }] },
  { name: 'Base', min: 1, max: 1, options: [{ name: 'Arroz integral' }, { name: 'Arroz sushi' }, { name: 'Mezclum de lechuga' }] },
  {
    name: 'Proteína', min: 1, max: 3, free: 1, extra: 2.5,
    options: [
      { name: 'Salmón', allergens: ['pescado'] }, { name: 'Atún', allergens: ['pescado'] }, { name: 'Tofu', allergens: ['soja'] },
      { name: 'Gambas', allergens: ['crustaceos'] }, { name: 'Pollo crujiente', allergens: ['gluten'] }, { name: 'Pato crujiente', allergens: ['gluten'] },
      { name: 'Ebyfry', allergens: ['crustaceos', 'gluten'] },
    ],
  },
  {
    name: 'Toppings extra', min: 0, max: 3, free: 1, extra: 1,
    options: [{ name: 'Aguacate' }, { name: 'Edamame', allergens: ['soja'] }, { name: 'Wakame' }, { name: 'Mango' }, { name: 'Piña' }, { name: 'Massago', allergens: ['pescado'] }],
  },
  {
    name: 'Toppings clásicos', min: 0, max: 5, free: 3, extra: 1,
    options: [{ name: 'Tomate' }, { name: 'Zanahoria' }, { name: 'Pepino' }, { name: 'Brotes de soja', allergens: ['soja'] }, { name: 'Rabanito' }, { name: 'Cebolla dulce' }, { name: 'Maíz dulce' }],
  },
  {
    name: 'Dressing', min: 0, max: 3, free: 1, extra: 0.5,
    options: [{ name: 'Cebolla frita', allergens: ['gluten'] }, { name: 'Almendra', allergens: ['frutos_cascara'] }, { name: 'Sésamo', allergens: ['sesamo'] }, { name: 'Cebollino' }],
  },
  {
    name: 'Salsa', min: 0, max: 3, free: 1, extra: 0.5,
    options: [
      { name: 'Soja Kikkoman', allergens: ['soja', 'gluten'] }, { name: 'Soja Kikkoman sin gluten', allergens: ['soja'] }, { name: 'Salsa ponzu', allergens: ['soja', 'gluten'] },
      { name: 'Mayonesa picante', allergens: ['huevo'] }, { name: 'Salsa teriyaki', allergens: ['soja', 'gluten'] }, { name: 'Sweet chili' }, { name: 'Hot chili' }, { name: 'Salsa agridulce' },
    ],
  },
]
steps.forEach((g, i) => group(poke, g, i))

out.push('commit;')
writeFileSync(new URL('../supabase/data/oishi.sql', import.meta.url), out.join('\n') + '\n')
console.log(`oishi.sql: ${out.length} sentencias`)
