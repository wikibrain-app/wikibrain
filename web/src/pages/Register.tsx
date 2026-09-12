import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, ApiError } from '../lib/api';
import { useToast } from '../lib/toast';
import { useT } from '../i18n';
import { AuthCard, Field, btnPrimary, input } from '../components/ui';
import { Turnstile } from '../components/Turnstile';
import { GoogleButton } from '../components/GoogleButton';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [resent, setResent] = useState(false);
  const [google, setGoogle] = useState(false);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const { toast } = useToast();
  const { t, lang } = useT();
  useEffect(() => { api.config().then(c => { setSiteKey(c.turnstileSiteKey); setGoogle(c.googleEnabled); }).catch(() => {}); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.signUp(email, password, name.trim(), token);
      setSent(true);
    } catch (err) {
      const e = err as ApiError;
      toast(e.status === 422 || /exist/i.test(e.message) ? t('register.errExists') : e.message, { kind: 'error' });
    } finally { setBusy(false); }
  }

  if (sent) {
    return (
      <AuthCard>
        <h1 className="font-serif text-[22px] font-bold mb-2">{t('register.sentTitle')}</h1>
        <p className="text-[13px] text-ink-soft leading-relaxed">{t('register.sentBefore')}<b className="text-ink">{email}</b>{t('register.sentAfter')}</p>
        {/* The first drop in the funnel is here; a person who cannot find the mail must be able to act without guessing to try the login page. */}
        <p className="mt-3 rounded-[10px] border border-line bg-amber-mist px-3 py-2 text-[12.5px] leading-relaxed" role="status">
          {t('register.sentSpam')}{' '}
          <button type="button" className="text-celadon-deep underline disabled:no-underline disabled:text-ink-faint" disabled={resent} data-testid="register-resend"
            onClick={() => fetch('/api/auth/send-verification-email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, callbackURL: '/' }) }).then(() => setResent(true)).catch(() => {})}>
            {resent ? t('register.resent') : t('register.resend')}
          </button>
        </p>
        <p className="text-[13px] text-ink-soft mt-5"><Link className="text-celadon-deep underline" to="/login">{t('auth.backToLogin')}</Link></p>
      </AuthCard>
    );
  }
  return (
    <AuthCard>
      <h1 className="font-serif text-[22px] font-bold mb-1">{t('register.title')}</h1>
      <p className="text-[13px] text-ink-soft mb-5">{t('register.tagline')}</p>
      {google && (
        <>
          <GoogleButton label={t('register.google')} />
          <div className="my-4 flex items-center gap-3 text-[12px] text-ink-faint">
            <span className="h-px flex-1 bg-line" />{t('register.or')}<span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}
      <form onSubmit={submit}>
        <Field label={t('register.name')} htmlFor="name"><input id="name" className={input} autoComplete="username" required minLength={2} maxLength={40} value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="Email" htmlFor="email"><input id="email" className={input} type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></Field>
        <Field label={t('register.password')} htmlFor="password"><input id="password" className={input} type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></Field>
        {siteKey && <Turnstile siteKey={siteKey} onToken={setToken} />}
        <button className={`${btnPrimary} w-full mt-1`} disabled={busy || (!!siteKey && !token)}>{busy ? t('register.submitting') : t('register.submit')}</button>
      </form>
      <p className="mt-4 text-[12px] leading-relaxed text-ink-faint">{lang === 'en' ? <>By creating an account you agree to the <Link to="/terms" className="text-celadon-deep hover:underline">Terms of Service</Link> and <Link to="/privacy" className="text-celadon-deep hover:underline">Privacy Policy</Link>.</> : <>建立帳號即表示你同意<Link to="/terms" className="text-celadon-deep hover:underline">服務條款</Link>與<Link to="/privacy" className="text-celadon-deep hover:underline">隱私權政策</Link>。</>}</p>
      <p className="text-[13px] text-ink-soft mt-5">{t('register.haveAccount')}<Link className="text-celadon-deep underline" to="/login">{t('auth.login')}</Link></p>
    </AuthCard>
  );
}
