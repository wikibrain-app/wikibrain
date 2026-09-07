import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, ApiError } from '../lib/api';
import { useToast } from '../lib/toast';
import { useT } from '../i18n';
import { AuthCard, Field, btnPrimary, input } from '../components/ui';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const { t } = useT();
  const navigate = useNavigate();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw !== pw2) { toast(t('reset.mismatch'), { kind: 'error' }); return; }
    setBusy(true);
    try { await api.resetPassword(token, pw); toast(t('reset.done')); navigate('/login'); }
    catch (err) { toast((err as ApiError).status === 400 ? t('reset.expired') : (err as Error).message, { kind: 'error' }); }
    finally { setBusy(false); }
  }
  if (!token || params.get('error')) {
    return (
      <AuthCard>
        <h1 className="font-serif text-[22px] font-bold mb-2">{t('reset.invalidTitle')}</h1>
        <p className="text-[13px] text-ink-soft leading-relaxed">{t('reset.invalidBody')}</p>
        <p className="text-[13px] text-ink-soft mt-5"><Link className="text-celadon-deep underline" to="/forgot">{t('reset.requestAgain')}</Link></p>
      </AuthCard>
    );
  }
  return (
    <AuthCard>
      <h1 className="font-serif text-[22px] font-bold mb-1">{t('reset.title')}</h1>
      <p className="text-[13px] text-ink-soft mb-5">{t('reset.hint')}</p>
      <form onSubmit={submit}>
        <Field label={t('reset.new')} htmlFor="pw"><input id="pw" className={input} type="password" required minLength={8} autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></Field>
        <Field label={t('reset.again')} htmlFor="pw2"><input id="pw2" className={input} type="password" required minLength={8} autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></Field>
        <button className={`${btnPrimary} w-full mt-1`} disabled={busy}>{busy ? t('reset.updating') : t('reset.submit')}</button>
      </form>
    </AuthCard>
  );
}
