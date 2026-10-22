// Small, dependency-free statistics for the insight finder. Every test returns
// a two-sided p-value; the finder corrects for running many tests at once
// (Benjamini–Hochberg) before calling anything a finding.

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7). */
export function phi(z: number): number {
  const s = z < 0 ? -1 : 1
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return 0.5 * (1 + s * y)
}

const twoSided = (z: number) => Math.min(1, 2 * (1 - phi(Math.abs(z))))

/**
 * Two proportions, a/n vs b/m (pooled z-test). Returns the difference in
 * percentage points and the p-value. Needs both groups to have attempts.
 */
export function twoProportions(a: number, n: number, b: number, m: number): { diff: number; p: number } {
  if (n === 0 || m === 0) return { diff: 0, p: 1 }
  const p1 = a / n, p2 = b / m
  const pool = (a + b) / (n + m)
  const se = Math.sqrt(pool * (1 - pool) * (1 / n + 1 / m))
  if (se === 0) return { diff: (p1 - p2) * 100, p: 1 }
  return { diff: (p1 - p2) * 100, p: twoSided((p1 - p2) / se) }
}

/** ln Γ(x) (Lanczos) — for exact Poisson tails. */
function lnGamma(x: number): number {
  const g = [76.18009172947146, -86.50532032941678, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let y = x, tmp = x + 5.5
  tmp -= (x + 0.5) * Math.log(tmp)
  let ser = 1.000000000190015
  for (const c of g) ser += c / ++y
  return -tmp + Math.log(2.5066282746310007 * ser / x)
}

function poissonPmf(k: number, mu: number) {
  return mu === 0 ? (k === 0 ? 1 : 0) : Math.exp(k * Math.log(mu) - mu - lnGamma(k + 1))
}

/**
 * Observed count vs expected count (Poisson). Exact two-sided p for small
 * counts, normal approximation for large ones.
 */
export function poissonTest(observed: number, expected: number): number {
  if (expected <= 0) return 1
  if (expected > 60) return twoSided((observed - expected) / Math.sqrt(expected))
  const po = poissonPmf(observed, expected)
  let p = 0
  const hi = Math.max(observed, expected) * 3 + 30
  for (let k = 0; k <= hi; k++) {
    const pk = poissonPmf(k, expected)
    if (pk <= po * (1 + 1e-7)) p += pk
  }
  return Math.min(1, p)
}

/** Pearson correlation and its p-value (Fisher z). */
export function correlation(xs: number[], ys: number[]): { r: number; p: number; slope: number; intercept: number } {
  const n = xs.length
  if (n < 4) return { r: 0, p: 1, slope: 0, intercept: 0 }
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2 }
  if (sxx === 0 || syy === 0) return { r: 0, p: 1, slope: 0, intercept: my }
  const r = Math.max(-0.999999, Math.min(0.999999, sxy / Math.sqrt(sxx * syy)))
  const z = Math.atanh(r) * Math.sqrt(n - 3)
  return { r, p: twoSided(z), slope: sxy / sxx, intercept: my - (sxy / sxx) * mx }
}

/** How far one value sits from the others (leave-one-out z-score). */
export function leaveOneOutZ(values: number[], i: number): { z: number; mean: number } {
  const rest = values.filter((_, j) => j !== i)
  const n = rest.length
  const mean = rest.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(rest.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1))
  return { z: sd === 0 ? 0 : (values[i] - mean) / sd, mean }
}

/** Benjamini–Hochberg adjusted p-values (q-values), in input order. */
export function benjaminiHochberg(ps: number[]): number[] {
  const m = ps.length
  const order = ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0])
  const q = new Array<number>(m)
  let min = 1
  for (let k = m - 1; k >= 0; k--) {
    const [p, i] = order[k]
    min = Math.min(min, (p * m) / (k + 1))
    q[i] = min
  }
  return q
}
