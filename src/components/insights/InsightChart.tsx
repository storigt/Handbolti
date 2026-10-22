// Charts for insight cards. One colour job only: the outlier is cobalt, the
// rest are grey, and a dashed line marks the average it is compared with.
// Values sit next to every bar (few bars, so no hover needed to read them).
import { useState } from 'react'
import type { InsightChart as Chart } from '@/lib/insights/engine'
import { useLang, useT } from '@/lib/i18n/lang'

const HI = '#1f2de6'
const LO = '#cfd4db'

/** Bar labels may carry both languages as "English|Íslenska". */
function useBarLabel() {
  const lang = useLang(s => s.lang)
  return (l: string) => (l.includes('|') ? l.split('|')[lang === 'is' ? 1 : 0] : l)
}

function fmtRaw(v: number, unit: 'per10' | '%' | 'count') {
  if (unit === '%') return `${Math.round(v)}%`
  if (unit === 'per10') return v.toFixed(1)
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}
/** Numbers in the viewer's language: Icelandic uses a decimal comma. */
function useFmt() {
  const lang = useLang(s => s.lang)
  return (v: number, unit: 'per10' | '%' | 'count') => (lang === 'is' ? fmtRaw(v, unit).replace('.', ',') : fmtRaw(v, unit))
}

export function InsightChart({ chart }: { chart: Chart }) {
  if (chart.kind === 'bars') return <Bars chart={chart} />
  if (chart.kind === 'scatter') return <Scatter chart={chart} />
  return <Zones chart={chart} />
}

function Bars({ chart }: { chart: Extract<Chart, { kind: 'bars' }> }) {
  const t = useT()
  const lab = useBarLabel()
  const fmt = useFmt()
  const max = chart.unit === '%' ? 100 : Math.max(1e-9, ...chart.items.map(i => i.value), chart.reference?.value ?? 0) * 1.1
  const ref = chart.reference
  const x = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`
  return (
    <figure className="flex flex-col gap-1.5">
      <ul className="flex flex-col gap-1">
        {chart.items.map((it, i) => (
          <li key={i} className="grid grid-cols-[minmax(84px,38%)_1fr_auto] items-center gap-2.5 text-[13px]">
            <span className={`truncate ${it.highlight ? 'font-medium text-ink' : 'text-muted'}`} title={lab(it.label)}>{lab(it.label)}</span>
            <span className="relative h-3.5">
              <span className="absolute inset-y-0 left-0 rounded-r-[3px]" style={{ width: x(it.value), background: it.highlight ? HI : LO }} />
              {ref && <span className="absolute -top-0.5 -bottom-0.5 w-0 border-l border-dashed border-ink/60" style={{ left: x(ref.value) }} aria-hidden="true" />}
            </span>
            <span className={`num text-right min-w-[64px] ${it.highlight ? 'font-medium text-ink' : 'text-muted'}`}>
              {fmt(it.value, chart.unit)}{it.note && <span className="text-muted font-normal"> · {it.note}</span>}
            </span>
          </li>
        ))}
      </ul>
      {ref && (
        <figcaption className="text-[12px] text-muted flex items-center gap-1.5">
          <span className="inline-block w-3 border-t border-dashed border-ink/60" aria-hidden="true" />
          {t(ref.label)}: <span className="num">{fmt(ref.value, chart.unit)}</span>
          {chart.unit === 'per10' && <span> · {t({ en: 'per 10 possessions on court', is: 'á hverjar 10 sóknir inni á vellinum' })}</span>}
        </figcaption>
      )}
    </figure>
  )
}

function Scatter({ chart }: { chart: Extract<Chart, { kind: 'scatter' }> }) {
  const t = useT()
  const [hover, setHover] = useState<number | null>(null)
  const W = 420, H = 220, pl = 36, pr = 12, pt = 10, pb = 34
  const xs = chart.points.map(p => p.x), ys = chart.points.map(p => p.y)
  const pad = (lo: number, hi: number) => { const d = (hi - lo) || 1; return [lo - d * 0.08, hi + d * 0.08] }
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs)), [y0, y1] = pad(Math.min(...ys), Math.max(...ys))
  const X = (v: number) => pl + ((v - x0) / (x1 - x0)) * (W - pl - pr)
  const Y = (v: number) => pt + (1 - (v - y0) / (y1 - y0)) * (H - pt - pb)
  const ticks = (a: number, b: number) => [a, (a + b) / 2, b].map(v => Math.round(v))
  const hp = hover != null ? chart.points[hover] : null
  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
        aria-label={`${t(chart.x)} / ${t(chart.y)}: ${chart.points.map(p => `${p.label} ${p.x}, ${p.y}`).join('; ')}`}>
        {ticks(y0, y1).map(v => (
          <g key={`y${v}`}>
            <line x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} stroke="#eef0f2" />
            <text x={pl - 6} y={Y(v) + 4} textAnchor="end" className="fill-muted text-[11px] num">{v}{chart.yUnit ?? ''}</text>
          </g>
        ))}
        {ticks(x0, x1).map(v => (
          <text key={`x${v}`} x={X(v)} y={H - pb + 16} textAnchor="middle" className="fill-muted text-[11px] num">{v}{chart.xUnit ?? ''}</text>
        ))}
        <line x1={X(x0)} y1={Y(chart.intercept + chart.slope * x0)} x2={X(x1)} y2={Y(chart.intercept + chart.slope * x1)} stroke={HI} strokeWidth={2} strokeDasharray="5 4" />
        {chart.points.map((p, i) => (
          <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onPointerDown={() => setHover(i)}>
            <circle cx={X(p.x)} cy={Y(p.y)} r={12} fill="transparent" />
            <circle cx={X(p.x)} cy={Y(p.y)} r={5} fill={hover === i ? HI : '#0b0c0e'} stroke="#fff" strokeWidth={2} />
          </g>
        ))}
        <text x={(pl + W - pr) / 2} y={H - 4} textAnchor="middle" className="fill-muted text-[11px]">{t(chart.x)}</text>
      </svg>
      <figcaption className="text-[12px] text-muted">{t({ en: 'Up:', is: 'Upp:' })} {t(chart.y)} · {t({ en: 'each dot is a match; tap one to see it', is: 'hver punktur er leikur; smelltu til að sjá hann' })}</figcaption>
      {hp && (
        <div className="absolute top-1 right-1 bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] shadow-[0_6px_16px_rgba(0,0,0,0.12)] pointer-events-none">
          <span className="font-medium">{hp.label}</span>
          <span className="text-muted num"> · {hp.x}{chart.xUnit ?? ''} / {hp.y}{chart.yUnit ?? ''}</span>
        </div>
      )}
    </figure>
  )
}

function Zones({ chart }: { chart: Extract<Chart, { kind: 'zones' }> }) {
  const t = useT()
  return (
    <figure className="flex flex-col gap-1.5">
      <div className="mx-auto w-full max-w-[300px] border-[5px] border-b-0 border-ink p-1 bg-white">
        <div className="grid grid-cols-3 gap-1 aspect-[3/2]">
          {chart.cells.map(c => (
            <div key={c.zone} className="rounded-[3px] flex flex-col items-center justify-center leading-tight"
              style={{ background: c.highlight ? HI : '#f5f6f8', color: c.highlight ? '#fff' : '#0b0c0e' }}>
              <span className="text-[14px] font-semibold num">{c.faced ? `${Math.round((c.saved / c.faced) * 100)}%` : '—'}</span>
              <span className={`text-[11px] num ${c.highlight ? 'text-white/85' : 'text-muted'}`}>{c.saved}/{c.faced}</span>
            </div>
          ))}
        </div>
      </div>
      <figcaption className="text-[12px] text-muted text-center">{t({ en: 'Save % by zone of the goal, as on the shot map', is: 'Markvarsla eftir svæðum marksins, eins og á skotakortinu' })}</figcaption>
    </figure>
  )
}
