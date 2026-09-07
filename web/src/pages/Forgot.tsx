import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { useToast } from '../lib/toast';
import { useT } from '../i18n';
import { AuthCard, Field, btnPrimary, input } from '../components/ui';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();
  const { t } = useT();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { await api.requestPasswordReset(email); setSent(true); }
    catch (err) { toast((err as Error).message, { kind: 'error' }); }
    finally { setBusy(false); }
  }
  return (
    <AuthCard>
      <h1 className="font-serif text-[22px] font-bold mb-1">{t('forgot.title')}</h1>
      {sent ? (
        <p className="text-[13px] text-ink-soft leading-relaxed">{t('forgot.sentBefore')}<b className="text-ink">{email}</b>{t('forgot.sentAfter')}</p>
      ) : (
        <>
          <p className="text-[13px] text-ink-soft mb-5">{t('forgot.intro')}</p>
          <form onSubmit={submit}>
            <Field label="Email" htmlFor="email"><input id="email" className={input} type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></Field>
            <button className={`${btnPrimary} w-full mt-1`} disabled={busy}>{busy ? t('forgot.sending') : t('forgot.submit')}</button>
          </form>
        </>
      )}
      <p className="text-[13px] text-ink-soft mt-5"><Link className="text-celadon-deep underline" to="/login">{t('auth.backToLogin')}</Link></p>
    </AuthCard>
  );
}
