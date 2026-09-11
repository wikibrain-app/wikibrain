import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, ApiError } from '../lib/api';
import { useToast } from '../lib/toast';
import { useT } from '../i18n';
import { AuthCard, Field, btnPrimary, input } from '../components/ui';
import { GoogleButton } from '../components/GoogleButton';

export default function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);
  const { toast } = useToast();
  const { t } = useT();
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);
  useEffect(() => { api.config().then(c => setGoogle(c.googleEnabled)).catch(() => {}); }, []);

  /* A signup that never received its verification mail is a dead end: the account exists but cannot be used, and the
     person has no way to ask for another one. */
  async function resend() {
    try {
      const res = await fetch('/api/auth/send-verification-email', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, callbackURL: '/' }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setResent(true);
      toast(t('login.resent'));
    } catch { toast(t('login.resendFailed'), { kind: 'error' }); }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.signIn(email, password);
      onSignedIn();
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 403) setUnverified(true);          // the link never arrived, or went to spam
      toast(e.status === 403 ? t('login.errUnverified') : e.status === 401 ? t('login.errBad') : e.message, { kind: 'error' });
    } finally { setBusy(false); }
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
      {unverified && (
        <div className="mt-4 rounded-[10px] border border-line bg-amber-mist px-3 py-2 text-[12.5px] leading-relaxed" role="status" data-testid="unverified">
          {t('login.unverifiedHelp')}
          <button className="ml-1 text-celadon-deep underline disabled:no-underline disabled:text-ink-faint" disabled={resent || !email} onClick={resend} data-testid="resend-verification">
            {resent ? t('login.resentShort') : t('login.resend')}
          </button>
        </div>
      )}
      {google && <GoogleButton label={t('login.google')} />}
      <p className="text-[13px] text-ink-soft mt-5">{t('login.noAccount')}<Link className="text-celadon-deep underline" to="/register">{t('login.register')}</Link>　·　<Link className="text-celadon-deep underline" to="/forgot">{t('login.forgot')}</Link>　·　<Link className="text-celadon-deep underline" to="/help">{t('auth.help')}</Link></p>
    </AuthCard>
  );
}

// Official multi-colour "G" mark (Google sign-in branding guidelines: keep the colours, do not recolour).
