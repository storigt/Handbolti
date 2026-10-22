import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/lang'
import { Wordmark } from '@/components/brand/Logo'
import { LangToggle } from '@/components/ui'
import { AuthStage, AuthTicker } from './AuthStage'

export type AuthMode = 'signin' | 'signup' | 'magic'

const T = {
  title: {
    signin: { en: 'Sign in', is: 'Innskráning' },
    signup: { en: 'Request access', is: 'Sækja um aðgang' },
    magic: { en: 'Sign in with an email link', is: 'Innskráning með tölvupósti' },
  },
  intro: {
    signin: { en: 'Welcome back. Use your email and password.', is: 'Velkomin aftur. Notaðu netfang og lykilorð.' },
    signup: { en: 'Create your account. It is reviewed by hand, then you add your team.', is: 'Búðu til aðgang. Hann er yfirfarinn, svo bætirðu liðinu við.' },
    magic: { en: 'We email you a link. No password needed.', is: 'Við sendum þér hlekk í tölvupósti. Ekkert lykilorð.' },
  },
  tabs: {
    signin: { en: 'Sign in', is: 'Innskráning' },
    signup: { en: 'New account', is: 'Nýr aðgangur' },
    magic: { en: 'Email link', is: 'Hlekkur' },
  },
  email: { en: 'Email', is: 'Netfang' },
  emailPh: { en: 'you@yourclub.com', is: 'thu@felagid.is' },
  password: { en: 'Password', is: 'Lykilorð' },
  passwordPh: { en: 'At least 6 characters', is: 'Að minnsta kosti 6 stafir' },
  submit: {
    signin: { en: 'Sign in', is: 'Skrá inn' },
    signup: { en: 'Create account', is: 'Búa til aðgang' },
    magic: { en: 'Send link', is: 'Senda hlekk' },
  },
  working: { en: 'One moment…', is: 'Augnablik…' },
  back: { en: 'Back to the front page', is: 'Aftur á forsíðu' },
  sentTitle: { en: 'Check your email', is: 'Athugaðu tölvupóstinn' },
  sentSignup: { en: 'We sent a confirmation email. Open the link in it to finish creating your account.', is: 'Við sendum þér staðfestingarpóst. Opnaðu hlekkinn til að klára skráninguna.' },
  sentMagic: { en: 'We sent a sign-in link. Open it on this device to sign in.', is: 'Við sendum þér innskráningarhlekk. Opnaðu hann á þessu tæki.' },
  sentTo: { en: 'Sent to', is: 'Sent á' },
  again: { en: 'Back to sign in', is: 'Aftur í innskráningu' },
  error: { en: 'Something went wrong. Try again.', is: 'Eitthvað fór úrskeiðis. Reyndu aftur.' },
  lang: { en: 'Language', is: 'Tungumál' },
  forgot: { en: 'Forgot it? Get an email link', is: 'Gleymt? Fáðu hlekk' },
  show: { en: 'Show', is: 'Sýna' },
  hide: { en: 'Hide', is: 'Fela' },
  steps: [
    { en: 'Create your account and confirm your email', is: 'Búðu til aðgang og staðfestu netfangið' },
    { en: 'We review and approve your account', is: 'Við förum yfir aðganginn og samþykkjum hann' },
    { en: 'Add your team and log your first match', is: 'Bættu liðinu við og skráðu fyrsta leikinn' },
  ],
  stage: {
    signin: {
      headline: { en: 'Your numbers are waiting', is: 'Tölurnar þínar bíða' },
      sub: { en: 'Attack, defence and goalkeeping, every event you logged, ready to filter and turn any way you like.', is: 'Sókn, vörn og markvarsla, hver skráning á sínum stað, tilbúin til að sía og skoða eins og þú vilt.' },
    },
    signup: {
      headline: { en: 'Stat as much as you want', is: 'Skráðu eins mikið og þú vilt' },
      sub: { en: 'Log the whole game or just the parts you care about. Every number comes from an event you can see.', is: 'Skráðu allan leikinn eða bara það sem skiptir þig máli. Hver tala kemur úr skráningu sem þú sérð.' },
    },
    magic: {
      headline: { en: 'One link, no password', is: 'Einn hlekkur, ekkert lykilorð' },
      sub: { en: 'We email you a link. Open it on this device and you are in.', is: 'Við sendum þér hlekk. Opnaðu hann á þessu tæki og þá ertu inni.' },
    },
  },
}

export function LoginPage({ initialMode = 'signin', initialEmail = '', onBack }: {
  initialMode?: AuthMode
  initialEmail?: string
  onBack?: () => void
}) {
  const t = useT()
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const wide = useWide()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({ email })
        if (error) throw error
        setSent(true)
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setSent(true) // Supabase sends a confirmation email
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        // The auth state listener in App takes it from here
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t(T.error))
    } finally {
      setLoading(false)
    }
  }

  const fieldClass = 'w-full h-12 px-3.5 rounded-md bg-white border border-[#cdd2d9] text-[16px] text-ink placeholder:text-[#6b7079] focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent'
  const stage = T.stage[mode]

  return (
    <div className="min-h-svh bg-ground text-ink grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div className="flex flex-col min-h-svh lg:col-start-2 lg:row-start-1">
        <header className="flex items-center justify-between gap-4 px-4 sm:px-8 py-5">
          {onBack ? (
            <button type="button" onClick={onBack} className="font-bold uppercase tracking-tight text-[17px]" aria-label={t(T.back)}>
              <Wordmark size={22} />
            </button>
          ) : (
            <span className="font-bold uppercase tracking-tight text-[17px]"><Wordmark size={22} /></span>
          )}
          <LangToggle />
        </header>

        <main className="flex-1 flex flex-col justify-center px-4 sm:px-8 pb-12">
          <div className="w-full max-w-[420px] mx-auto">
            {/* Phone and tablet: the stage's headline, without the live panel */}
            {!wide && <div className="flex flex-col gap-4 mb-8">
              <h1 className="text-[36px] font-bold uppercase tracking-[-0.03em] leading-[1.02] [text-wrap:balance]">{t(stage.headline)}</h1>
              <AuthTicker />
            </div>}

            {sent ? (
              <div className="flex flex-col gap-4">
                <div className="w-12 h-12 rounded-full bg-accent text-white grid place-items-center" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24"><path d="M3 6h18v12H3z M3 7l9 6 9-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
                </div>
                <h2 className="text-[28px] font-semibold leading-tight">{t(T.sentTitle)}</h2>
                <p className="text-[16px] leading-relaxed">{mode === 'signup' ? t(T.sentSignup) : t(T.sentMagic)}</p>
                <p className="text-[14px] text-muted">{t(T.sentTo)} <span className="text-ink font-medium">{email}</span></p>
                {mode === 'signup' && (
                  <ol className="mt-2 flex flex-col gap-2 text-[15px]">
                    {T.steps.map((st, i) => (
                      <li key={i} className="flex items-baseline gap-3">
                        <span className={`num w-6 h-6 shrink-0 rounded-full grid place-items-center text-[13px] ${i === 0 ? 'bg-ink text-white' : 'bg-surface text-muted'}`}>{i + 1}</span>
                        <span className={i === 0 ? '' : 'text-muted'}>{t(st)}</span>
                      </li>
                    ))}
                  </ol>
                )}
                <button type="button" onClick={() => { setSent(false); setMode('signin') }}
                  className="self-start mt-2 text-[15px] underline underline-offset-4 decoration-transparent hover:decoration-current transition-colors">
                  {t(T.again)}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <h2 className="text-[28px] font-semibold leading-tight">{t(T.title[mode])}</h2>
                  <p className="text-[16px] text-muted leading-snug">{t(T.intro[mode])}</p>
                </div>

                <div className="flex p-0.5 gap-0.5 rounded-md bg-[#e5e8ec]" role="group" aria-label={t(T.title[mode])}>
                  {(['signin', 'signup', 'magic'] as AuthMode[]).map(m => (
                    <button key={m} type="button" aria-pressed={mode === m}
                      onClick={() => { setMode(m); setError(null) }}
                      className={`flex-1 h-10 rounded text-[14px] transition-colors ${
                        mode === m ? 'bg-white text-ink font-medium' : 'text-muted hover:text-ink'
                      }`}>
                      {t(T.tabs[m])}
                    </button>
                  ))}
                </div>

                <label className="flex flex-col gap-2">
                  <span className="text-[14px] font-medium">{t(T.email)}</span>
                  <input type="email" name="email" value={email} onChange={e => setEmail(e.target.value)} required
                    autoComplete="email" spellCheck={false} placeholder={t(T.emailPh)} className={fieldClass} />
                </label>

                {mode !== 'magic' && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <label htmlFor="auth-password" className="text-[14px] font-medium">{t(T.password)}</label>
                      {mode === 'signin' && (
                        <button type="button" onClick={() => { setMode('magic'); setError(null) }}
                          className="text-[14px] text-muted hover:text-ink underline underline-offset-4 decoration-transparent hover:decoration-current transition-colors">
                          {t(T.forgot)}
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input id="auth-password" type={showPw ? 'text' : 'password'} name="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                        placeholder={t(T.passwordPh)} className={`${fieldClass} pr-20`} />
                      <button type="button" onClick={() => setShowPw(x => !x)} aria-pressed={showPw}
                        className="absolute right-1.5 top-1.5 h-9 px-2.5 rounded text-[13px] text-muted hover:text-ink hover:bg-[#f0f2f4] transition-colors">
                        {showPw ? t(T.hide) : t(T.show)}
                      </button>
                    </div>
                  </div>
                )}

                {error && <p className="text-[14px] text-[#c4242a]" role="alert">{error}</p>}

                <button type="submit" disabled={loading}
                  className="mt-1 h-12 rounded-md bg-accent hover:bg-accent-strong active:scale-[0.98] disabled:opacity-60 text-white font-medium text-[16px] transition flex items-center justify-center gap-2">
                  {loading ? t(T.working) : t(T.submit[mode])}
                  {!loading && <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </button>

                {mode === 'signup' && (
                  <ol className="flex flex-col gap-2 pt-2 border-t border-line text-[14px] text-muted">
                    {T.steps.map((st, i) => (
                      <li key={i} className="flex items-baseline gap-3 pt-2 first:pt-3">
                        <span className="num w-5 shrink-0 text-ink font-medium">{i + 1}</span><span>{t(st)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </form>
            )}

            {onBack && (
              <button type="button" onClick={onBack}
                className="mt-8 text-[15px] text-muted hover:text-ink underline underline-offset-4 decoration-transparent hover:decoration-current transition-colors">
                {t(T.back)}
              </button>
            )}
          </div>
        </main>
      </div>
      {/* After the form in reading order; placed on the left on wide screens */}
      {wide && (
        <aside className="sticky top-0 h-svh col-start-1 row-start-1">
          <AuthStage headline={t(stage.headline)} sub={t(stage.sub)} />
        </aside>
      )}
    </div>
  )
}

/** Wide screens get the live stage beside the form; one headline exists at a time. */
function useWide() {
  const q = '(min-width: 1024px)'
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}
