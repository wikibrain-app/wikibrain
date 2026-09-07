import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { api, type Me } from '../lib/api';
import { useT } from '../i18n';
import { btnGhost, btnPrimary } from '../components/ui';
import { PageShell } from '../components/PageShell';

// OAuth consent page: /authorize redirects here after validating the client; on Allow, an authorization code is issued and the user is sent back to the client.
export default function OAuthConsent({ me }: { me: Me }) {
  const { t } = useT();
  const reqId = new URLSearchParams(useLocation().search).get('req') ?? '';
  const [info, setInfo] = useState<{ client_name: string | null; client_uri: string | null; redirect_uri: string; scopes: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.oauthRequest(reqId).then(r => setInfo(r.request)).catch(e => setError((e as Error).message)); }, [reqId]);
  const go = async (approve: boolean) => {
    setBusy(true);
    try { const { redirect } = approve ? await api.oauthApprove(reqId) : await api.oauthDeny(reqId); window.location.assign(redirect); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };
  const redirectUrl = (() => { try { return new URL(info?.redirect_uri ?? ''); } catch { return null; } })();
  const host = redirectUrl?.host ?? '';
  const clientHost = (() => { try { return info?.client_uri ? new URL(info.client_uri).host : ''; } catch { return ''; } })();
  const isLoopback = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const warn = !!redirectUrl && ((redirectUrl.protocol !== 'https:' && !isLoopback) || (!!clientHost && clientHost !== host));
  return (
    <PageShell title={t('oauth.title')}>
      <div className="mx-auto max-w-[520px] rounded-[14px] border border-line bg-paper p-8" data-testid="oauth-consent">
        <h1 className="font-serif text-[22px] font-bold mb-2">{t('oauth.title')}</h1>
        {error && <p className="text-[13.5px] text-danger" data-testid="oauth-error">{error}</p>}
        {!error && !info && <p className="text-[13px] text-ink-soft">{t('app.loading')}</p>}
        {info && (
          <>
            <p className="text-[14px] leading-relaxed mb-4">{t('oauth.intro1')}<b>{info.client_name ?? t('oauth.unnamed')}</b>{t('oauth.intro2')}<b>{me.workspace.name}</b>{t('oauth.intro3')}</p>
            <ul className="mb-5 list-disc pl-5 text-[13px] leading-relaxed text-ink-soft">
              {info.scopes.map(s => <li key={s}>{t(`oauth.scope.${s}`)}</li>)}
            </ul>
            <p className="mb-2 text-[14px]" data-testid="oauth-redirect-host">{t('oauth.redirectTo', { host: '' })}<b className="font-mono">{host}</b></p>
            {warn && <p className="mb-3 rounded-lg border border-amber bg-amber-mist px-3 py-2 text-[12.5px] text-amber" data-testid="oauth-warning">{t('oauth.warnMismatch')}</p>}
            <p className="mb-6 text-[12px] text-ink-faint">{t('oauth.onlyIfStarted')}{info.client_uri ? ` · ${info.client_uri}` : ''} · {t('oauth.account', { email: me.user.email })}</p>
            <div className="flex gap-2">
              <button className={btnPrimary} onClick={() => go(true)} disabled={busy} data-testid="oauth-approve">{t('oauth.approve')}</button>
              <button className={btnGhost} onClick={() => go(false)} disabled={busy} data-testid="oauth-deny">{t('oauth.deny')}</button>
            </div>
            <p className="mt-5 text-[12px] text-ink-faint">{t('oauth.revokeHint')}</p>
          </>
        )}
      </div>
    </PageShell>
  );
}
