// Edit indices: change formulas and colour limits of any index, add your own,
// hide or reset the originals. Works on a draft; nothing changes until Save.
// Values update live against the data on the screen the editor was opened from.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { IndexRaw } from '@/lib/stats/indices'
import {
  checkDef, evaluateIndices, inputValues, defaultFor, newIndexId, band, BAND_BG, BAND_TEXT,
  INPUTS, type IndexDef, type IndexStep, type Label, type DefProblem,
} from '@/lib/stats/indexDefs'
import { FUNCTIONS } from '@/lib/stats/formula'
import { GROUP_TEXT, type InputGroup } from '@/lib/stats/indexInputs'
import { useIndexStore } from '@/store/indexStore'
import { useLang, useT, type Text } from '@/lib/i18n/lang'
import { Button, Segmented } from '@/components/ui'
import { colourNote, useLabel } from './indexUi'

const fmt = (v: number) => (Math.abs(v) >= 1000 ? Math.round(v).toString() : Math.abs(v) < 1 && v !== 0 ? v.toFixed(2) : v.toFixed(1))
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

/** Field reference for inserting names at the cursor: [def id, 'formula' | step index]. */
type FieldRef = { id: string; field: 'formula' | number }

export function IndexEditor({ raw, onClose }: { raw: IndexRaw; onClose: () => void }) {
  const t = useT()
  const label = useLabel()
  const lang = useLang(s => s.lang)
  const saved = useIndexStore(s => s.defs)
  const save = useIndexStore(s => s.save)
  const [draft, setDraft] = useState<IndexDef[]>(() => clone(saved))
  const [selId, setSelId] = useState(draft[0]?.id ?? '')
  const [confirmClose, setConfirmClose] = useState(false)
  const [resets, setResets] = useState(0)   // re-seeds the colour inputs after a reset
  const lastField = useRef<FieldRef | null>(null)
  const inputsRef = useRef<Map<string, HTMLTextAreaElement>>(new Map())

  const evaluated = useMemo(() => evaluateIndices(draft, raw), [draft, raw])
  const problems = useMemo(() => Object.fromEntries(draft.map(d => [d.id, checkDef(d, draft)])) as Record<string, DefProblem[]>, [draft])
  const totalProblems = Object.values(problems).reduce((n, p) => n + p.length, 0)
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const sel = draft.find(d => d.id === selId) ?? draft[0]

  // Escape closes (asks first when there are unsaved changes)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (dirty) setConfirmClose(true); else onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dirty, onClose])

  function update(id: string, fn: (d: IndexDef) => IndexDef) {
    setDraft(ds => ds.map(d => (d.id === id ? fn(clone(d)) : d)))
  }
  function setLabel(old: Label, value: string): Label {
    return typeof old === 'string' ? value : { ...old, [lang]: value }
  }

  /** Renaming an index or a step updates every formula that used the old name. */
  function renameRefs(oldName: string, newName: string, scope: 'all' | string) {
    if (!oldName || oldName === newName || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(newName)) return
    const re = new RegExp(`\\b${oldName}\\b`, 'g')
    setDraft(ds => ds.map(d => {
      if (scope !== 'all' && d.id !== scope) return d
      return { ...d, formula: d.formula.replace(re, newName), steps: d.steps.map(s => ({ ...s, formula: s.formula.replace(re, newName) })) }
    }))
  }

  function addIndex() {
    const n = draft.filter(d => !d.builtIn).length + 1
    let key = `MY${n}`
    while (draft.some(d => d.key === key)) key += '_'
    const def: IndexDef = {
      id: newIndexId(), key, name: t({ en: 'My index', is: 'Mín vísitala' }),
      steps: [], formula: 'clamp(ourShotEff)', green: 70, yellow: 50, higherIsBetter: true,
    }
    setDraft(ds => [...ds, def])
    setSelId(def.id)
  }

  function insert(text: string) {
    const ref = lastField.current
    if (!ref || !sel || ref.id !== sel.id) return
    const el = inputsRef.current.get(`${ref.id}:${ref.field}`)
    const cur = ref.field === 'formula' ? sel.formula : sel.steps[ref.field]?.formula ?? ''
    const start = el?.selectionStart ?? cur.length, end = el?.selectionEnd ?? cur.length
    const next = cur.slice(0, start) + text + cur.slice(end)
    update(sel.id, d => {
      if (ref.field === 'formula') d.formula = next
      else d.steps[ref.field].formula = next
      return d
    })
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + text.length, start + text.length) })
  }

  async function onSave() {
    await save(draft)
    onClose()
  }

  if (!sel) return null
  const res = evaluated.byId[sel.id]
  const selProblems = problems[sel.id] ?? []
  const stepProblem = (i: number) => selProblems.find(p => p.where === 'step' && p.step === i)
  const original = sel.builtIn ? defaultFor(sel.builtIn) : undefined
  const changedFromOriginal = original && JSON.stringify({ ...original, hidden: undefined }) !== JSON.stringify({ ...sel, hidden: undefined })

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-stretch sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="ixe-h">
      <div className="bg-ground w-full max-w-[1180px] h-full sm:h-[92svh] sm:rounded-xl overflow-hidden flex flex-col shadow-[0_24px_48px_rgba(0,0,0,0.25)]">
        {/* Header */}
        <div className="h-14 px-4 sm:px-5 flex items-center justify-between gap-3 bg-white border-b border-line shrink-0">
          <h2 id="ixe-h" className="text-[17px] font-semibold">{t({ en: 'Edit indices', is: 'Breyta vísitölum' })}</h2>
          <p className="hidden md:block text-[13px] text-muted truncate">{t({ en: 'Values below use the data on the screen you came from.', is: 'Gildin hér nota gögnin á skjánum sem þú komst frá.' })}</p>
          <button type="button" onClick={() => (dirty ? setConfirmClose(true) : onClose())} aria-label={t({ en: 'Close', is: 'Loka' })}
            className="w-9 h-9 grid place-items-center rounded-md text-muted hover:text-ink hover:bg-[#eef0f3]">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[250px_minmax(0,1fr)]">
          {/* List */}
          <nav className="bg-white md:border-r border-b md:border-b-0 border-line overflow-y-auto max-h-[30svh] md:max-h-none" aria-label={t({ en: 'Indices', is: 'Vísitölur' })}>
            <ul className="p-2 flex flex-col gap-0.5">
              {draft.map(d => {
                const r = evaluated.byId[d.id]
                const bad = (problems[d.id]?.length ?? 0) > 0
                return (
                  <li key={d.id}>
                    <button type="button" onClick={() => setSelId(d.id)} aria-current={d.id === sel.id ? 'true' : undefined}
                      className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-3 transition-colors ${d.id === sel.id ? 'bg-[#eef0f3]' : 'hover:bg-[#f5f6f8]'}`}>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${bad || r?.value === null ? 'bg-[#c4242a]' : BAND_BG[band(d, r.value ?? 0)]}`} aria-hidden="true" />
                      <span className="flex-1 min-w-0">
                        <span className={`block text-[14px] font-medium truncate ${d.hidden ? 'text-muted' : ''}`}>{d.key}</span>
                        <span className="block text-[12px] text-muted truncate">{label(d.name)}</span>
                      </span>
                      <span className="text-[13px] num text-muted">{bad ? '!' : r?.value === null ? '—' : fmt(r.value ?? 0)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <div className="p-2 pt-0">
              <Button variant="secondary" size="sm" className="w-full" onClick={addIndex}>+ {t({ en: 'New index', is: 'Ný vísitala' })}</Button>
            </div>
          </nav>

          {/* Editor */}
          <div className="overflow-y-auto">
            <div className="p-4 sm:p-6 flex flex-col gap-6 max-w-[820px]">
              {/* Names */}
              <section className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
                <Field label={t({ en: 'Short name', is: 'Stutt heiti' })} hint={t({ en: 'Used in formulas', is: 'Notað í formúlum' })}
                  error={selProblems.find(p => p.where === 'key')?.message}>
                  <input value={sel.key} spellCheck={false}
                    onFocus={e => (e.currentTarget.dataset.before = sel.key)}
                    onBlur={e => renameRefs(e.currentTarget.dataset.before ?? '', sel.key, 'all')}
                    onChange={e => update(sel.id, d => ({ ...d, key: e.target.value.trim() }))}
                    className="h-10 px-3 rounded-md bg-white border border-[#cdd2d9] font-mono text-[15px] focus:outline-none focus:ring-2 focus:ring-accent" />
                </Field>
                <Field label={t({ en: 'Full name', is: 'Fullt heiti' })}>
                  <input value={label(sel.name)} onChange={e => update(sel.id, d => ({ ...d, name: setLabel(d.name, e.target.value) }))}
                    className="h-10 px-3 rounded-md bg-white border border-[#cdd2d9] text-[15px] focus:outline-none focus:ring-2 focus:ring-accent" />
                </Field>
              </section>

              {/* Result now */}
              <section className="bg-white border border-line rounded-lg p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                <div>
                  <p className="text-[13px] text-muted">{t({ en: 'Value with the current data', is: 'Gildi með núverandi gögnum' })}</p>
                  <p className={`text-[32px] font-semibold num leading-tight ${res.value === null ? 'text-[#c4242a]' : BAND_TEXT[band(sel, res.value)]}`}>
                    {res.value === null ? '—' : fmt(res.value)}
                  </p>
                </div>
                {res.error && <p className="text-[14px] text-[#c4242a] flex-1 min-w-[200px]">{t(res.error)}</p>}
                <label className="ml-auto flex items-center gap-2 text-[14px] select-none">
                  <input type="checkbox" checked={!sel.hidden} onChange={e => update(sel.id, d => ({ ...d, hidden: !e.target.checked }))} className="w-4 h-4 accent-[#111214]" />
                  {t({ en: 'Show on screens', is: 'Sýna á skjám' })}
                </label>
              </section>

              {/* Steps */}
              <section className="flex flex-col gap-3">
                <div>
                  <h3 className="text-[15px] font-semibold">{t({ en: 'Steps', is: 'Skref' })}</h3>
                  <p className="text-[13px] text-muted">{t({ en: 'Optional. Each step gets a name that later steps and the result can use.', is: 'Valfrjálst. Hvert skref fær heiti sem næstu skref og niðurstaðan geta notað.' })}</p>
                </div>
                {sel.steps.map((s, i) => (
                  <StepCard key={i} step={s} index={i} count={sel.steps.length}
                    value={res.steps[s.key]} problem={stepProblem(i)?.message}
                    labelText={label(s.label)}
                    taRef={el => { const k = `${sel.id}:${i}`; if (el) inputsRef.current.set(k, el); else inputsRef.current.delete(k) }}
                    onFocusFormula={() => (lastField.current = { id: sel.id, field: i })}
                    onChange={(patch, renamedFrom) => {
                      update(sel.id, d => { d.steps[i] = { ...d.steps[i], ...patch, label: patch.label !== undefined ? setLabel(d.steps[i].label, patch.label as string) : d.steps[i].label }; return d })
                      if (renamedFrom !== undefined && patch.key) renameRefs(renamedFrom, patch.key, sel.id)
                    }}
                    onMove={dir => update(sel.id, d => { const j = i + dir; [d.steps[i], d.steps[j]] = [d.steps[j], d.steps[i]]; return d })}
                    onRemove={() => update(sel.id, d => { d.steps.splice(i, 1); return d })}
                  />
                ))}
                <div>
                  <Button variant="secondary" size="sm" onClick={() => update(sel.id, d => {
                    let k = `step${d.steps.length + 1}`
                    while (d.steps.some(s => s.key === k)) k += '_'
                    d.steps.push({ key: k, label: k, formula: '0', show: true })
                    return d
                  })}>+ {t({ en: 'Add step', is: 'Bæta við skrefi' })}</Button>
                </div>
              </section>

              {/* Result formula */}
              <section className="flex flex-col gap-2">
                <h3 className="text-[15px] font-semibold">{t({ en: 'Result', is: 'Niðurstaða' })} <span className="font-mono font-normal text-muted">{sel.key} =</span></h3>
                <FormulaBox value={sel.formula} problem={selProblems.find(p => p.where === 'formula')?.message}
                  taRef={el => { const k = `${sel.id}:formula`; if (el) inputsRef.current.set(k, el); else inputsRef.current.delete(k) }}
                  onFocus={() => (lastField.current = { id: sel.id, field: 'formula' })}
                  onChange={v => update(sel.id, d => ({ ...d, formula: v }))} />
                <p className="text-[13px] text-muted">{t({ en: 'Bars run from 0 to 100; wrap the result in clamp( ) to keep it there.', is: 'Stikurnar ná frá 0 til 100; settu niðurstöðuna í clamp( ) til að halda henni þar.' })}</p>
              </section>

              {/* Colours */}
              <ColourSection def={sel} version={resets + (sel.higherIsBetter ? 0 : 1000)} problem={selProblems.find(p => p.where === 'colours')?.message}
                onChange={patch => update(sel.id, d => ({ ...d, ...patch }))} />

              {/* Names you can use */}
              <Reference raw={raw} draft={draft} sel={sel} onInsert={insert} />

              {/* Reset / delete */}
              <section className="flex flex-wrap gap-2 pt-2 border-t border-line">
                {original ? (
                  <Button variant="secondary" size="sm" disabled={!changedFromOriginal}
                    onClick={() => { update(sel.id, d => ({ ...clone(original), hidden: d.hidden })); setResets(n => n + 1) }}>
                    {t({ en: 'Reset to original', is: 'Endurstilla í upprunalegt' })}
                  </Button>
                ) : (
                  <Button variant="danger" size="sm" onClick={() => {
                    setDraft(ds => ds.filter(d => d.id !== sel.id))
                    setSelId(draft.find(d => d.id !== sel.id)?.id ?? '')
                  }}>{t({ en: 'Delete this index', is: 'Eyða þessari vísitölu' })}</Button>
                )}
                {original && <p className="text-[13px] text-muted self-center">{t({ en: 'Original indices can be hidden but not deleted.', is: 'Upprunalegar vísitölur má fela en ekki eyða.' })}</p>}
              </section>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3 bg-white border-t border-line flex flex-wrap items-center justify-between gap-3 shrink-0">
          <p className={`text-[14px] ${totalProblems ? 'text-[#c4242a]' : 'text-muted'}`} aria-live="polite">
            {totalProblems
              ? t({ en: `${totalProblems} thing(s) to fix before saving.`, is: `${totalProblems} atriði þarf að laga áður en vistað er.` })
              : dirty ? t({ en: 'Unsaved changes. Saving recalculates every screen; your match data is not changed.', is: 'Óvistaðar breytingar. Vistun endurreiknar alla skjái; leikgögnin breytast ekki.' })
                : t({ en: 'No changes.', is: 'Engar breytingar.' })}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => (dirty ? setConfirmClose(true) : onClose())}>{t({ en: 'Cancel', is: 'Hætta við' })}</Button>
            <Button variant="primary" disabled={!dirty || totalProblems > 0} onClick={onSave}>{t({ en: 'Save', is: 'Vista' })}</Button>
          </div>
        </div>

        {confirmClose && (
          <div className="absolute inset-0 bg-black/30 grid place-items-center p-4">
            <div className="bg-white rounded-xl p-5 max-w-[380px] w-full flex flex-col gap-4 shadow-[0_24px_48px_rgba(0,0,0,0.25)]" role="alertdialog" aria-labelledby="ixe-c">
              <p id="ixe-c" className="text-[16px] font-medium">{t({ en: 'Close without saving?', is: 'Loka án þess að vista?' })}</p>
              <p className="text-[14px] text-muted">{t({ en: 'Your changes to the indices will be lost.', is: 'Breytingarnar á vísitölunum tapast.' })}</p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setConfirmClose(false)}>{t({ en: 'Keep editing', is: 'Halda áfram' })}</Button>
                <Button variant="danger" onClick={onClose}>{t({ en: 'Discard changes', is: 'Henda breytingum' })}</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const GROUP_ORDER: InputGroup[] = ['attack', 'attackRange', 'attackPhase', 'attackOrigin', 'attackZone', 'defence', 'keeper', 'keeperRange', 'keeperPhase', 'keeperOrigin', 'keeperZone', 'opponent']

// ─── Pieces ───────────────────────────────────────────────────────────────────

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: Text; children: React.ReactNode }) {
  const t = useT()
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium">{label}{hint && <span className="font-normal text-muted"> · {hint}</span>}</span>
      {children}
      {error && <span className="text-[13px] text-[#c4242a]">{t(error)}</span>}
    </label>
  )
}

function FormulaBox({ value, problem, onChange, onFocus, taRef }: {
  value: string
  problem?: Text
  onChange: (v: string) => void
  onFocus: () => void
  taRef: (el: HTMLTextAreaElement | null) => void
}) {
  const t = useT()
  return (
    <div className="flex flex-col gap-1">
      <textarea ref={taRef} value={value} rows={2} spellCheck={false} onFocus={onFocus} onChange={e => onChange(e.target.value)}
        aria-invalid={!!problem}
        className={`w-full px-3 py-2 rounded-md bg-white border font-mono text-[14px] leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-accent ${problem ? 'border-[#e8a2a5]' : 'border-[#cdd2d9]'}`} />
      {problem && <p className="text-[13px] text-[#c4242a]">{t(problem)}</p>}
    </div>
  )
}

function StepCard({ step, index, count, value, problem, labelText, onChange, onMove, onRemove, onFocusFormula, taRef }: {
  step: IndexStep
  index: number
  count: number
  value: number | undefined
  problem?: Text
  labelText: string
  onChange: (patch: Partial<IndexStep>, renamedFrom?: string) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
  onFocusFormula: () => void
  taRef: (el: HTMLTextAreaElement | null) => void
}) {
  const t = useT()
  const before = useRef(step.key)
  return (
    <div className="bg-white border border-line rounded-lg p-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input value={step.key} spellCheck={false} aria-label={t({ en: 'Step name', is: 'Heiti skrefs' })}
          onFocus={() => (before.current = step.key)}
          onBlur={() => { if (before.current !== step.key) onChange({ key: step.key }, before.current) }}
          onChange={e => onChange({ key: e.target.value.trim() })}
          className="h-9 w-[160px] px-2.5 rounded-md border border-[#cdd2d9] font-mono text-[14px] focus:outline-none focus:ring-2 focus:ring-accent" />
        <input value={labelText} aria-label={t({ en: 'Label', is: 'Lýsing' })} placeholder={t({ en: 'Label shown in the breakdown', is: 'Lýsing sem birtist' })}
          onChange={e => onChange({ label: e.target.value })}
          className="h-9 flex-1 min-w-[160px] px-2.5 rounded-md border border-[#cdd2d9] text-[14px] focus:outline-none focus:ring-2 focus:ring-accent" />
        <span className="text-[14px] num w-16 text-right">{value === undefined ? '—' : fmt(value)}</span>
      </div>
      <FormulaBox value={step.formula} problem={problem} taRef={taRef} onFocus={onFocusFormula} onChange={v => onChange({ formula: v })} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <label className="flex items-center gap-2 text-[13px] select-none">
          <input type="checkbox" checked={step.show} onChange={e => onChange({ show: e.target.checked })} className="w-4 h-4 accent-[#111214]" />
          {t({ en: 'Show as a component', is: 'Sýna sem hluta' })}
        </label>
        <span className="flex-1" />
        <button type="button" disabled={index === 0} onClick={() => onMove(-1)} className="text-[13px] text-muted hover:text-ink disabled:opacity-40">{t({ en: 'Move up', is: 'Upp' })}</button>
        <button type="button" disabled={index === count - 1} onClick={() => onMove(1)} className="text-[13px] text-muted hover:text-ink disabled:opacity-40">{t({ en: 'Move down', is: 'Niður' })}</button>
        <button type="button" onClick={onRemove} className="text-[13px] text-[#c4242a] hover:underline">{t({ en: 'Remove', is: 'Fjarlægja' })}</button>
      </div>
    </div>
  )
}

function ColourSection({ def, version, problem, onChange }: { def: IndexDef; version: number; problem?: Text; onChange: (p: Partial<IndexDef>) => void }) {
  const t = useT()
  const num = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')))
  // The preview bar: 0–100, each point coloured by the limits
  const stops = Array.from({ length: 101 }, (_, i) => band(def, i))
  const segs: { from: number; to: number; b: string }[] = []
  stops.forEach((b, i) => { const l = segs[segs.length - 1]; if (l && l.b === b) l.to = i; else segs.push({ from: i, to: i, b }) })
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[15px] font-semibold">{t({ en: 'Colours', is: 'Litir' })}</h3>
      <Segmented<'hi' | 'lo'> value={def.higherIsBetter ? 'hi' : 'lo'} label={t({ en: 'Which way is good', is: 'Hvað er gott' })}
        onChange={v => {
          // Flipping the direction swaps the two limits, so 70/50 becomes 50/70 and stays valid
          if ((v === 'hi') !== def.higherIsBetter) onChange({ higherIsBetter: v === 'hi', green: def.yellow, yellow: def.green })
        }}
        options={[{ v: 'hi', label: t({ en: 'Higher is better', is: 'Hærra er betra' }) }, { v: 'lo', label: t({ en: 'Lower is better', is: 'Lægra er betra' }) }]} />
      <div className="flex flex-wrap gap-4">
        <ColourInput key={`g-${def.id}-${version}`} colour="bg-[#2f9461]" label={def.higherIsBetter ? t({ en: 'Green from', is: 'Grænt frá' }) : t({ en: 'Green up to', is: 'Grænt upp að' })}
          value={def.green} onChange={v => onChange({ green: num(v) })} />
        <ColourInput key={`y-${def.id}-${version}`} colour="bg-[#d08a1a]" label={def.higherIsBetter ? t({ en: 'Yellow from', is: 'Gult frá' }) : t({ en: 'Yellow up to', is: 'Gult upp að' })}
          value={def.yellow} onChange={v => onChange({ yellow: num(v) })} />
        <div className="flex items-end gap-2 pb-2 text-[14px] text-muted">
          <span className="w-3 h-3 rounded-sm bg-[#d4454a]" aria-hidden="true" />
          {def.higherIsBetter ? t({ en: `Red below ${def.yellow}`, is: `Rautt undir ${def.yellow}` }) : t({ en: `Red above ${def.yellow}`, is: `Rautt yfir ${def.yellow}` })}
        </div>
      </div>
      {problem ? <p className="text-[13px] text-[#c4242a]">{t(problem)}</p> : (
        <div>
          <div className="flex h-2.5 rounded-full overflow-hidden" aria-hidden="true">
            {segs.map(s => <span key={s.from} className={BAND_BG[s.b as 'green']} style={{ width: `${s.to - s.from + 1}%` }} />)}
          </div>
          <div className="flex justify-between text-[12px] text-muted num mt-1"><span>0</span><span>50</span><span>100</span></div>
          <p className="text-[13px] text-muted mt-1">{colourNote(def, t)}</p>
        </div>
      )}
    </section>
  )
}

function ColourInput({ colour, label, value, onChange }: { colour: string; label: string; value: number; onChange: (v: string) => void }) {
  const [text, setText] = useState(Number.isFinite(value) ? String(value) : '')
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium flex items-center gap-2"><span className={`w-3 h-3 rounded-sm ${colour}`} aria-hidden="true" />{label}</span>
      <input inputMode="decimal" value={text} onChange={e => { setText(e.target.value); onChange(e.target.value) }}
        className="h-10 w-28 px-3 rounded-md bg-white border border-[#cdd2d9] text-[15px] num focus:outline-none focus:ring-2 focus:ring-accent" />
    </label>
  )
}

function Reference({ raw, draft, sel, onInsert }: { raw: IndexRaw; draft: IndexDef[]; sel: IndexDef; onInsert: (s: string) => void }) {
  const t = useT()
  const label = useLabel()
  const [q, setQ] = useState('')
  const values = useMemo(() => inputValues(raw), [raw])
  const match = (s: string) => s.toLowerCase().includes(q.trim().toLowerCase())
  const inputs = INPUTS.filter(i => !q || match(i.key) || match(t(i.label)))
  const others = draft.filter(d => d.id !== sel.id && (!q || match(d.key) || match(label(d.name))))
  const steps = sel.steps.filter(s => !q || match(s.key))
  const chip = 'text-left px-2.5 py-1.5 rounded-md bg-white border border-line hover:border-[#9aa0a8] transition-colors'
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-[15px] font-semibold">{t({ en: 'Names you can use', is: 'Heiti sem þú getur notað' })}</h3>
        <p className="text-[13px] text-muted">{t({ en: 'Click a formula box, then a name to put it in at the cursor.', is: 'Smelltu í formúlureit og svo á heiti til að setja það inn.' })}</p>
      </div>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t({ en: 'Search…', is: 'Leita…' })}
        className="h-9 px-3 rounded-md bg-white border border-[#cdd2d9] text-[14px] max-w-[320px] focus:outline-none focus:ring-2 focus:ring-accent" />
      {steps.length > 0 && <Group title={t({ en: 'Steps in this index', is: 'Skref í þessari vísitölu' })}>
        {steps.map(s => <button key={s.key} type="button" className={chip} onClick={() => onInsert(s.key)}><span className="font-mono text-[13px]">{s.key}</span></button>)}
      </Group>}
      {others.length > 0 && <Group title={t({ en: 'Other indices', is: 'Aðrar vísitölur' })}>
        {others.map(d => <button key={d.id} type="button" className={chip} onClick={() => onInsert(d.key)}><span className="font-mono text-[13px]">{d.key}</span> <span className="text-[12px] text-muted">{label(d.name)}</span></button>)}
      </Group>}
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-medium text-muted">
          {t({ en: `Counted from events · ${INPUTS.length} numbers`, is: `Talið úr skráningum · ${INPUTS.length} tölur` })}
        </p>
        {GROUP_ORDER.map(g => {
          const list = inputs.filter(i => i.group === g)
          if (list.length === 0) return null
          return (
            <details key={`${g}-${q ? 'q' : ''}`} open={!!q} className="group bg-[#f5f6f8] rounded-md">
              <summary className="cursor-pointer select-none px-3 py-2 text-[14px] font-medium flex items-center justify-between">
                <span>{t(GROUP_TEXT[g])}</span>
                <span className="text-[12px] text-muted num">{list.length}</span>
              </summary>
              <div className="flex flex-wrap gap-1.5 px-3 pb-3">
                {list.map(i => (
                  <button key={i.key} type="button" className={chip} onClick={() => onInsert(i.key)}>
                    <span className="font-mono text-[13px]">{i.key}</span>{' '}
                    <span className="text-[12px] text-muted">{t(i.label)} · <span className="num">{i.pct ? `${(values[i.key] ?? 0).toFixed(1)}%` : fmt(values[i.key] ?? 0).replace(/\.0$/, '')}</span></span>
                  </button>
                ))}
              </div>
            </details>
          )
        })}
        {q && inputs.length === 0 && <p className="text-[13px] text-muted">{t({ en: 'No numbers match.', is: 'Engar tölur passa.' })}</p>}
      </div>
      <Group title={t({ en: 'Functions and signs', is: 'Föll og tákn' })}>
        {[...Object.keys(FUNCTIONS).map(f => `${f}(`), '+', '−', '×', '/', '^', '(', ')', '>=', '<='].map(f => (
          <button key={f} type="button" className={chip} onClick={() => onInsert(f)}><span className="font-mono text-[13px]">{f}</span></button>
        ))}
      </Group>
      <p className="text-[13px] text-muted">
        {t({
          en: 'clamp(x) keeps x between 0 and 100 · if(a > b, then, otherwise) · dividing by zero gives 0 · min( ), max( ) take any number of values.',
          is: 'clamp(x) heldur x milli 0 og 100 · if(a > b, þá, annars) · deiling með núlli gefur 0 · min( ) og max( ) taka hvaða fjölda gilda sem er.',
        })}
      </p>
    </section>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[13px] font-medium text-muted">{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}
