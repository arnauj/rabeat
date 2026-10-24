import { money } from '../lib/format.js'

// IGIC incluido en el total, por tipo impositivo
export default function TaxBreakdown({ q }) {
  if (!q?.tax_breakdown?.length) return null
  return (
    <div className="mt-2 rounded-xl bg-neutral-50 px-3 py-2 text-[11px] text-neutral-500">
      <p className="font-bold text-neutral-600">IGIC incluido: {money(q.tax_amount)}</p>
      {q.tax_breakdown.map((b) => (
        <p key={b.rate} className="flex justify-between tabular-nums">
          <span>
            Base {String(b.rate).replace('.', ',')} %: {money(b.base)}
          </span>
          <span>cuota {money(b.tax)}</span>
        </p>
      ))}
    </div>
  )
}
