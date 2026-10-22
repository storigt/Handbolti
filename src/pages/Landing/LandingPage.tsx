import { useEffect, useRef, useState } from 'react'
import { useLang, useT, PRODUCT_NAME, type Lang } from '@/lib/i18n/lang'
import { LogoMark, Wordmark } from '@/components/brand/Logo'
import { nav, hero, pillars, trust, inside, faq, cta, footer } from './copy'
import { HOME, AWAY, ourGoals, theirGoals, SEASON_WITH_THIS, pct } from './sample'
import {
  HeroReportFrame, HeroDefenceFrame, HeroKeeperFrame, HeroViewFrame,
  ReportTable, DefenceTable, KeeperSheet, SeasonChart, ExportBox, ChartBuilder, FlowSpark, Standouts,
} from './fragments'
import { TrustDemo, LoggerFragment } from './interactive'
import './landing.css'

interface Props {
  onSignIn: () => void
  onRequestAccess: (email?: string) => void
}

export function LandingPage({ onSignIn, onRequestAccess }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const t = useT()

  // Reveal-on-scroll, once. Content stays visible if the observer never runs:
  // the hidden state only applies under .lp--js, set here.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    root.classList.add('lp--js')
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target) }
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.1 })
    root.querySelectorAll('[data-reveal]').forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <div className="lp" ref={rootRef}>
      <a href="#main" className="lp-skip">{t({ en: 'Skip to content', is: 'Fara í efni' })}</a>
      <Hero onSignIn={onSignIn} onRequestAccess={() => onRequestAccess()} />
      <main id="main" tabIndex={-1}>
        <Pillars />
        <Trust />
        <Inside />
        <Questions />
        <Closing onRequestAccess={onRequestAccess} />
      </main>
      <Footer onSignIn={onSignIn} onRequestAccess={() => onRequestAccess()} />
    </div>
  )
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function LangSwitch({ className = '' }: { className?: string }) {
  const lang = useLang(s => s.lang)
  const setLang = useLang(s => s.setLang)
  const t = useT()
  const opts: { v: Lang; label: string; long: string }[] = [
    { v: 'en', label: 'EN', long: 'English' },
    { v: 'is', label: 'IS', long: 'Íslenska' },
  ]
  return (
    <div className={`lp-lang ${className}`} role="group" aria-label={t(nav.langLabel)}>
      {opts.map(o => (
        <button key={o.v} type="button" lang={o.v} aria-pressed={lang === o.v} title={o.long}
          className={lang === o.v ? 'is-on' : ''} onClick={() => setLang(o.v)}>{o.label}</button>
      ))}
    </div>
  )
}

function Nav({ onSignIn, onRequestAccess }: { onSignIn: () => void; onRequestAccess: () => void }) {
  const t = useT()
  return (
    <nav className="lp-nav" aria-label="Main">
      <a href="#top" className="lp-nav__brand"><Wordmark size={22} /></a>
      <div className="lp-nav__links">
        <a href="#stats" className="lp-link lp-nav__anchor">{t(nav.stats)}</a>
        <a href="#trust" className="lp-link lp-nav__anchor">{t(nav.trust)}</a>
        <a href="#inside" className="lp-link lp-nav__anchor">{t(nav.inside)}</a>
        <a href="#questions" className="lp-link lp-nav__anchor">{t(nav.questions)}</a>
        <a href="#signin" className="lp-link" onClick={e => { e.preventDefault(); onSignIn() }}>{t(nav.signIn)}</a>
        <LangSwitch className="lp-nav__lang" />
        <a href="#request-access" className="lp-button lp-button--small lp-only-wide" onClick={e => { e.preventDefault(); onRequestAccess() }}>{t(nav.action)}</a>
      </div>
    </nav>
  )
}

// ─── Hero: a sentence split by a frame; the frame is a reel that advances ─────

const FRAMES = [HeroReportFrame, HeroDefenceFrame, HeroKeeperFrame, HeroViewFrame]

function Hero({ onSignIn, onRequestAccess }: { onSignIn: () => void; onRequestAccess: () => void }) {
  const t = useT()
  const wrapRef = useRef<HTMLElement>(null)
  const [step, setStep] = useState(0)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    let raf = 0
    const update = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const run = el.offsetHeight - window.innerHeight
      const progress = run > 0 ? Math.min(1, Math.max(0, -r.top / run)) : 0
      setStep(Math.min(FRAMES.length - 1, Math.floor(progress * FRAMES.length * 0.999)))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf) }
  }, [])

  const captions = hero.frames.map(f => t(f))

  return (
    <header className="lp-hero" id="top" ref={wrapRef} style={{ ['--steps' as string]: FRAMES.length }}>
      <div className="lp-hero__stage">
        <Nav onSignIn={onSignIn} onRequestAccess={onRequestAccess} />
        <h1 className="lp-hero__title">
          <span className="lp-hero__a">{t(hero.halfA)}</span>{' '}
          <span className="lp-hero__b">{t(hero.halfB)}</span>
        </h1>
        <div className="lp-reel" aria-roledescription="carousel">
          <div className="lp-reel__strip" style={{ ['--step' as string]: step }}>
            {FRAMES.map((F, i) => (
              <div key={i} className={`lp-reel__frame${i === step ? ' is-current' : ''}`} aria-hidden={i !== step}>
                <F />
              </div>
            ))}
          </div>
        </div>
        <p className="lp-hero__caption" aria-live="polite">
          <span>{captions[step]}</span>
          <span className="lp-muted num"> {step + 1} {t(hero.count)} {FRAMES.length}</span>
        </p>
        <div className="lp-hero__foot">
          <p className="lp-hero__support">{t(hero.support)}</p>
          <div className="lp-hero__actions">
            <button type="button" className="lp-button lp-hero__cta" onClick={onRequestAccess}>{t(nav.action)}</button>
            <LangSwitch className="lp-hero__lang" />
          </div>
        </div>
      </div>
    </header>
  )
}

// ─── Pillars: three sides of the game, side by side ──────────────────────────

const PILLAR_FRAGMENTS = [
  () => <div className="ui-card" data-ui><ReportTable rows={4} /></div>,
  () => <div className="ui-card" data-ui><DefenceTable rows={4} /></div>,
  () => <div className="ui-card ui-pad" data-ui><KeeperSheet id="haukur" /></div>,
]

function Pillars() {
  const t = useT()
  return (
    <section className="lp-section lp-pillars" id="stats" aria-labelledby="pillars-h">
      <div className="lp-pillars__head" data-reveal>
        <h2 id="pillars-h" className="lp-h2">{t(pillars.heading)}</h2>
        <p>{t(pillars.sentence)}</p>
      </div>
      <div className="lp-pillars__grid">
        {pillars.items.map((p, i) => {
          const F = PILLAR_FRAGMENTS[i]
          return (
            <article key={i} className="lp-pillar" data-reveal style={{ ['--d' as string]: i }}>
              <h3 className="lp-pillar__name">{t(p.name)}</h3>
              <p className="lp-pillar__line">{t(p.line)}</p>
              <ul className="lp-pillar__chips" aria-label={t(pillars.logLabel)}>
                {p.chips.map((c, j) => <li key={j}>{t(c)}</li>)}
              </ul>
              <div className="lp-pillar__frag"><F /></div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

// ─── Trust: the event log and the numbers counted from it ───────────────────

function Trust() {
  const t = useT()
  return (
    <section className="lp-trust-section" id="trust" aria-labelledby="trust-h">
      <div className="lp-trust-section__head" data-reveal>
        <h2 id="trust-h" className="lp-h2">{t(trust.heading)}</h2>
        <div className="lp-trust-section__lede">
          <p>{t(trust.sentence)}</p>
          <p className="lp-trust-section__try">{t(trust.instruction)}</p>
        </div>
      </div>
      <div data-reveal style={{ ['--d' as string]: 1 }}><TrustDemo /></div>
      <ul className="lp-promises">
        {trust.promises.map((p, i) => (
          <li key={i} data-reveal style={{ ['--d' as string]: i }}>
            <h3>{t(p.title)}</h3>
            <p>{t(p.body)}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ─── Inside: a tour of the app, one working piece per stop ──────────────────

function LoggerLoop() {
  const [reduce] = useState(() => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  const [stage, setStage] = useState(reduce ? 3 : 0)
  useEffect(() => {
    if (reduce) return
    const id = setInterval(() => setStage(s => (s + 1) % 4), 1500)
    return () => clearInterval(id)
  }, [reduce])
  return <LoggerFragment stage={stage} />
}

function LiveStatsFragment() {
  const t = useT()
  return (
    <div className="ui-card" data-ui>
      <div className="ui-tabs">
        <span>{t({ en: 'Attack', is: 'Sókn' })}</span><span>{t({ en: 'Defence', is: 'Vörn' })}</span>
        <span>{t({ en: 'Goalkeeper', is: 'Markvörður' })}</span><span className="is-on">{t({ en: 'Flow', is: 'Gangur' })}</span>
      </div>
      <div className="ui-row ui-row--head">
        <span className="ui-strong num">{HOME} {ourGoals}–{theirGoals} {AWAY}</span>
        <span className="ui-muted num">{t({ en: 'Minutes', is: 'Mínútur' })} 0–60</span>
      </div>
      <div className="ui-pad"><FlowSpark /></div>
    </div>
  )
}

function ReportFragment() {
  const t = useT()
  return (
    <div className="ui-card" data-ui>
      <div className="ui-row ui-row--head">
        <span className="ui-strong">{t({ en: 'Match report', is: 'Leikskýrsla' })}</span>
        <span className="ui-btn ui-btn--secondary">{t({ en: 'Copy summary', is: 'Afrita samantekt' })}</span>
      </div>
      <Standouts />
      <ReportTable rows={3} />
    </div>
  )
}

const seasonGoals = SEASON_WITH_THIS.reduce((n, m) => n + m.goals, 0)
const seasonShots = SEASON_WITH_THIS.reduce((n, m) => n + m.shots, 0)

function SeasonFragment() {
  const t = useT()
  return (
    <div className="ui-card" data-ui>
      <div className="ui-row ui-row--head">
        <span className="ui-strong">{t({ en: 'Season', is: 'Tímabil' })} 2026/27</span>
        <span className="ui-muted">{t({ en: 'Shooting % per match', is: 'Skotnýting í hverjum leik' })}</span>
      </div>
      <div className="ui-pad"><SeasonChart width={460} height={180} /></div>
      <dl className="ui-kv ui-kv--inline">
        <div><dt>{t({ en: 'Matches', is: 'Leikir' })}</dt><dd className="num">{SEASON_WITH_THIS.length}</dd></div>
        <div><dt>{t({ en: 'Goals', is: 'Mörk' })}</dt><dd className="num">{seasonGoals}</dd></div>
        <div><dt>{t({ en: 'Shooting %', is: 'Skotnýting' })}</dt><dd className="num">{pct(seasonGoals, seasonShots)}%</dd></div>
      </dl>
    </div>
  )
}

const STOPS = [
  () => <LoggerLoop />,
  LiveStatsFragment,
  ReportFragment,
  SeasonFragment,
  () => <div className="ui-card" data-ui><ChartBuilder /></div>,
  ExportBox,
]

function Inside() {
  const t = useT()
  const [sel, setSel] = useState(0)
  const stop = inside.tabs[sel]
  const F = STOPS[sel]
  return (
    <section className="lp-section lp-inside" id="inside" aria-labelledby="inside-h">
      <div className="lp-inside__head" data-reveal>
        <h2 id="inside-h" className="lp-h2">{t(inside.heading)}</h2>
        <p>{t(inside.sentence)}</p>
      </div>
      <div className="lp-inside__body">
        <div className="lp-inside__tabs" role="tablist" aria-label={t(inside.heading)}>
          {inside.tabs.map((s, i) => (
            <button key={i} type="button" role="tab" id={`inside-tab-${i}`} aria-selected={i === sel} aria-controls="inside-panel"
              className={i === sel ? 'is-on' : ''} onClick={() => setSel(i)}>
              {t(s.name)}
            </button>
          ))}
        </div>
        <div className="lp-inside__stage" role="tabpanel" id="inside-panel" aria-labelledby={`inside-tab-${sel}`}>
          <div className="lp-inside__words" key={`w${sel}`}>
            <h3>{t(stop.title)}</h3>
            <p>{t(stop.body)}</p>
          </div>
          <div className="lp-inside__frag" key={`f${sel}`}><F /></div>
        </div>
      </div>
    </section>
  )
}

// ─── Questions: index on the left, the answer large on the right ─────────────

function Questions() {
  const t = useT()
  const [sel, setSel] = useState(0)
  return (
    <section className="lp-section lp-faq" id="questions" aria-labelledby="faq-h">
      <div className="lp-faq__list">
        <h2 id="faq-h" className="lp-faq__heading">{t(faq.heading)}</h2>
        <ul>
          {faq.items.map((it, i) => (
            <li key={i} className={i === sel ? 'is-on' : ''}>
              <button type="button" aria-expanded={i === sel} aria-controls={`faq-a-${i}`}
                onClick={() => setSel(i)} onMouseEnter={() => setSel(i)} onFocus={() => setSel(i)}>
                <span className="lp-faq__dot" aria-hidden="true" />{t(it.q)}
              </button>
              <p className="lp-faq__inline" id={`faq-a-${i}`} hidden={i !== sel}>{t(it.a)}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="lp-faq__pane" aria-hidden="true">
        <p key={sel} className="lp-faq__answer">{t(faq.items[sel].a)}</p>
      </div>
    </section>
  )
}

// ─── Closing: the product's first screen, already open ───────────────────────

function Closing({ onRequestAccess }: { onRequestAccess: (email?: string) => void }) {
  const t = useT()
  const lang = useLang(s => s.lang)
  const setLang = useLang(s => s.setLang)
  const [email, setEmail] = useState('')
  return (
    <section className="lp-cta" aria-labelledby="cta-h">
      <div className="lp-cta__words" data-reveal>
        <h2 id="cta-h" className="lp-cta__closing">{t(cta.closing)}</h2>
        <p>{t(cta.sentence)}</p>
      </div>
      <form className="ui-dialog" data-ui data-reveal style={{ ['--d' as string]: 1 }}
        onSubmit={e => { e.preventDefault(); onRequestAccess(email.trim() || undefined) }}>
        <div className="ui-dialog__head">
          <LogoMark size={20} />
          <span className="ui-dialog__title">{t(cta.dialogTitle)}</span>
        </div>
        <label className="ui-label" htmlFor="cta-email">{t(cta.email)}</label>
        <input id="cta-email" name="email" type="email" className="ui-input" autoComplete="email" spellCheck={false}
          placeholder={t(cta.emailPlaceholder)} value={email} onChange={e => setEmail(e.target.value)} />
        <span className="ui-label">{t(cta.language)}</span>
        <div className="ui-seg ui-seg--full" role="group" aria-label={t(cta.language)}>
          <button type="button" className={lang === 'en' ? 'is-on' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
          <button type="button" className={lang === 'is' ? 'is-on' : ''} aria-pressed={lang === 'is'} onClick={() => setLang('is')}>Íslenska</button>
        </div>
        <button type="submit" className="ui-btn ui-btn--primary ui-btn--block">{t(cta.button)}</button>
        <p className="ui-note">{t(cta.after)}</p>
      </form>
    </section>
  )
}

// ─── Footer: a board of tiles ─────────────────────────────────────────────────

function Footer({ onSignIn, onRequestAccess }: { onSignIn: () => void; onRequestAccess: () => void }) {
  const t = useT()
  const lang = useLang(s => s.lang)
  const name = PRODUCT_NAME[lang]
  return (
    <footer className="lp-footer">
      <div className="lp-tile lp-tile--statement">
        <p className="lp-tile__statement">{t(footer.statement)}</p>
        <p className="lp-tile__legal">© 2026 <span translate="no">{name}</span>. {t(footer.legal)}</p>
      </div>
      <div className="lp-tile lp-tile--nav">
        <h2 className="lp-tile__label">{t(footer.pages)}</h2>
        <ul>
          <li><a className="lp-link" href="#stats">{t(nav.stats)}</a></li>
          <li><a className="lp-link" href="#trust">{t(nav.trust)}</a></li>
          <li><a className="lp-link" href="#inside">{t(nav.inside)}</a></li>
          <li><a className="lp-link" href="#questions">{t(nav.questions)}</a></li>
        </ul>
      </div>
      <div className="lp-tile lp-tile--lang">
        <h2 className="lp-tile__label">{t(nav.langLabel)}</h2>
        <LangSwitch className="lp-lang--large" />
      </div>
      <div className="lp-tile lp-tile--signin">
        <h2 className="lp-tile__label">{t(footer.approved)}</h2>
        <a href="#signin" className="lp-tile__big lp-link" onClick={e => { e.preventDefault(); onSignIn() }}>{t(nav.signIn)}</a>
      </div>
      <div className="lp-tile lp-tile--wordmark" aria-hidden="true">
        <span className="lp-tile__wordmark" translate="no" style={{ ['--chars' as string]: name.length }}>{name}</span>
      </div>
      <button type="button" className="lp-tile lp-tile--invite" onClick={onRequestAccess}>
        <span className="lp-tile__invite">{t(footer.invite)}</span>
        <svg className="lp-tile__arrow" viewBox="0 0 48 48" aria-hidden="true">
          <path d="M8 40 L40 8 M16 8 H40 V32" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="square" />
        </svg>
      </button>
    </footer>
  )
}
