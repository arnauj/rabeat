# rabeat
Comida a domicilio desde canarias.

Web app de reparto de comida pensada primero para móvil: **React 19 + Vite + Tailwind CSS 4** en el frontend (publicado en GitHub Pages) y **Supabase** (Postgres, Auth, Storage, Realtime y Edge Functions) como backend.

**Web:** https://www.rabeat.eu (rabeat.eu redirige a www)

## Roles

| Rol | Qué puede hacer |
|---|---|
| **Cliente** | Pedir como invitado o con cuenta, dirección con mapa, programar pedidos en restaurantes cerrados, propina, seguimiento en tiempo real, valorar y favoritos |
| **Restaurante** | Dar de alta sus restaurantes, horario con varios tramos por día, carta por categorías con precios, fotos y alérgenos, gestionar pedidos y ver ventas |
| **Repartidor** | Ver pedidos disponibles, aceptarlos, marcar recogido/entregado, compartir su ubicación y ver sus propinas |
| **Superusuario** | Todo lo anterior sobre cualquier restaurante, más usuarios, comisiones, tarifas de envío, promociones y liquidaciones |

## Cómo se calcula un pedido

- **Precio de cada plato** = precio del restaurante + *recargo de la plataforma* (%).
- **Envío** = tarifa base + €/km × distancia (en línea recta desde el restaurante), hasta un radio máximo.
- **Comisión al restaurante** (%) sobre su precio de carta. El restaurante cobra *ventas − comisión*.
- **Propina**: 100 % para el repartidor, en el pago y también después.
- El servidor (`create-order`) recalcula siempre los importes; la app solo muestra una estimación.

Los porcentajes y tarifas se cambian en **Panel → Comisiones y envío**. En la tarjeta «Comisiones» están las generales (a domicilio y en mesa) y, con el botón «Añadir» de «Personalizadas», se elige un restaurante en un modal y se le da su propia comisión y recargo; un campo vacío usa el general. Cada pedido guarda los porcentajes con los que se cobró.

## Pagos (Stripe)

Stripe Checkout cobra en la cuenta de la plataforma y, con **Stripe Connect**, cada restaurante recibe su parte en su propia cuenta al momento. **Panel → Liquidaciones** muestra lo que aún se debe a mano a cada restaurante y repartidor (con exportación CSV).

### Stripe Connect (cada restaurante cobra en su cuenta)

- **Cuentas Express**: en **Panel → Restaurantes → (restaurante) → Datos → Cobros**, el restaurante pulsa «Conectar con Stripe», completa el alta en Stripe (datos fiscales, DNI/CIF e IBAN) y vuelve al panel. Desde ahí también abre su panel de Stripe con sus cobros.
- **Destination charges**: rabeat cobra al cliente y Stripe transfiere al instante al restaurante su neto (*ventas − comisión + IGIC de su comida*). rabeat se queda el recargo, la comisión, el envío y la propina del repartidor, y asume las comisiones de Stripe. Si una promoción deja el total por debajo del neto del restaurante, se transfiere lo cobrado (sin la propina) y el resto queda pendiente en Liquidaciones.
- Las **propinas al equipo** desde el QR de la mesa van íntegras a la cuenta del restaurante. Las propinas a repartidores se quedan en rabeat y se liquidan como hasta ahora.
- **Sin cuenta activa** (alta sin terminar o en revisión), los cobros siguen centralizados y se liquidan a mano. Si Stripe rechaza un cobro con Connect (p. ej. un método de pago que no lo admite), se reintenta de forma centralizada.
- Cada pedido guarda la cuenta (`stripe_account_id`) y el importe transferido (`connect_amount`); Liquidaciones lo descuenta de «A transferir».
- Las cancelaciones con reembolso se hacen desde Stripe marcando «revertir transferencia» para recuperar la parte del restaurante.

Para activarlo:

1. En Stripe → Connect, completa el perfil de la plataforma (marketplace, cuentas Express, España) y la marca que verán los restaurantes.
2. En Stripe → Desarrolladores → Webhooks, añade un segundo endpoint a la misma URL `…/functions/v1/stripe-webhook` escuchando **eventos de cuentas conectadas** con `account.updated`, y pon su secreto en `STRIPE_CONNECT_WEBHOOK_SECRET` (`supabase/.env`).
3. `npm run supabase:migrate`, `npm run supabase:secrets` y `npm run supabase:functions`.

Métodos de pago online, todos a través de Stripe Checkout:

- **Tarjeta** de débito o crédito.
- **Apple Pay** (iPhone, iPad, Mac) y **Google Pay** (Android, Chrome): la app muestra el que corresponde al dispositivo y Stripe ofrece el botón en su página de pago. Vienen activados por defecto en Stripe.
- **PayPal**: hay que activarlo en Stripe → Configuración → Métodos de pago.
- **Bizum**: el cliente escribe su móvil y confirma en la app de su banco. En Stripe está en vista previa: hay que solicitar el acceso y activarlo en Configuración → Métodos de pago. Importe entre 0,50 € y 5.000 €.
- Los pedidos a domicilio se pagan siempre online (sin efectivo). En los pedidos desde la mesa también se puede **pagar en el local**.

`STRIPE_PAYMENT_METHODS` (por defecto `card,paypal,bizum`) decide cuáles se ofrecen; quita `paypal` o `bizum` si no están activados en Stripe. Tras el cobro se guarda el medio concreto usado (Apple Pay, Google Pay, PayPal, Bizum o la tarjeta), que aparece en el panel, en el seguimiento y en la app de reparto.

Mientras no haya claves de Stripe, los pagos online funcionan en **modo pruebas** (se simula el cobro). Para activarlo:

1. Copia `supabase/.env.example` a `supabase/.env` y rellena `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET`.
2. En Stripe → Desarrolladores → Webhooks, crea un endpoint a
   `https://dodvqylxgqxxfgsakalo.supabase.co/functions/v1/stripe-webhook` con los eventos
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` y `checkout.session.expired`.
3. Ejecuta `SUPABASE_ACCESS_TOKEN=sbp_… npm run supabase:secrets`.

## Emails (Resend)

Al confirmarse un pedido se envía email al cliente (con enlace de seguimiento), a los repartidores activos y al restaurante. También al asignarse repartidor, al entregarse y si se cancela. Salen desde `noreply@rabeat.eu` a través de [Resend](https://resend.com) (API por HTTPS: Supabase bloquea el SMTP de Hostalia). Para activarlos, pon `RESEND_API_KEY` en `supabase/.env` y ejecuta `npm run supabase:secrets`. El dominio `rabeat.eu` debe estar verificado en Resend (registros DNS en Hostalia). Se puede probar en **Panel → Comisiones y envío → Emails**.

Como alternativa, sin `RESEND_API_KEY` se usa SMTP (`SMTP_USER`/`SMTP_PASS`, p. ej. Gmail con contraseña de aplicación).

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:5173 (usa el proyecto Supabase de .env)
npm test             # lógica de precios/horarios + pruebas de permisos en un Postgres local
```

### Backend

```bash
# Todo (migraciones, datos iniciales, usuarios, auth, secretos y funciones)
SUPABASE_ACCESS_TOKEN=sbp_… npm run supabase:setup

npm run supabase:migrate     # solo migraciones nuevas
npm run supabase:functions   # solo Edge Functions
npm run supabase:secrets     # secretos de supabase/.env + configuración de auth
```

Los usuarios iniciales se definen en `supabase/users.local.json` (no se sube a GitHub).

### Estructura

```
src/                 app (cliente, panel en src/panel, reparto en src/rider)
supabase/migrations  esquema, seguridad (RLS) y funciones SQL
supabase/functions   Edge Functions: create-order, stripe-webhook, confirm-payment, stripe-connect,
                     add-tip, table-tip, notify, admin-users, public-config
supabase/functions/_shared/{pricing,hours}.js  lógica compartida app ↔ servidor
scripts/             instalación en Supabase, seed y pruebas
```
