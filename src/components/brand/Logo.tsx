import { PRODUCT_NAME, useLang } from '@/lib/i18n/lang'

/**
 * The mark: the goal face split into its nine EHF zones — the grid every shot
 * in the product lands in — with the top corner (zone 3) filled.
 */
export function LogoMark({ size = 24, accent = '#1f2de6', ink = 'currentColor' }: { size?: number; accent?: string; ink?: string }) {
  const c = 8, g = 1.5 // cell, gap (viewBox units)
  const cells = Array.from({ length: 9 }, (_, i) => ({ x: (i % 3) * (c + g), y: Math.floor(i / 3) * (c + g), zone: i + 1 }))
  const total = 3 * c + 2 * g
  return (
    <svg width={size} height={size} viewBox={`0 0 ${total} ${total}`} aria-hidden="true" focusable="false">
      {cells.map(({ x, y, zone }) => (
        <rect key={zone} x={x} y={y} width={c} height={c} fill={zone === 3 ? accent : ink} />
      ))}
    </svg>
  )
}

/** Mark + product name in the current language. */
export function Wordmark({ className = '', size = 22, accent }: { className?: string; size?: number; accent?: string }) {
  const lang = useLang(s => s.lang)
  return (
    <span className={`hs-wordmark ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.45) }}>
      <LogoMark size={size} accent={accent} />
      <span translate="no">{PRODUCT_NAME[lang]}</span>
    </span>
  )
}
