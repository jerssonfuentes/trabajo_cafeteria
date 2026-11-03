import { useState } from 'react'
import { ArrowRight, Eye, EyeOff, Mail, LockKeyhole } from 'lucide-react'

import { getRememberSessionPreference } from '../../infrastructure/supabase/client'
import { useAuth } from './AuthProvider'

export function LoginForm() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberSession, setRememberSession] = useState(getRememberSessionPreference)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    try { await login(email, password, rememberSession) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible iniciar sesión.') }
    finally { setBusy(false) }
  }

  return <form className="login-form" onSubmit={submit}>
    <label className="login-label" htmlFor="login-email">Correo electrónico</label>
    <div className="login-input-wrap"><Mail aria-hidden="true" size={18} /><input autoCapitalize="none" autoComplete="username" id="login-email" onChange={(event) => setEmail(event.target.value)} placeholder="nombre@institucion.edu" required spellCheck={false} type="email" value={email} /></div>
    <label className="login-label login-password-label" htmlFor="login-password">Contraseña</label>
    <div className="login-input-wrap"><LockKeyhole aria-hidden="true" size={18} /><input autoComplete="current-password" id="login-password" onChange={(event) => setPassword(event.target.value)} placeholder="Escribe tu contraseña" required spellCheck={false} type={showPassword ? 'text' : 'password'} value={password} /><button aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="login-password-toggle" onClick={() => setShowPassword((shown) => !shown)} type="button">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
    <label className="login-remember-row" htmlFor="login-remember-session">
      <input
        checked={rememberSession}
        id="login-remember-session"
        onChange={(event) => setRememberSession(event.target.checked)}
        type="checkbox"
      />
      <span>Mantener sesión iniciada</span>
    </label>
    {error && <p className="login-error" role="alert">{error}</p>}
    <button className="login-submit" disabled={busy} type="submit">{busy ? 'Verificando acceso…' : 'Entrar a la cafetería'}{!busy && <ArrowRight size={19} />}</button>
  </form>
}
