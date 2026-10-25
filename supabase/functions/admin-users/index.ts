// Gestión de usuarios (solo superusuarios): alta, cambio de rol, bloqueo, contraseña y baja
import { adminClient, requireRole } from '../_shared/db.ts'
import { handle, HttpError, json } from '../_shared/http.ts'
import { esc, layout, p, parseEmails, sendEmailStrict } from '../_shared/email.ts'

const ROLES = ['superuser', 'restaurant', 'rider', 'customer']

Deno.serve(
  handle(async (req) => {
    const body = await req.json()
    const db = adminClient()

    // Prueba de los emails de avisos de un restaurante (también para su responsable)
    if (body.action === 'test_restaurant_email') {
      const me = await requireRole(req, ['superuser', 'restaurant'])
      const { data: r } = await db.from('restaurants').select('id, name, email, owner_id').eq('id', body.restaurant_id).maybeSingle()
      if (!r || (me.role !== 'superuser' && r.owner_id !== me.id)) throw new HttpError(404, 'Restaurante no encontrado')
      const to = parseEmails(r.email)
      if (!to.length) throw new HttpError(400, 'Guarda primero al menos un email de avisos válido')
      try {
        for (const email of to)
          await sendEmailStrict(
            email,
            `Prueba de avisos de pedidos · ${r.name}`,
            layout('¡Los avisos funcionan! 🔔', p(`Aquí llegarán los pedidos nuevos de <b>${esc(r.name)}</b>.`) + p('Si este email ha ido a spam, márcalo como «No es spam» para no perderte ningún pedido.')),
          )
        return json({ ok: true, to })
      } catch (e) {
        throw new HttpError(502, `No se pudo enviar: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    const me = await requireRole(req, ['superuser'])

    if (body.action === 'test_email') {
      const to = String(body.to ?? me.email).trim()
      try {
        const res = await sendEmailStrict(
          to,
          'Prueba de email de rabeat',
          layout('¡El email funciona! 🐰', p('Este es un mensaje de prueba enviado desde el panel de rabeat.') + p(`Remitente: ${Deno.env.get('MAIL_FROM') ?? ''}`)),
        )
        return json({ ok: true, to, ...res })
      } catch (e) {
        throw new HttpError(502, `No se pudo enviar: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (body.action === 'create') {
      const email = String(body.email ?? '').trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, 'Email no válido')
      if (String(body.password ?? '').length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres')
      if (!ROLES.includes(body.role)) throw new HttpError(400, 'Rol no válido')
      const { data, error } = await db.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
        user_metadata: { full_name: body.full_name ?? '', phone: body.phone ?? '' },
      })
      if (error) throw new HttpError(400, error.message.includes('already') ? 'Ya existe un usuario con ese email' : error.message)
      const { data: profile, error: pe } = await db
        .from('profiles')
        .upsert({ id: data.user.id, email, full_name: body.full_name ?? '', phone: body.phone ?? '', role: body.role })
        .select()
        .single()
      if (pe) throw pe
      return json({ profile })
    }

    const id = String(body.id ?? '')
    if (!id) throw new HttpError(400, 'Falta el usuario')

    if (body.action === 'update') {
      if (id === me.id && (body.role && body.role !== 'superuser' || body.active === false))
        throw new HttpError(400, 'No puedes quitarte el rol de superusuario ni bloquearte a ti mismo')
      const patch: Record<string, unknown> = {}
      for (const k of ['full_name', 'phone', 'role', 'active']) if (body[k] !== undefined) patch[k] = body[k]
      if (patch.role && !ROLES.includes(patch.role as string)) throw new HttpError(400, 'Rol no válido')
      if (body.password) {
        if (String(body.password).length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres')
        const { error } = await db.auth.admin.updateUserById(id, { password: body.password })
        if (error) throw new HttpError(400, error.message)
      }
      if (body.active !== undefined) {
        await db.auth.admin.updateUserById(id, { ban_duration: body.active ? 'none' : '876000h' })
      }
      const { data: profile, error } = await db.from('profiles').update(patch).eq('id', id).select().single()
      if (error) throw error
      return json({ profile })
    }

    if (body.action === 'delete') {
      if (id === me.id) throw new HttpError(400, 'No puedes eliminar tu propia cuenta')
      const { error } = await db.auth.admin.deleteUser(id)
      if (error) throw new HttpError(400, error.message)
      return json({ ok: true })
    }

    throw new HttpError(400, 'Acción no válida')
  }),
)
