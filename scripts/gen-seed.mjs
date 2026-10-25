// Genera supabase/seed.sql a partir de los restaurantes de ejemplo del prototipo
import { writeFileSync } from 'node:fs'
import { RESTAURANTS } from '../src/data/restaurants.js'

const COORDS = {
  'guachinche-la-papa': [28.9648, -13.5531],
  'conejo-burger': [28.9672, -13.556],
  'sushi-atlantico': [28.9603, -13.5455],
  'pizzeria-teide': [28.9615, -13.551],
  'cafe-el-roque': [28.9627, -13.5466],
  'tacos-la-guagua': [28.96, -13.5497],
  'poke-el-reducto': [28.9556, -13.5602],
  'dulceria-gofio': [28.9624, -13.5527],
}

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const arr = (a) => `array[${a.map(q).join(', ')}]::text[]`
const out = ['-- Datos iniciales generados con scripts/gen-seed.mjs', 'begin;']

for (const r of RESTAURANTS) {
  const [lat, lng] = COORDS[r.id]
  const rid = `(select id from public.restaurants where slug = ${q(r.id)})`
  out.push(
    `insert into public.restaurants (slug, name, category, cuisine, cover_url, address, lat, lng, min_order, prep_min, prep_max, rating_sum, rating_count)
values (${q(r.id)}, ${q(r.name)}, ${q(r.category)}, ${q(r.cuisine)}, ${q(r.cover)}, ${q(r.address)}, ${lat}, ${lng}, ${r.minOrder}, ${Math.max(10, r.eta[0] - 10)}, ${Math.max(15, r.eta[1] - 10)}, ${Math.round(r.rating * r.reviews)}, ${r.reviews})
on conflict (slug) do nothing;`,
  )
  r.hours.forEach((ranges, day) =>
    ranges.forEach(([o, c]) =>
      out.push(`insert into public.opening_hours (restaurant_id, weekday, opens, closes) values (${rid}, ${day}, '${o}', '${c}');`),
    ),
  )
  r.menu.forEach((sec, si) => {
    out.push(`insert into public.menu_categories (restaurant_id, name, position) values (${rid}, ${q(sec.title)}, ${si});`)
    const cid = `(select id from public.menu_categories where restaurant_id = ${rid} and name = ${q(sec.title)})`
    sec.dishes.forEach((d, di) =>
      out.push(
        `insert into public.dishes (restaurant_id, category_id, name, description, price, image_url, allergens, kcal, portion, prep_minutes, tags, position, orders_count)
values (${rid}, ${cid}, ${q(d.name)}, ${q(d.description)}, ${d.price}, ${q(d.image)}, ${arr(d.allergens)}, ${d.kcal ?? 'null'}, ${q(d.portion ?? '')}, ${d.prep ?? 'null'}, ${arr(d.tags.filter((t) => t !== 'popular'))}, ${di}, ${d.orders});`,
      ),
    )
  })
}
out.push(`insert into public.promo_codes (code, kind, value, min_subtotal) values ('RABEAT10', 'percent', 10, 0), ('CONEJO', 'fixed', 3, 15) on conflict do nothing;`)
out.push('commit;')
writeFileSync(new URL('../supabase/seed.sql', import.meta.url), out.join('\n') + '\n')
console.log('seed.sql generado')
