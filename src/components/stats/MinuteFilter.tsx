import { useState } from 'react'
import type { Event } from '@/lib/db/schema'

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

export function MinuteInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-500 whitespace-nowrap">{label}</span>
      <button
        onClick={() => onChange(value !== null ? Math.max(0, value - 1) : null)}
        disabled={value === null || value === 0}
        className="w-6 h-6 flex items-center justify-center rounded bg-gray-100 text-gray-600 text-sm font-bold disabled:opacity-30 hover:bg-gray-200 active:scale-95"
      >
        −
      </button>
      <input
        type="number"
        min={0}
        max={90}
        value={value ?? ''}
        placeholder="—"
        onChange={e => {
          const v = e.target.value
          onChange(v === '' ? null : Math.max(0, Math.min(90, Number(v))))
        }}
        className="w-10 text-center text-xs font-semibold border border-gray-300 rounded py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      <span className="text-xs text-gray-400">'</span>
      <button
        onClick={() => onChange(value !== null ? Math.min(90, value + 1) : 0)}
        className="w-6 h-6 flex items-center justify-center rounded bg-gray-100 text-gray-600 text-sm font-bold hover:bg-gray-200 active:scale-95"
      >
        +
      </button>
    </div>
  )
}

export function MinuteFilterBar({
  range,
  setRange,
  onClear,
}: {
  range: MinuteRange
  setRange: (r: MinuteRange) => void
  onClear: () => void
}) {
  const active = range.from !== null || range.to !== null
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-white border-b border-gray-100">
      <span className="text-xs text-gray-500 font-medium whitespace-nowrap">Mínútur:</span>
      <MinuteInput
        label="Frá"
        value={range.from}
        onChange={v => setRange({ ...range, from: v })}
      />
      <span className="text-xs text-gray-400">–</span>
      <MinuteInput
        label="Til"
        value={range.to}
        onChange={v => setRange({ ...range, to: v })}
      />
      {active && (
        <button
          onClick={onClear}
          className="text-xs text-blue-600 hover:underline"
        >
          Hreinsa
        </button>
      )}
      {active && (
        <span className="text-xs text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded-full">
          {range.from ?? 0}′ – {range.to ?? 90}′
        </span>
      )}
    </div>
  )
}
