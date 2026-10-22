import { useState } from 'react'
import type { Event } from '@/lib/db/schema'
import { useT } from '@/lib/i18n/lang'

export interface MinuteRange {
  from: number | null
  to: number | null
}

export function useMinuteFilter() {
  const [range, setRange] = useState<MinuteRange>({ from: null, to: null })

  function filterEvents(events: Event[]): Event[] {
    const { from, to } = range
    if (from === null && to === null) return events
    return events.filter(e => {
      const m = e.match_minute
      if (m === null || m === undefined) return true // events without a minute always included
      if (from !== null && m < from) return false
      if (to !== null && m > to) return false
      return true
    })
  }

  function clear() {
    setRange({ from: null, to: null })
  }

  return { range, setRange, filterEvents, clear }
}

// ─── UI ───────────────────────────────────────────────────────────────────────

export function MinuteInput({ label, value, onChange }: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
}) {
  const step = 'w-8 h-8 flex items-center justify-center rounded-md bg-[#f5f6f8] border border-line text-ink text-[15px] hover:bg-[#e8eaee] active:scale-95 transition disabled:opacity-40'
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[13px] text-muted whitespace-nowrap">{label}</span>
      <button type="button" aria-label={`${label} −1`}
        onClick={() => onChange(value !== null ? Math.max(0, value - 1) : null)}
        disabled={value === null || value === 0} className={step}>−</button>
      <input
        type="number" inputMode="numeric" min={0} max={90} value={value ?? ''} placeholder="—" aria-label={label}
        onChange={e => {
          const v = e.target.value
          onChange(v === '' ? null : Math.max(0, Math.min(90, Number(v))))
        }}
        className="w-12 h-8 text-center text-[14px] num border border-[#cdd2d9] rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-accent"
      />
      <button type="button" aria-label={`${label} +1`}
        onClick={() => onChange(value !== null ? Math.min(90, value + 1) : 0)} className={step}>+</button>
    </div>
  )
}

export function MinuteFilterBar({ range, setRange, onClear }: {
  range: MinuteRange
  setRange: (r: MinuteRange) => void
  onClear: () => void
}) {
  const t = useT()
  const active = range.from !== null || range.to !== null
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 bg-white border-b border-line">
      <span className="text-[13px] font-medium whitespace-nowrap">{t({ en: 'Minutes', is: 'Mínútur' })}</span>
      <MinuteInput label={t({ en: 'From', is: 'Frá' })} value={range.from} onChange={v => setRange({ ...range, from: v })} />
      <MinuteInput label={t({ en: 'To', is: 'Til' })} value={range.to} onChange={v => setRange({ ...range, to: v })} />
      {active && (
        <>
          <span className="text-[13px] num px-2 py-0.5 rounded bg-[#eef0f3] text-ink">{range.from ?? 0}′–{range.to ?? 90}′</span>
          <button type="button" onClick={onClear} className="text-[13px] text-muted hover:text-ink underline underline-offset-4">{t({ en: 'Clear', is: 'Hreinsa' })}</button>
        </>
      )}
    </div>
  )
}
