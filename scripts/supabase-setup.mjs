#!/usr/bin/env node
// Instala o actualiza rabeat en un proyecto Supabase usando la Management API.
//
//   SUPABASE_ACCESS_TOKEN=sbp_… node scripts/supabase-setup.mjs [pasos…]
//
// Pasos (por defecto, todos): migrations seed users auth secrets functions
//   · migrations: aplica supabase/migrations/*.sql que falten (registro en rabeat_meta.migrations)
//   · seed:       carga supabase/seed.sql si no hay restaurantes
//   · users:      crea/actualiza los usuarios de supabase/users.local.json (no se sube a GitHub)
//   · auth:       URL del sitio, alta sin confirmación y SMTP (Resend o Gmail) para los emails de acceso
//   · secrets:    sube los valores de supabase/.env a los secretos de las funciones
//   · functions:  despliega las Edge Functions con la CLI de Supabase
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = process.env.SUPABASE_PROJECT_REF ?? readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8').match(/project_id\s*=\s*"([^"]+)"/)[1]
const API = `https://api.supabase.com/v1/projects/${REF}`
const URL_ = `https://${REF}.supabase.co`
const steps = process.argv.slice(2).length ? process.argv.slice(2) : ['migrations', 'seed', 'users', 'auth', 'secrets', 'functions']

if (!TOKEN) {
  console.error('Falta SUPABASE_ACCESS_TOKEN (créalo en https://supabase.com/dashboard/account/tokens)')
  process.exit(1)
}

const log = (...a) => console.log('›', ...a)

async function api(pathname, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${pathname} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

const sql = (query) => api('/database/query', { method: 'POST', body: { query } })
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`

function readEnv(file) {
  if (!existsSync(file)) return {}
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      }),
  )
}
const ENV = readEnv(path.join(ROOT, 'supabase/.env'))

async function migrations() {
  await sql(`create schema if not exists rabeat_meta;
    create table if not exists rabeat_meta.migrations (name text primary key, applied_at timestamptz default now());`)
  const done = new Set((await sql('select name from rabeat_meta.migrations')).map((r) => r.name))
  const files = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    if (done.has(f)) continue
    log(`migración ${f}`)
    const body = readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8')
    await sql(`begin;\n${body}\ninsert into rabeat_meta.migrations (name) values (${lit(f)});\ncommit;`)
  }
  log('migraciones al día')
}

async function seed() {
  const [{ n }] = await sql('select count(*)::int as n from public.restaurants')
  if (n > 0) return log(`seed omitido: ya hay ${n} restaurantes`)
  await sql(readFileSync(path.join(ROOT, 'supabase/seed.sql'), 'utf8'))
  log('datos iniciales cargados')
}

async function secretKey() {
  const keys = await api('/api-keys?reveal=true')
  const key = keys.find((k) => k.type === 'secret')?.api_key ?? keys.find((k) => k.name === 'service_role')?.api_key
  if (!key) throw new Error('No se encontró la clave secreta / service_role del proyecto')
  return key
}

async function users() {
  const file = path.join(ROOT, 'supabase/users.local.json')
  if (!existsSync(file)) return log('sin supabase/users.local.json: no se crean usuarios')
  const list = JSON.parse(readFileSync(file, 'utf8'))
  const key = await secretKey()
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  const existing = await fetch(`${URL_}/auth/v1/admin/users?per_page=1000`, { headers }).then((r) => r.json())

  for (const u of list) {
    const found = existing.users?.find((x) => x.email?.toLowerCase() === u.email.toLowerCase())
    const payload = { email: u.email, password: u.password, email_confirm: true, user_metadata: { full_name: u.full_name, phone: u.phone ?? '' } }
    const res = found
      ? await fetch(`${URL_}/auth/v1/admin/users/${found.id}`, { method: 'PUT', headers, body: JSON.stringify(payload) })
      : await fetch(`${URL_}/auth/v1/admin/users`, { method: 'POST', headers, body: JSON.stringify(payload) })
    const data = await res.json()
    if (!res.ok) throw new Error(`Usuario ${u.email}: ${JSON.stringify(data)}`)
    await sql(`insert into public.profiles (id, email, full_name, phone, role)
      values (${lit(data.id)}, ${lit(u.email.toLowerCase())}, ${lit(u.full_name)}, ${lit(u.phone ?? '')}, ${lit(u.role)})
      on conflict (id) do update set full_name = excluded.full_name, phone = excluded.phone, role = excluded.role, active = true;`)
    if (u.owns?.length)
      await sql(`update public.restaurants set owner_id = ${lit(data.id)} where slug in (${u.owns.map(lit).join(', ')});`)
    log(`${found ? 'actualizado' : 'creado'} ${u.email} (${u.role})`)
  }
}

async function auth() {
  const site = ENV.SITE_URL || 'https://rabeat.eu/'
  const config = {
    site_url: site,
    uri_allow_list: [site, `${site}**`, 'https://www.rabeat.eu/**', 'https://arnauj.github.io/rabeat/**', 'http://localhost:5173/**', 'http://localhost:4173/**'].join(','),
    mailer_autoconfirm: true,
    password_min_length: 8,
  }
  // Resend también ofrece SMTP (usuario «resend», contraseña = API key)
  const smtp = ENV.RESEND_API_KEY
    ? { host: 'smtp.resend.com', port: '465', user: 'resend', pass: ENV.RESEND_API_KEY }
    : ENV.SMTP_USER && ENV.SMTP_PASS
      ? { host: ENV.SMTP_HOST || 'smtp.gmail.com', port: ENV.SMTP_PORT || '465', user: ENV.SMTP_USER, pass: ENV.SMTP_PASS }
      : null
  if (smtp) {
    Object.assign(config, {
      smtp_host: smtp.host,
      smtp_port: smtp.port,
      smtp_user: smtp.user,
      smtp_pass: smtp.pass,
      smtp_admin_email: (ENV.MAIL_FROM?.match(/<([^>]+)>/)?.[1] ?? ENV.MAIL_FROM) || ENV.SMTP_USER,
      smtp_sender_name: 'rabeat',
      mailer_subjects_recovery: 'Restablece tu contraseña de rabeat',
      mailer_templates_recovery_content:
        '<h2>Restablecer contraseña</h2><p>Pulsa el enlace para elegir una contraseña nueva en rabeat:</p><p><a href="{{ .ConfirmationURL }}">Cambiar contraseña</a></p>',
    })
  }
  await api('/config/auth', { method: 'PATCH', body: config })
  log(`auth configurado (${config.smtp_host ? `con SMTP ${config.smtp_host}` : 'sin SMTP propio'})`)
}

async function secrets() {
  const values = Object.entries({ SITE_URL: 'https://rabeat.eu/', ...ENV })
    .filter(([k, v]) => v && !k.startsWith('SUPABASE_'))
    .map(([name, value]) => ({ name, value }))
  if (!values.length) return log('sin secretos que subir')
  await api('/secrets', { method: 'POST', body: values })
  log(`secretos actualizados: ${values.map((v) => v.name).join(', ')}`)
}

function functions() {
  const names = readdirSync(path.join(ROOT, 'supabase/functions'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name)
  for (const name of names) {
    log(`desplegando función ${name}`)
    const r = spawnSync('npx', ['-y', 'supabase@2.115.0', 'functions', 'deploy', name, '--project-ref', REF, '--use-api', '--no-verify-jwt'], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: TOKEN },
    })
    if (r.status !== 0) throw new Error(`Falló el despliegue de ${name}`)
  }
}

const STEPS = { migrations, seed, users, auth, secrets, functions }
for (const s of steps) {
  if (!STEPS[s]) throw new Error(`Paso desconocido: ${s}`)
  await STEPS[s]()
}
log('¡listo!')
