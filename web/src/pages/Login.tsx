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
      {google && <button className={`${btnGhost} w-full mt-3`} onClick={googleSignIn}>{t('login.google')}</button>}
      <p className="text-[13px] text-ink-soft mt-5">{t('login.noAccount')}<Link className="text-celadon-deep underline" to="/register">{t('login.register')}</Link>　·　<Link className="text-celadon-deep underline" to="/forgot">{t('login.forgot')}</Link>　·　<Link className="text-celadon-deep underline" to="/help">{t('auth.help')}</Link></p>
    </AuthCard>
  );
}
