import { useState } from 'react'
import type { IndexBreakdown, IndexRaw } from '@/lib/stats/indices'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(v: number): string {
  if (v >= 70) return 'text-green-600'
  if (v >= 50) return 'text-amber-500'
  return 'text-red-500'
}

function barColor(v: number): string {
  if (v >= 70) return 'bg-green-500'
  if (v >= 50) return 'bg-amber-400'
  return 'bg-red-400'
}

function fmt(v: number): string {
  return v.toFixed(1)
}

function pct(v: number): string {
  return `${v.toFixed(1)}%`
}

// ─── Score gauge bar ──────────────────────────────────────────────────────────

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor(value)}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className={`text-sm font-bold tabular-nums w-10 text-right ${scoreColor(value)}`}>
        {fmt(value)}
      </span>
    </div>
  )
}

// ─── Sub-score row ────────────────────────────────────────────────────────────

function SubRow({ label, value, weight }: { label: string; value: number; weight: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-gray-500 w-9 shrink-0">{weight}</span>
      <span className="text-xs text-gray-700 flex-1">{label}</span>
      <div className="w-20 h-1 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor(value)}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums w-8 text-right ${scoreColor(value)}`}>
        {fmt(value)}
      </span>
    </div>
  )
}

// ─── Raw data row ─────────────────────────────────────────────────────────────

function RawRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs font-mono text-gray-600">{value}</span>
    </div>
  )
}

// ─── Formula block ────────────────────────────────────────────────────────────

function FormulaLine({ label, formula }: { label?: string; formula: string }) {
  return (
    <div className="py-0.5">
      {label && <p className="text-[10px] font-semibold text-gray-400 mt-1.5 mb-0.5">{label}</p>}
      <code className="block text-[10px] font-mono text-indigo-700 bg-indigo-50 rounded px-2 py-1 leading-relaxed whitespace-pre-wrap break-all">
        {formula}
      </code>
    </div>
  )
}

function FormulaSection({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-[10px] font-medium text-indigo-500 hover:text-indigo-700 flex items-center gap-1"
      >
        {open ? '▲' : '▼'} Sýna formúlur
      </button>
      {open && (
        <div className="mt-1 space-y-0.5">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Index card ───────────────────────────────────────────────────────────────

function IndexCard({
  name,
  fullName,
  value,
  children,
}: {
  name: string
  fullName: string
  value: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <button
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="shrink-0">
          <span className="text-sm font-bold text-gray-800">{name}</span>
          <p className="text-[10px] text-gray-400 leading-none mt-0.5">{fullName}</p>
        </div>
        <ScoreBar value={value} />
        <span className="text-gray-400 text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Individual index breakdowns ───────────────────────────────────────────────

function GIQIBreakdown({ b }: { b: IndexBreakdown }) {
  return (
    <>
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide pt-3 pb-1">Hlutfallstölur</p>
      <SubRow label="DQIdef" value={b.DQIdef} weight="25%" />
      <SubRow label="DQIoff" value={b.DQIoff} weight="25%" />
      <SubRow label="ELI — Energy Level Index" value={b.ELI} weight="25%" />
      <SubRow label="FI — Focus Index" value={b.FI} weight="25%" />
      <FormulaSection>
        <FormulaLine formula="GIQI = 0.25×DQIdef + 0.25×DQIoff + 0.25×ELI + 0.25×FI" />
      </FormulaSection>
    </>
  )
}

function DQIdefBreakdown({ b, r }: { b: IndexBreakdown; r: IndexRaw }) {
  return (
    <>
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide pt-3 pb-1">Hlutfallstölur</p>
      <SubRow label="1vs1 Control Score" value={b.def_1v1Control} weight="50%" />
      <SubRow label="Defensive Disruption Score" value={b.def_disruption} weight="30%" />
      <SubRow label="Defensive Discipline Score" value={b.def_discipline} weight="10%" />
      <SubRow label="Foul Quality Score" value={b.def_foulQuality} weight="10%" />
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide pt-3 pb-1">Grunntölur</p>
      <RawRow label="1vs1% (unnið/tapað)" value={`${fmt(r.duelPct)}% (${r.duelWon}/${r.duelWon + r.duelLost})`} />
      <RawRow label="Fríkast" value={r.frikanst} />
      <RawRow label="Stolinn" value={r.stolinn} />
      <RawRow label="Hár kontakt 9m+" value={r.harKontakt} />
      <RawRow label="Skotnýting Andstæðinga" value={pct(r.oppShotEff)} />
      <RawRow label="Fjöldi skota andstæðinga" value={r.oppTotalShots} />
      <RawRow label="Skot á mark" value={r.oppOnGoalShots} />
      <RawRow label="Framhjá/Stöng" value={r.oppMissed} />
      <RawRow label="Víti á sig" value={r.vitiASig} />
      <RawRow label="2mínútur" value={r.twoMin} />
      <RawRow label="Rautt" value={r.rautt} />
      <FormulaSection>
        <FormulaLine formula="DQIdef = 0.5×1v1Control + 0.3×Disruption + 0.1×Discipline + 0.1×FoulQuality" />
        <FormulaLine
          label="A. 1vs1 Control Score"
          formula="= 0.4×duelPct + 0.3×fríkast + 0.3×(100 − oppShotEff)"
        />
        <FormulaLine
          label="B. Defensive Disruption Score"
          formula={`ratio = (harKontakt + fríkast + stolinn) / oppTotalShots × 100
inner = 0.75×min(1, ratio/45) + 0.25×min(1, (100−oppShotEff)/70)
= min(100, 100 × max(0, inner)^1.5)`}
        />
        <FormulaLine
          label="C. Defensive Discipline Score"
          formula="= 100 − (vitiASig×1.5 + twoMin + rautt×2) / oppTotalShots × 100"
        />
        <FormulaLine
          label="D. Foul Quality Score"
          formula="= fríkast / (twoMin×1.5 + rautt×2 + fríkast) × 100"
        />
      </FormulaSection>
    </>
  )
}

function DQIoffBreakdown({ b, r }: { b: IndexBreakdown; r: IndexRaw }) {
  return (
    <>
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide pt-3 pb-1">Hlutfallstölur</p>
      <SubRow label="Chance Creation Score" value={b.off_chanceCreation} weight="40%" />
      <SubRow label="Shot Efficiency Score" value={b.off_shotEfficiency} weight="35%" />
      <SubRow label="Ball Control" value={b.off_ballControl} weight="25%" />
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide pt-3 pb-1">Grunntölur</p>
      <RawRow label="Mörk okkar" value={r.ourGoals} />
      <RawRow label="Skot okkar (alls)" value={r.ourTotalShots} />
      <RawRow label="Skotnýting okkar" value={pct(r.ourShotEff)} />
      <RawRow label="Sköpuð færi" value={r.ourAssists} />
      <RawRow label="Fiskað víti" value={r.fiskaViti} />
      <RawRow label="Fjöldi sókna" value={r.ourAttacks} />
      <RawRow label="Tapaður bolti" value={r.ourTurnovers} />
      <FormulaSection>
        <FormulaLine formula="DQIoff = 0.4×ChanceCreation + 0.35×ShotEff + 0.25×BallControl" />
        <FormulaLine
          label="A. Chance Creation Score"
          formula="= (ourAssists + fiskaViti) / ourAttacks × 100 − ourTurnovers / ourAttacks × 100"
        />
        <FormulaLine
          label="B. Shot Efficiency Score"
          formula="= ourGoals / ourTotalShots × 100"
        />
        <FormulaLine
          label="C. Ball Control"
          formula="= (ourAttacks − ourTurnovers) / ourAttacks × 100"
        />
      </FormulaSection>
    </>
  )
}

function ELIBreakdown({ b, r }: { b: IndexBreakdown; r: IndexRaw }) {
  return (
    <>
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide pt-3 pb-1">Hlutfallstölur</p>
      <SubRow label="DAS — Defensive Activity Score" value={b.eli_das} weight="35%" />
      <SubRow label="TIS — Transition Intensity Score" value={b.eli_tis} weight="65%" />
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide pt-3 pb-1">Grunntölur</p>
      <RawRow label="Stolinn" value={r.stolinn} />
      <RawRow label="Blokk" value={r.blokk} />
      <RawRow label="Hár Kontakt 9m+" value={r.harKontakt} />
      <RawRow label="Fríkast" value={r.frikanst} />
      <RawRow label="Tapaðir boltar andstæðinga" value={r.tapAnd} />
      <RawRow label="Fjöldi sókna andstæðinga" value={r.oppAttacks} />
      <RawRow label="Hraðaupphlaup — mörk/skot" value={`${r.ourFBGoals}/${r.ourFBShots}`} />
      <RawRow label="Seinni bylgja — mörk/skot" value={`${r.ourSWGoals}/${r.ourSWShots}`} />
      <RawRow label="Skot andstæðinga úr hraðaupphlaupum" value={r.oppFBShots} />
      <RawRow label="Skot andstæðinga úr seinni bylgju" value={r.oppSWShots} />
      <FormulaSection>
        <FormulaLine formula="ELI = 0.35×DAS + 0.65×TIS" />
        <FormulaLine
          label="A. Defensive Activity Score (DAS)"
          formula={`dasRaw = (stolinn + blokk + harKontakt + fríkast + oppLostBall) / oppAttacks × 100
DAS = 100 × (1 − exp(−0.03 × dasRaw))`}
        />
        <FormulaLine
          label="B. Transition Intensity Score (TIS)"
          formula={`OTE = (ourFBGoals + ourSWGoals) / (ourFBShots + ourSWShots) × 100
OTV = (ourFBShots + ourSWShots) / ourTotalShots × 100
DTC = 100 × (1 − (oppFBShots + oppSWShots) / oppTotalShots)
TIS = 0.35×OTE + 0.30×OTV + 0.35×DTC`}
        />
      </FormulaSection>
    </>
  )
}

function FIBreakdown({ b, r }: { b: IndexBreakdown; r: IndexRaw }) {
  return (
    <>
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide pt-3 pb-1">Hlutfallstölur</p>
      <SubRow label="OCSS — Offensive Control & Stability Score" value={b.fi_ocss} weight="35%" />
      <SubRow label="DCSS — Defensive Control & Stability Score" value={b.fi_dcss} weight="35%" />
      <SubRow label="ESS — Execution Stability Score" value={b.fi_ess} weight="30%" />
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide pt-3 pb-1">Grunntölur</p>
      <RawRow label="Tapaður bolti" value={r.ourTurnovers} />
      <RawRow label="Fjöldi sókna" value={r.ourAttacks} />
      <RawRow label="Skotnýting okkar" value={pct(r.ourShotEff)} />
      <RawRow label="Árás 1á1%" value={pct(r.duelPct)} />
      <RawRow label="Fjöldi sókna andstæðinga" value={r.oppAttacks} />
      <RawRow label="Skoruð mörk andstæðinga" value={r.oppGoals} />
      <RawRow label="2mínútur" value={r.twoMin} />
      <RawRow label="Víti á sig" value={r.vitiASig} />
      <FormulaSection>
        <FormulaLine formula="FI = 0.35×OCSS + 0.35×DCSS + 0.30×ESS" />
        <FormulaLine
          label="A. Offensive Control & Stability Score (OCSS)"
          formula="= (100 × (1 − ourTurnovers/ourAttacks) + ourShotEff) / 2"
        />
        <FormulaLine
          label="B. Defensive Control & Stability Score (DCSS)"
          formula={`oppDefEff = (oppAttacks − oppGoals) / oppAttacks × 100
= 0.7 × (0.3×duelPct + 0.4×oppDefEff + 0.15×fríkast + 0.15×stolinn)
+ 0.3 × (100 − 0.5×twoMin − 0.5×vitiASig)`}
        />
        <FormulaLine
          label="C. Execution Stability Score (ESS)"
          formula="= 0.6×ourShotEff + 0.4×BallControl"
        />
      </FormulaSection>
    </>
  )
}

function GKIBreakdown({ b, r, minuteFiltered }: { b: IndexBreakdown; r: IndexRaw; minuteFiltered: boolean }) {
  return (
    <>
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide pt-3 pb-1">Hlutfallstölur</p>
      <SubRow label="Save Efficiency" value={b.gki_saveEff} weight="70%" />
      {!minuteFiltered && (
        <>
          <SubRow label="Save Stability" value={b.gki_saveStability} weight="30%" />
          <div className="pl-4 border-l-2 border-gray-200 ml-2 mt-1 space-y-0.5">
            <SubRow label="Save Variability" value={b.gki_saveVariability} weight="90%" />
            <SubRow label="Empty Phase Rate" value={b.gki_emptyPhaseRate} weight="10%" />
          </div>
        </>
      )}
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide pt-3 pb-1">Grunntölur</p>
      <RawRow label="Markvarsla %" value={pct(r.gkSavePct)} />
      <RawRow label="Skot á mark" value={r.oppOnGoalShots} />
      <RawRow label="Mörk gegn" value={r.oppGoals} />
      <RawRow label="Fjöldi Empty Phase (3 mörk andstæðinga í röð)" value={r.emptyPhases} />
      <RawRow label="Fjöldi skota andstæðinga" value={r.oppTotalShots} />
      {!minuteFiltered && (
        <>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide pt-2 pb-1">
            Markvarsla% á 10 mín. bilum
          </p>
          {r.gkSavePctBySegment.map((seg, i) => (
            <RawRow key={i} label={`Markvarsla% ${i * 10}–${(i + 1) * 10}mín`} value={pct(seg)} />
          ))}
        </>
      )}
      <FormulaSection>
        <FormulaLine formula="GKI = 0.7×SaveEff + 0.3×SaveStability" />
        <FormulaLine
          label="A. Save Efficiency"
          formula="= (saves + parries) / (saves + parries + goals_conceded) × 100"
        />
        <FormulaLine
          label="B. Save Stability"
          formula="= 0.9×SaveVariability + 0.1×EmptyPhaseRate"
        />
        <FormulaLine
          label="  Save Variability"
          formula="= 100 × exp(−stdev(savePct per 10min segment) / 15)"
        />
        <FormulaLine
          label="  Empty Phase Rate"
          formula="= 100 − emptyPhases / (oppTotalShots − 2) × 100"
        />
      </FormulaSection>
    </>
  )
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function IndexPanel({ breakdown, minuteFiltered = false }: { breakdown: IndexBreakdown; minuteFiltered?: boolean }) {
  const { GIQI, DQIdef, DQIoff, ELI, FI, GKI, raw } = breakdown

  return (
    <div className="space-y-2 p-3">
      <IndexCard name="GIQI" fullName="Game IQ Index" value={GIQI}>
        <GIQIBreakdown b={breakdown} />
      </IndexCard>

      <IndexCard name="DQIdef" fullName="Decision Quality Index" value={DQIdef}>
        <DQIdefBreakdown b={breakdown} r={raw} />
      </IndexCard>

      <IndexCard name="DQIoff" fullName="Decision Quality Index – Offense" value={DQIoff}>
        <DQIoffBreakdown b={breakdown} r={raw} />
      </IndexCard>

      <IndexCard name="ELI" fullName="Energy Level Index" value={ELI}>
        <ELIBreakdown b={breakdown} r={raw} />
      </IndexCard>

      <IndexCard name="FI" fullName="Focus Index" value={FI}>
        <FIBreakdown b={breakdown} r={raw} />
      </IndexCard>

      <IndexCard name="GKI" fullName="GK Index" value={GKI}>
        <GKIBreakdown b={breakdown} r={raw} minuteFiltered={minuteFiltered} />
      </IndexCard>
    </div>
  )
}
