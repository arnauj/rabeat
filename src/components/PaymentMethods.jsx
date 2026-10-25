import Icon from './Icon.jsx'

// Apple Pay en dispositivos de Apple; Google Pay en el resto (Android, Chrome…)
const WALLET =
  typeof window !== 'undefined' && 'ApplePaySession' in window
    ? { name: 'Apple Pay', mark: (
        <span className="inline-flex items-center gap-0.5 text-lg leading-5 font-semibold">
          <svg viewBox="0 0 24 24" className="size-5 -translate-y-px fill-current" aria-hidden="true">
            <path d="M16.37 12.6c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.8 1.3 10.35.86 1.25 1.89 2.65 3.23 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.4-.03 2.28-1.27 3.13-2.53.99-1.45 1.4-2.86 1.42-2.93-.03-.01-2.72-1.04-2.71-4.13zM13.79 4.97c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.26.68-3 1.54-.66.76-1.23 1.98-1.08 3.15 1.14.09 2.3-.58 3.02-1.44z" />
          </svg>
          Pay
        </span>
      ) }
    : {
        name: 'Google Pay',
        mark: (
          <span className="text-base leading-5 font-bold">
            <span className="text-[#4285F4]">G</span>
            <span className="text-[#EA4335]">o</span>
            <span className="text-[#FBBC05]">o</span>
            <span className="text-[#4285F4]">g</span>
            <span className="text-[#34A853]">l</span>
            <span className="text-[#EA4335]">e</span> Pay
          </span>
        ),
      }

const BIZUM_MARK = <span className="text-lg leading-5 font-black tracking-tight text-[#05C3DD]">bizum</span>

const PAYPAL_MARK = (
  <span className="text-base leading-5 font-extrabold italic">
    <span className="text-[#003087]">Pay</span>
    <span className="text-[#009CDE]">Pal</span>
  </span>
)

// Selector de pago: tarjeta, Apple/Google Pay y PayPal (vía Stripe); en mesa, también pagar en el local
export default function PaymentMethods({ value, onChange, methods = ['card', 'paypal', 'bizum'], testMode, cash = null, cashFirst = false }) {
  const options = [
    methods.includes('card') && { id: 'wallet', mark: WALLET.mark, title: WALLET.name, subtitle: 'Rápido y seguro' },
    methods.includes('card') && { id: 'card', icon: 'card', title: 'Tarjeta', subtitle: 'Débito o crédito' },
    methods.includes('bizum') && { id: 'bizum', mark: BIZUM_MARK, title: 'Bizum', subtitle: 'Con tu móvil' },
    methods.includes('paypal') && { id: 'paypal', mark: PAYPAL_MARK, title: 'PayPal', subtitle: 'Con tu cuenta' },
  ].filter(Boolean)
  const cashOption = cash && { id: 'cash', icon: 'cash', title: cash.title, subtitle: cash.subtitle }
  const all = (cashFirst ? [cashOption, ...options] : [...options, cashOption]).filter(Boolean)
  const notes = {
    wallet: `En la página segura de pago pulsa el botón de ${WALLET.name}. Si no aparece, puedes pagar con tarjeta.`,
    card: 'Te llevaremos a la página segura de Stripe para introducir tu tarjeta.',
    paypal: 'Te llevaremos a PayPal para confirmar el pago con tu cuenta.',
    bizum: 'En la página segura de pago escribe tu móvil de Bizum y confirma el pago en la app de tu banco.',
    cash: cash?.note,
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {all.map((o) => (
          <PayOption key={o.id} active={value === o.id} onClick={() => onChange(o.id)} {...o} />
        ))}
      </div>
      {value !== 'cash' && testMode ? (
        <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          🧪 <b>Pasarela en modo pruebas.</b> La conexión con Stripe aún no está activada: el pago se simulará y el pedido se confirmará sin cargo.
        </p>
      ) : (
        <p className="mt-4 rounded-2xl bg-neutral-100 p-3 text-sm text-neutral-600">{notes[value]}</p>
      )}
    </>
  )
}

function PayOption({ active, onClick, icon, mark, title, subtitle }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={title}
      className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl odd:last:col-span-2 px-2 py-3 text-center ring-1 transition ${active ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-600' : 'bg-white ring-neutral-200'}`}
    >
      {mark ? <span className="text-ink">{mark}</span> : <Icon name={icon} className="size-5" />}
      {!mark && <span className="text-sm font-extrabold">{title}</span>}
      <span className="text-[11px] text-neutral-500">{subtitle}</span>
    </button>
  )
}
