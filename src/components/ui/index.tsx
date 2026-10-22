// Shared UI primitives in the Handball Stats style (tasteskill "Achromatic
// ledger"): flat white surfaces on a cool grey ground, 1px lines, near-black
// primary actions, cobalt only for data and the single brand action.
import type { InputHTMLAttributes, ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { useLang, useT, PRODUCT_NAME, type Lang } from '@/lib/i18n/lang'
import { LogoMark } from '@/components/brand/Logo'

// ─── Form controls ────────────────────────────────────────────────────────────

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full h-10 px-3 rounded-md bg-white border border-[#cdd2d9] text-[15px] text-ink placeholder:text-[#6b7079] focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:bg-[#f5f6f8] ${className}`}
      {...props}
    />
  )
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-[14px] font-medium text-ink mb-1.5">
      {children}
    </label>
  )
}

export function Field({ children }: { children: ReactNode }) {
  return <div className="flex flex-col">{children}</div>
}

export function Select({ children, className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      className={`w-full h-10 px-3 rounded-md border border-[#cdd2d9] text-[15px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-accent ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}

// ─── Buttons ──────────────────────────────────────────────────────────────────

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

const buttonClass = (variant: ButtonProps['variant'] = 'primary', size: ButtonProps['size'] = 'md') => {
  const variants = {
    primary: 'bg-[#111214] text-white hover:bg-black disabled:bg-[#9aa0a8]',
    accent: 'bg-accent text-white hover:bg-accent-strong disabled:opacity-50',
    secondary: 'bg-[#e5e5e5] text-ink hover:bg-[#d9d9d9] disabled:opacity-50',
    ghost: 'bg-transparent text-muted hover:text-ink hover:bg-[#e8eaee]',
    danger: 'bg-white text-[#c4242a] border border-[#f0c4c6] hover:bg-[#ffedea]',
  }
  const sizes = {
    sm: 'h-8 px-3 text-[13px]',
    md: 'h-10 px-4 text-[14px]',
    lg: 'h-12 px-6 text-[16px]',
  }
  return `inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition active:scale-[0.97] disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]}`
}

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  return (
    <button className={`${buttonClass(variant, size)} ${className}`} {...props}>
      {children}
    </button>
  )
}

// ─── Surfaces ─────────────────────────────────────────────────────────────────

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-lg border border-line ${className}`}>
      {children}
    </div>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={`w-5 h-5 border-2 border-ink border-t-transparent rounded-full animate-spin ${className}`} />
  )
}

/** One sentence in a dashed frame: an empty section keeps its place. */
export function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <p className="text-[14px] text-muted border border-dashed border-[#cfd4db] rounded-lg px-3 py-2.5">{children}</p>
  )
}

// ─── Segmented control ────────────────────────────────────────────────────────

export function Segmented<V extends string>({ value, onChange, options, label, size = 'md', full = false }: {
  value: V
  onChange: (v: V) => void
  options: { v: V; label: ReactNode }[]
  label?: string
  size?: 'sm' | 'md'
  full?: boolean
}) {
  return (
    <div role="group" aria-label={label}
      className={`${full ? 'flex' : 'inline-flex'} p-0.5 gap-0.5 rounded-md bg-[#f5f6f8] border border-line`}>
      {options.map(o => (
        <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}
          className={`${full ? 'flex-1' : ''} ${size === 'sm' ? 'h-7 px-2.5 text-[13px]' : 'h-8 px-3 text-[14px]'} rounded whitespace-nowrap transition-colors ${
            value === o.v ? 'bg-white text-ink shadow-[0_0_0_1px_#e3e6ea]' : 'text-muted hover:text-ink'
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Underline tabs on a full-width rule, scrolling sideways on a phone. */
export function Tabs<V extends string>({ value, onChange, options, label }: {
  value: V
  onChange: (v: V) => void
  options: { v: V; label: ReactNode }[]
  label?: string
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
      {options.map(o => (
        <button key={o.v} type="button" role="tab" aria-selected={value === o.v} onClick={() => onChange(o.v)}
          className={`relative h-11 px-3 text-[15px] whitespace-nowrap transition-colors ${
            value === o.v ? 'text-ink font-medium' : 'text-muted hover:text-ink'
          }`}>
          {o.label}
          {value === o.v && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-ink" aria-hidden="true" />}
        </button>
      ))}
    </div>
  )
}

// ─── Language and the app bar ─────────────────────────────────────────────────

export function LangToggle({ dark = false }: { dark?: boolean }) {
  const lang = useLang(s => s.lang)
  const setLang = useLang(s => s.setLang)
  const t = useT()
  const opts: { v: Lang; label: string; long: string }[] = [
    { v: 'en', label: 'EN', long: 'English' },
    { v: 'is', label: 'IS', long: 'Íslenska' },
  ]
  return (
    <div className="inline-flex gap-0.5" role="group" aria-label={t({ en: 'Language', is: 'Tungumál' })}>
      {opts.map(o => (
        <button
          key={o.v} type="button" lang={o.v} title={o.long} aria-pressed={lang === o.v}
          onClick={() => setLang(o.v)}
          className={`min-w-9 h-8 px-1.5 rounded text-[15px] transition-colors ${
            lang === o.v
              ? dark ? 'bg-white/15 text-white' : 'bg-surface text-ink'
              : dark ? 'text-white/70 hover:text-white' : 'text-muted hover:text-ink'
          }`}
        >{o.label}</button>
      ))}
    </div>
  )
}

/**
 * The bar across the top of every in-app screen: the product's mark, where you
 * are, and the language switch. `onBack` adds a back control on the left.
 */
export function AppBar({ title, onBack, backLabel, right, wide = false, width = 'max-w-[1136px]' }: {
  title?: ReactNode
  onBack?: () => void
  backLabel?: string
  right?: ReactNode
  wide?: boolean
  /** Max width class, matching the page content below the bar. */
  width?: string
}) {
  const t = useT()
  const lang = useLang(s => s.lang)
  return (
    <header className="h-12 border-b border-line bg-ground shrink-0 print:hidden">
      <div className={`h-full ${wide ? '' : width} mx-auto px-4 sm:px-6 flex items-center justify-between gap-3`}>
        <div className="flex items-center gap-2.5 min-w-0">
          {onBack && (
            <button type="button" onClick={onBack} aria-label={backLabel ?? t({ en: 'Back', is: 'Til baka' })}
              className="-ml-2 h-9 px-2 rounded-md text-[15px] text-muted hover:text-ink hover:bg-[#e8eaee] transition-colors flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span className="hidden sm:inline">{backLabel ?? t({ en: 'Back', is: 'Til baka' })}</span>
            </button>
          )}
          <LogoMark size={20} />
          <span translate="no" className="font-bold uppercase tracking-tight text-[15px] whitespace-nowrap hidden md:inline">{PRODUCT_NAME[lang]}</span>
          {title && (<><span className="text-muted hidden md:inline" aria-hidden="true">/</span><span className="text-[14px] truncate">{title}</span></>)}
        </div>
        <div className="flex items-center gap-1 sm:gap-3 shrink-0">
          {right}
          <LangToggle />
        </div>
      </div>
    </header>
  )
}

/** Screen title row: a noun title, one line about the data, actions on the right. */
export function PageTitle({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[24px] font-semibold leading-tight">{title}</h1>
        {sub && <p className="text-[15px] text-muted mt-1">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
