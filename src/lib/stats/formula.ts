// A small, safe formula language for user-defined indices. Formulas are parsed
// into a tree and evaluated against named numbers — nothing is ever run as code.
//
//   numbers      12, 0.35, 1.5
//   names        duelPct, oppShotEff, DQIdef, myStep   (letters, digits, _)
//   operators    + - * / ^   ( )   and × ÷ − as typed in the shown formulas
//   comparisons  > < >= <= == !=   (1 when true, 0 when false — for if())
//   functions    min(a, b, …)  max(a, b, …)  clamp(x)  clamp(x, lo, hi)
//                exp(x)  ln(x)  sqrt(x)  abs(x)  round(x)  if(cond, a, b)
//
// Division by zero gives 0, as the original index code did (safeDiv).

export type Node =
  | { k: 'num'; v: number }
  | { k: 'name'; name: string }
  | { k: 'neg'; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'call'; fn: string; args: Node[] }

export const FUNCTIONS: Record<string, { min: number; max: number }> = {
  min: { min: 1, max: 99 }, max: { min: 1, max: 99 },
  clamp: { min: 1, max: 3 }, exp: { min: 1, max: 1 }, ln: { min: 1, max: 1 },
  sqrt: { min: 1, max: 1 }, abs: { min: 1, max: 1 }, round: { min: 1, max: 1 },
  if: { min: 3, max: 3 },
}

export class FormulaError extends Error {
  at: number
  constructor(message: string, at: number) { super(message); this.at = at }
}

type Tok = { t: 'num' | 'name' | 'op' | '(' | ')' | ','; v: string; at: number }

function tokenize(src: string): Tok[] {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-')
  const out: Tok[] = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) { i++; continue }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i))
      if (!m) throw new FormulaError(`Can't read the number at "${s.slice(i, i + 6)}"`, i)
      out.push({ t: 'num', v: m[0], at: i }); i += m[0].length; continue
    }
    if (/[A-Za-z_À-ɏ]/.test(c)) {
      const m = /^[A-Za-z_À-ɏ][A-Za-z0-9_À-ɏ]*/.exec(s.slice(i))!
      out.push({ t: 'name', v: m[0], at: i }); i += m[0].length; continue
    }
    const two = s.slice(i, i + 2)
    if (['>=', '<=', '==', '!='].includes(two)) { out.push({ t: 'op', v: two, at: i }); i += 2; continue }
    if ('+-*/^<>'.includes(c)) { out.push({ t: 'op', v: c, at: i }); i++; continue }
    if (c === '(' || c === ')' || c === ',') { out.push({ t: c, v: c, at: i }); i++; continue }
    throw new FormulaError(`Unexpected "${c}"`, i)
  }
  return out
}

/** Parse a formula. Throws FormulaError with a position on bad input. */
export function parse(src: string): Node {
  const toks = tokenize(src)
  let p = 0
  const peek = () => toks[p]
  const end = src.length
  const expect = (t: Tok['t']) => {
    const k = toks[p]
    if (!k || k.t !== t) throw new FormulaError(k ? `Expected "${t}" before "${k.v}"` : `Expected "${t}" at the end`, k?.at ?? end)
    p++
  }

  // precedence: comparison < + - < * / < unary - < ^
  function cmp(): Node {
    let a = add()
    while (peek()?.t === 'op' && ['>', '<', '>=', '<=', '==', '!='].includes(peek().v)) {
      const op = toks[p++].v; a = { k: 'bin', op, a, b: add() }
    }
    return a
  }
  function add(): Node {
    let a = mul()
    while (peek()?.t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = toks[p++].v; a = { k: 'bin', op, a, b: mul() }
    }
    return a
  }
  function mul(): Node {
    let a = unary()
    while (peek()?.t === 'op' && (peek().v === '*' || peek().v === '/')) {
      const op = toks[p++].v; a = { k: 'bin', op, a, b: unary() }
    }
    return a
  }
  function unary(): Node {
    if (peek()?.t === 'op' && peek().v === '-') { p++; return { k: 'neg', a: unary() } }
    if (peek()?.t === 'op' && peek().v === '+') { p++; return unary() }
    return pow()
  }
  function pow(): Node {
    const a = atom()
    if (peek()?.t === 'op' && peek().v === '^') { p++; return { k: 'bin', op: '^', a, b: unary() } }
    return a
  }
  function atom(): Node {
    const k = toks[p]
    if (!k) throw new FormulaError('The formula ends too early', end)
    if (k.t === 'num') { p++; return { k: 'num', v: parseFloat(k.v) } }
    if (k.t === '(') { p++; const e = cmp(); expect(')'); return e }
    if (k.t === 'name') {
      p++
      if (peek()?.t === '(') {
        const fn = k.v.toLowerCase()
        const spec = FUNCTIONS[fn]
        if (!spec) throw new FormulaError(`Unknown function "${k.v}"`, k.at)
        p++
        const args: Node[] = []
        if (peek()?.t !== ')') {
          args.push(cmp())
          while (peek()?.t === ',') { p++; args.push(cmp()) }
        }
        expect(')')
        if (args.length < spec.min || args.length > spec.max) {
          throw new FormulaError(`${fn}() takes ${spec.min === spec.max ? spec.min : `${spec.min}–${spec.max}`} value(s)`, k.at)
        }
        return { k: 'call', fn, args }
      }
      return { k: 'name', name: k.v }
    }
    throw new FormulaError(`Unexpected "${k.v}"`, k.at)
  }

  if (toks.length === 0) throw new FormulaError('The formula is empty', 0)
  const tree = cmp()
  if (p < toks.length) throw new FormulaError(`Unexpected "${toks[p].v}"`, toks[p].at)
  return tree
}

/** Every name a formula reads. */
export function namesIn(n: Node, out = new Set<string>()): Set<string> {
  if (n.k === 'name') out.add(n.name)
  else if (n.k === 'neg') namesIn(n.a, out)
  else if (n.k === 'bin') { namesIn(n.a, out); namesIn(n.b, out) }
  else if (n.k === 'call') n.args.forEach(a => namesIn(a, out))
  return out
}

const fin = (v: number) => (Number.isFinite(v) ? v : 0)

/** Evaluate a parsed formula. Unknown names are an error the caller checks first. */
export function evaluate(n: Node, vars: Record<string, number>): number {
  switch (n.k) {
    case 'num': return n.v
    case 'name': return vars[n.name] ?? 0
    case 'neg': return -evaluate(n.a, vars)
    case 'bin': {
      const a = evaluate(n.a, vars), b = evaluate(n.b, vars)
      switch (n.op) {
        case '+': return a + b
        case '-': return a - b
        case '*': return a * b
        case '/': return b === 0 ? 0 : a / b
        case '^': return fin(Math.pow(a, b))
        case '>': return a > b ? 1 : 0
        case '<': return a < b ? 1 : 0
        case '>=': return a >= b ? 1 : 0
        case '<=': return a <= b ? 1 : 0
        case '==': return a === b ? 1 : 0
        case '!=': return a !== b ? 1 : 0
      }
      return 0
    }
    case 'call': {
      const v = (i: number) => evaluate(n.args[i], vars)
      switch (n.fn) {
        case 'min': return Math.min(...n.args.map((_, i) => v(i)))
        case 'max': return Math.max(...n.args.map((_, i) => v(i)))
        case 'clamp': {
          const x = v(0), lo = n.args.length > 1 ? v(1) : 0, hi = n.args.length > 2 ? v(2) : 100
          return Math.max(lo, Math.min(hi, Number.isNaN(x) ? 0 : x))
        }
        case 'exp': return fin(Math.exp(v(0)))
        case 'ln': { const x = v(0); return x > 0 ? Math.log(x) : 0 }
        case 'sqrt': { const x = v(0); return x > 0 ? Math.sqrt(x) : 0 }
        case 'abs': return Math.abs(v(0))
        case 'round': return Math.round(v(0))
        case 'if': return v(0) !== 0 ? v(1) : v(2)
      }
      return 0
    }
  }
}
