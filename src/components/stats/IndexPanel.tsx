// Indices: one card per index, drawn from its definition (src/lib/stats/indexDefs.ts).
// The six originals and the user's own all work the same way; "Edit indices"
// opens the editor. Colours follow each index's own green/yellow/red limits.
import { useMemo, useState } from 'react'
import type { IndexBreakdown } from '@/lib/stats/indices'
import {
  evaluateIndices, inputValues, band, BAND_BG, BAND_TEXT, INPUTS, SEGMENT_INPUTS,
  type IndexDef, type IndexResult,
} from '@/lib/stats/indexDefs'
import { parse, namesIn } from '@/lib/stats/formula'
import { useIndexStore } from '@/store/indexStore'
import { useT, type Text } from '@/lib/i18n/lang'
import { Button } from '@/components/ui'
import { IndexEditor } from './IndexEditor'
import { colourNote, useLabel } from './indexUi'

const fmt = (v: number) => (Math.abs(v) >= 1000 ? Math.round(v).toString() : Math.abs(v) < 1 && v !== 0 ? v.toFixed(2) : v.toFixed(1))

// ─── Bars ─────────────────────────────────────────────────────────────────────

function ScoreBar({ def, value }: { def: IndexDef; value: number }) {
  const b = band(def, value)
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <div className="flex-1 h-2 bg-[#eef0f2] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${BAND_BG[b]}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <span className={`text-[17px] font-semibold num w-14 text-right ${BAND_TEXT[b]}`}>{fmt(value)}</span>
    </div>
  )
}

function SubRow({ def, label, value }: { def: IndexDef; label: string; value: number }) {
  const b = band(def, value)
  const inScale = value >= 0 && value <= 100
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-[14px] text-ink flex-1 min-w-0">{label}</span>
      {inScale && (
        <div className="w-24 h-1.5 bg-[#eef0f2] rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${BAND_BG[b]}`} style={{ width: `${value}%` }} />
        </div>
      )}
      <span className={`text-[14px] font-medium num w-14 text-right ${inScale ? BAND_TEXT[b] : 'text-ink'}`}>{fmt(value)}</span>
    </div>
  )
}

function RawRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1 border-t border-[#eef0f2] first:border-t-0">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="text-[13px] num text-ink">{value}</span>
    </div>
  )
}

function Section({ text }: { text: Text }) {
  const t = useT()
  return <p className="text-[13px] font-medium text-ink pt-4 pb-1">{t(text)}</p>
}

// ─── One index ────────────────────────────────────────────────────────────────

/** Steps that depend on whole-match keeper segments, directly or through earlier steps. */
function segmentSteps(def: IndexDef): Set<string> {
  const out = new Set<string>()
  for (const s of def.steps) {
    try {
      const names = namesIn(parse(s.formula))
      if ([...names].some(n => SEGMENT_INPUTS.has(n) || out.has(n))) out.add(s.key)
    } catch { /* shown as an error elsewhere */ }
  }
  return out
}

function IndexCard({ def, result, inputs, minuteFiltered }: {
  def: IndexDef
  result: IndexResult
  inputs: Record<string, number>
  minuteFiltered: boolean
}) {
  const t = useT()
  const label = useLabel()
  const [open, setOpen] = useState(false)
  const [formulas, setFormulas] = useState(false)
  const segSteps = useMemo(() => segmentSteps(def), [def])
  const shownSteps = def.steps.filter(s => s.show && !(minuteFiltered && segSteps.has(s.key)))
  const shownInputs = result.inputsUsed.filter(k => !(minuteFiltered && SEGMENT_INPUTS.has(k)))

  return (
    <div className="border border-line rounded-lg overflow-hidden bg-white">
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3.5 flex items-center gap-4 text-left hover:bg-[#f8f9fa] transition-colors">
        <div className="shrink-0 w-[150px] sm:w-[220px] min-w-0">
          <span className="text-[15px] font-semibold">{def.key}</span>
          <p className="text-[12px] text-muted leading-snug mt-0.5 truncate">{label(def.name)}</p>
        </div>
        {result.value === null
          ? <span className="flex-1 text-[14px] text-[#c4242a]">{t({ en: 'Formula error', is: 'Villa í formúlu' })}</span>
          : <ScoreBar def={def} value={result.value} />}
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className={`text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-line">
          {result.error && <p className="pt-3 text-[14px] text-[#c4242a]">{t(result.error)}</p>}
          {shownSteps.length > 0 && (
            <>
              <Section text={{ en: 'Components', is: 'Hlutfallstölur' }} />
              {shownSteps.map(s => <SubRow key={s.key} def={def} label={label(s.label)} value={result.steps[s.key] ?? 0} />)}
            </>
          )}
          {shownInputs.length > 0 && (
            <>
              <Section text={{ en: 'Inputs', is: 'Grunntölur' }} />
              {shownInputs.map(k => {
                const meta = INPUTS.find(i => i.key === k)!
                const v = inputs[k] ?? 0
                return <RawRow key={k} label={t(meta.label)} value={meta.pct ? `${v.toFixed(1)}%` : Number.isInteger(v) ? String(v) : v.toFixed(2)} />
              })}
            </>
          )}
          <div className="mt-3">
            <button type="button" aria-expanded={formulas} onClick={() => setFormulas(o => !o)}
              className="text-[13px] text-muted hover:text-ink underline underline-offset-4">
              {formulas ? t({ en: 'Hide formulas', is: 'Fela formúlur' }) : t({ en: 'Show formulas', is: 'Sýna formúlur' })}
            </button>
            {formulas && (
              <div className="mt-1 space-y-1">
                <Formula label={def.key} formula={def.formula} />
                {def.steps.map(s => <Formula key={s.key} label={`${s.key} · ${label(s.label)}`} formula={s.formula} />)}
              </div>
            )}
          </div>
          <p className="text-[12px] text-muted mt-3">{colourNote(def, t)}</p>
        </div>
      )}
    </div>
  )
}

function Formula({ label, formula }: { label: string; formula: string }) {
  return (
    <div className="py-0.5">
      <p className="text-[12px] font-medium text-muted mt-2 mb-1">{label}</p>
      <code className="block text-[12px] font-mono text-ink bg-[#f5f6f8] border border-line rounded-md px-2.5 py-1.5 leading-relaxed whitespace-pre-wrap break-all">{formula}</code>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function IndexPanel({ breakdown, minuteFiltered = false }: { breakdown: IndexBreakdown; minuteFiltered?: boolean }) {
  const t = useT()
  const defs = useIndexStore(s => s.defs)
  const syncState = useIndexStore(s => s.syncState)
  const [editing, setEditing] = useState(false)
  const evaluated = useMemo(() => evaluateIndices(defs, breakdown.raw), [defs, breakdown.raw])
  const inputs = useMemo(() => inputValues(breakdown.raw), [breakdown.raw])
  const visible = defs.filter(d => !d.hidden)

  return (
    <div className="space-y-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1 print:hidden">
        <p className="text-[13px] text-muted">
          {syncState === 'local'
            ? t({ en: 'Index changes are saved on this device for now and will be sent to your account automatically.', is: 'Breytingarnar eru vistaðar á þessu tæki í bili og fara sjálfkrafa á aðganginn þinn.' })
            : t({ en: 'Tap an index to see how it is calculated.', is: 'Smelltu á vísitölu til að sjá hvernig hún er reiknuð.' })}
        </p>
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>{t({ en: 'Edit indices', is: 'Breyta vísitölum' })}</Button>
      </div>
      {visible.map(d => (
        <IndexCard key={d.id} def={d} result={evaluated.byId[d.id]} inputs={inputs} minuteFiltered={minuteFiltered} />
      ))}
      {visible.length === 0 && (
        <p className="text-[14px] text-muted border border-dashed border-[#cfd4db] rounded-lg px-3 py-2.5">
          {t({ en: 'All indices are hidden. Use Edit indices to show them again.', is: 'Allar vísitölur eru faldar. Notaðu „Breyta vísitölum“ til að sýna þær aftur.' })}
        </p>
      )}
      {editing && <IndexEditor raw={breakdown.raw} onClose={() => setEditing(false)} />}
    </div>
  )
}
