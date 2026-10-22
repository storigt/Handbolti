// Match flow: the goal difference after every goal, as a step line around zero.
// One series, one colour (cobalt); above the line we lead, below we trail.
// Hover or tap anywhere on the chart to read the score at that goal.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Event } from '@/lib/db/schema'
import { computeFlow, type Run } from '@/lib/stats/flow'
import { useT } from '@/lib/i18n/lang'
import { EmptyLine } from '@/components/ui'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

export function MatchFlow({ events, trackedTeamId, myName, oppName, height = 200 }: {
  events: Event[]
  trackedTeamId: string
  myName?: string
  oppName?: string
  height?: number
}) {
  const t = useT()
  const flow = useMemo(() => computeFlow(events, trackedTeamId), [events, trackedTeamId])
  const [wrapRef, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const pts = flow.points

  const runText = (r: Run | null, ours: boolean) => {
    if (!r) return '—'
    const span = r.fromMinute != null && r.toMinute != null
      ? (r.fromMinute === r.toMinute ? ` · ${r.fromMinute}′` : ` · ${r.fromMinute}′–${r.toMinute}′`)
      : ''
    return ours ? `${r.goals}–0${span}` : `0–${r.conceded}${span}`
  }

  const facts = (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 px-5 pb-4">
      <Fact label={t({ en: 'Best run', is: 'Besti kafli' })} value={runText(flow.bestRun, true)} />
      <Fact label={t({ en: 'Worst run', is: 'Versti kafli' })} value={runText(flow.worstRun, false)} />
      <Fact label={t({ en: 'Biggest lead', is: 'Mest forysta' })} value={flow.maxLead > 0 ? `+${flow.maxLead}` : '—'} />
      <Fact label={t({ en: 'Lead changes', is: 'Forystuskipti' })} value={String(flow.leadChanges)} />
    </dl>
  )

  if (pts.length === 0) {
    return <div className="px-5 pb-5"><EmptyLine>{t({ en: 'No goals logged yet. The flow of the match appears with the first goal.', is: 'Engin mörk skráð enn. Gangur leiksins birtist með fyrsta markinu.' })}</EmptyLine></div>
  }

  const padL = 30, padR = 12, padT = 14, padB = 22
  const w = width - padL - padR, h = height - padT - padB
  const diffs = [0, ...pts.map(p => p.us - p.them)]
  const top = Math.max(2, ...diffs), bottom = Math.min(-2, ...diffs)
  const x = (i: number) => padL + (i / pts.length) * w
  const y = (d: number) => padT + ((top - d) / (top - bottom)) * h
  // Step path: flat until each goal, then a jump
  let path = `M${x(0)},${y(0)}`
  pts.forEach((p, i) => { path += ` H${x(i + 1)} V${y(p.us - p.them)}` })
  path += ` H${x(pts.length) + 0}`
  const area = `${path} V${y(0)} H${x(0)} Z`
  const ticks = Array.from(new Set([top, 0, bottom]))
  const half = pts.findIndex(p => p.period > pts[0].period)

  function onMove(clientX: number, el: SVGSVGElement) {
    const r = el.getBoundingClientRect()
    const i = Math.round(((clientX - r.left) - padL) / w * pts.length)
    setHover(Math.min(pts.length, Math.max(1, i)))
  }

  const hp = hover != null ? pts[hover - 1] : null
  const label = t({ en: 'Goal difference after each goal', is: 'Markamunur eftir hvert mark' })

  return (
    <div>
      <div className="px-5 pb-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-muted">
        <span>{label}</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-accent" aria-hidden="true" />{t({ en: 'above zero', is: 'yfir núlli' })}: {myName ?? t({ en: 'we lead', is: 'við yfir' })}</span>
        <span>{t({ en: 'below', is: 'undir' })}: {oppName ?? t({ en: 'they lead', is: 'þau yfir' })}</span>
      </div>
      <div ref={wrapRef} className="relative px-2">
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: ${pts.map(p => `${p.us}–${p.them}`).join(', ')}`}
          className="block touch-none select-none"
          onPointerMove={e => onMove(e.clientX, e.currentTarget)}
          onPointerDown={e => onMove(e.clientX, e.currentTarget)}
          onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(null) }}>
          <defs>
            <clipPath id="flow-up"><rect x={0} y={0} width={width} height={y(0)} /></clipPath>
            <clipPath id="flow-down"><rect x={0} y={y(0)} width={width} height={height} /></clipPath>
          </defs>
          {ticks.map(v => (
            <g key={v}>
              <line x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#9aa0a8' : '#eef0f2'} strokeWidth={1} />
              <text x={padL - 6} y={y(v) + 4} textAnchor="end" className="fill-muted text-[11px] num">{v > 0 ? `+${v}` : v}</text>
            </g>
          ))}
          {half > 0 && (
            <g>
              <line x1={x(half)} x2={x(half)} y1={padT} y2={height - padB} stroke="#cfd4db" strokeDasharray="3 3" />
              <text x={x(half) + 4} y={height - 7} className="fill-muted text-[11px]">{t({ en: 'Second half', is: 'Seinni hálfleikur' })}</text>
            </g>
          )}
          <path d={area} fill="#1f2de6" fillOpacity={0.12} clipPath="url(#flow-up)" />
          <path d={area} fill="#5d6470" fillOpacity={0.12} clipPath="url(#flow-down)" />
          <path d={path} fill="none" stroke="#1f2de6" strokeWidth={2} strokeLinejoin="round" />
          <text x={padL} y={height - 7} className="fill-muted text-[11px]">{t({ en: 'Kick-off', is: 'Upphaf' })}</text>
          <text x={width - padR} y={height - 7} textAnchor="end" className="fill-muted text-[11px] num">{pts[pts.length - 1].us}–{pts[pts.length - 1].them}</text>
          {hp && (
            <g pointerEvents="none">
              <line x1={x(hover!)} x2={x(hover!)} y1={padT} y2={height - padB} stroke="#0b0c0e" strokeWidth={1} />
              <circle cx={x(hover!)} cy={y(hp.us - hp.them)} r={4.5} fill="#1f2de6" stroke="#fff" strokeWidth={2} />
            </g>
          )}
        </svg>
        {hp && (
          <div className="absolute top-0 pointer-events-none bg-white border border-line rounded-md shadow-[0_6px_16px_rgba(0,0,0,0.12)] px-2.5 py-1.5 text-[13px] whitespace-nowrap"
            style={{ left: Math.min(Math.max(x(hover!) + 8, 0), width - 150) }}>
            <span className="font-semibold num">{hp.us}–{hp.them}</span>
            <span className="text-muted"> · {hp.ours ? (myName ?? t({ en: 'Our goal', is: 'Okkar mark' })) : (oppName ?? t({ en: 'Their goal', is: 'Þeirra mark' }))}</span>
            {hp.minute != null && <span className="text-muted num"> · {hp.minute}′</span>}
          </div>
        )}
      </div>
      {facts}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="text-[17px] font-medium num">{value}</dd>
    </div>
  )
}
