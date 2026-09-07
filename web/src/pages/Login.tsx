import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, ApiError } from '../lib/api';
import { useToast } from '../lib/toast';
import { useT } from '../i18n';
import { AuthCard, Field, btnGhost, btnPrimary, input } from '../components/ui';

export default function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);
  const { toast } = useToast();
  const { t } = useT();
  useEffect(() => { api.config().then(c => setGoogle(c.googleEnabled)).catch(() => {}); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.signIn(email, password);
      onSignedIn();
    } catch (err) {
      const e = err as ApiError;
      toast(e.status === 403 ? t('login.errUnverified') : e.status === 401 ? t('login.errBad') : e.message, { kind: 'error' });
    } finally { setBusy(false); }
  }
  async function googleSignIn() {
    const res = await fetch('/api/auth/sign-in/social', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'google', callbackURL: '/' }) });
    const data = await res.json();
    if (data?.url) window.location.href = data.url;
  }

  return (
    <AuthCard>
      <h1 className="font-serif text-[22px] font-bold mb-1">{t('auth.login')}</h1>
      <p className="text-[13px] text-ink-soft mb-5">{t('login.tagline')}</p>
      <form onSubmit={submit}>
        <Field label="Email" htmlFor="email"><input id="email" className={input} type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></Field>
        <Field label={t('auth.password')} htmlFor="password"><input id="password" className={input} type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></Field>
        <button className={`${btnPrimary} w-full mt-1`} disabled={busy}>{busy ? t('login.submitting') : t('auth.login')}</button>
      </form>
      {google && <button className={`${btnGhost} mt-3 flex w-full items-center justify-center gap-2`} onClick={googleSignIn}><GoogleIcon />{t('login.google')}</button>}
      <p className="text-[13px] text-ink-soft mt-5">{t('login.noAccount')}<Link className="text-celadon-deep underline" to="/register">{t('login.register')}</Link>　·　<Link className="text-celadon-deep underline" to="/forgot">{t('login.forgot')}</Link>　·　<Link className="text-celadon-deep underline" to="/help">{t('auth.help')}</Link></p>
    </AuthCard>
  );
}

// Official multi-colour "G" mark (Google sign-in branding guidelines: keep the colours, do not recolour).
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}
