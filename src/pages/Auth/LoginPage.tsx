import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'

type Mode = 'signin' | 'signup' | 'magic'

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [magicSent, setMagicSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({ email })
        if (error) throw error
        setMagicSent(true)
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMagicSent(true) // Supabase sends a confirmation email
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        // Auth state change in AuthGate will handle the rest
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (magicSent) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white px-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="text-4xl">📧</div>
          <h2 className="text-xl font-bold">Athugaðu tölvupóstinn þinn</h2>
          <p className="text-slate-400 text-sm">
            {mode === 'signup'
              ? 'Við sendum þér staðfestingarpóst. Smelltu á hlekkinn til að klára skráningu.'
              : 'Við sendum þér innskráningartengil. Smelltu á hlekkinn til að skrá þig inn.'}
          </p>
          <button
            onClick={() => { setMagicSent(false); setMode('signin') }}
            className="text-sm text-blue-400 hover:underline"
          >
            Til baka
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Handbolti</h1>
          <p className="text-slate-400 text-sm mt-1">Handball match statistics</p>
        </div>

        <div className="bg-slate-800 rounded-2xl p-6 space-y-4">
          {/* Mode tabs */}
          <div className="flex rounded-lg bg-slate-700 p-1 gap-1">
            <button
              onClick={() => { setMode('signin'); setError(null) }}
              className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === 'signin' ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'
              }`}
            >
              Innskráning
            </button>
            <button
              onClick={() => { setMode('signup'); setError(null) }}
              className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === 'signup' ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'
              }`}
            >
              Nýskráning
            </button>
            <button
              onClick={() => { setMode('magic'); setError(null) }}
              className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === 'magic' ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'
              }`}
            >
              Tengill
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Netfang</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="nafn@daemi.is"
                className="w-full px-3 py-2.5 rounded-lg bg-slate-700 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {mode !== 'magic' && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Lykilorð</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Að minnsta kosti 6 stafir"
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-700 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}

            {error && (
              <p className="text-red-400 text-xs">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Auðbið…
                </span>
              ) : mode === 'signin' ? 'Skrá inn'
                : mode === 'signup' ? 'Búa til aðgang'
                : 'Senda tengil'}
            </button>
          </form>

          {mode === 'magic' && (
            <p className="text-xs text-slate-500 text-center">
              Við sendum þér tengil í tölvupósti — engin þörf á lykilorði.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
