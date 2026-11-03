import { ArrowRight, BadgeCheck, Coffee, ShieldAlert, Sparkles, Utensils } from 'lucide-react'

import { canAccessRoute, defaultRouteFor, type ProtectedRoute } from './authorization'
import { useAuth } from './AuthProvider'
import { LoginForm } from './LoginForm'

const foodPhotos = [
  '/food/bakery.jpg',
  '/food/burger.jpg',
  '/food/pizza.jpg',
]

export function AuthGate({ route, children }: { route: ProtectedRoute; children: React.ReactNode }) {
  const { session, status, error, refresh } = useAuth()

  if (status === 'loading') return <AuthMessage title="Preparando tu espacio" detail="Conectando de forma segura con la cafetería…" />
  if (status === 'unconfigured') return <AuthMessage title="Supabase pendiente de configurar" detail="Define la URL del proyecto y su clave publicable en las variables de entorno de Vercel." warning />
  if (status === 'error') return <AuthMessage title="No pudimos validar la sesión" detail={error} action={<button className="admin-primary-button" onClick={() => void refresh()} type="button">Reintentar <ArrowRight size={17} /></button>} warning />
  if (status === 'unauthenticated' || !session) return <LoginScreen />
  if (!canAccessRoute(session.user.role, route, session.user.permissions)) {
    const allowedRoute = defaultRouteFor(session.user.role, session.user.permissions)
    return <AuthMessage title="Acceso restringido" detail="Tu perfil no tiene permiso para entrar a esta sección." warning action={<a className="admin-primary-button" href={`#/${allowedRoute}`}>Ir a mi área <ArrowRight size={17} /></a>} />
  }
  return children
}

function LoginScreen() {
  return <main className="login-screen">
    <section className="login-visual" aria-label="Bienvenido a la cafetería escolar">
      <div className="login-brand"><div className="login-brand-mark"><Utensils size={23} strokeWidth={2.6} /></div><div><strong>CAFÉ<span>·</span>ESCUELA</strong><small>Comandas con cariño</small></div></div>
      <div className="login-copy"><span className="login-eyebrow"><Sparkles size={14} /> SABORES QUE ACOMPAÑAN</span><h1>Un recreo rico<br />empieza aquí.</h1><p>La forma sencilla y cercana de atender cada pedido de nuestra comunidad escolar.</p></div>
      <div className="login-photo-grid" aria-hidden="true">
        {foodPhotos.map((src, index) => <div className={`login-food-photo login-food-photo-${index + 1}`} key={src}><img src={src} alt="" /></div>)}
        <div className="login-photo-note"><Coffee size={17} /><span>Hecho para el día a día</span></div>
      </div>
      <div className="login-visual-footer"><span>Fresco, rápido y siempre con una sonrisa.</span><span className="login-dots"><i /><i /><i /></span></div>
    </section>
    <section className="login-form-side">
      <div className="login-form-wrap">
        <div className="login-mobile-brand"><div className="login-brand-mark"><Utensils size={22} /></div><strong>CAFÉ<span>·</span>ESCUELA</strong></div>
        <div className="login-heading"><span className="login-welcome">Bienvenido de vuelta</span><h2>Iniciar sesión</h2><p>Ingresa con tu cuenta del equipo de cafetería.</p></div>
        <LoginForm />
        <div className="login-security"><BadgeCheck size={17} /><span>Acceso protegido y administrado por tu institución.</span></div>
        <p className="login-help">¿Necesitas una cuenta? Solicítala al administrador de la cafetería.</p>
      </div>
      <footer className="login-footer">CAFÉ·ESCUELA <span>·</span> Gestión de cafetería escolar</footer>
    </section>
  </main>
}

function AuthMessage({ title, detail, action, warning = false }: { title: string; detail: string; action?: React.ReactNode; warning?: boolean }) {
  const Icon = warning ? ShieldAlert : BadgeCheck
  return <main className="auth-status-page"><section className="auth-status-card"><div className={`auth-status-icon ${warning ? 'is-warning' : ''}`}><Icon aria-hidden="true" size={28} /></div><span className="login-welcome">CAFÉ·ESCUELA</span><h1>{title}</h1><p>{detail}</p>{action && <div className="auth-status-action">{action}</div>}<small>La autorización se valida con Supabase Auth y políticas RLS.</small></section></main>
}
