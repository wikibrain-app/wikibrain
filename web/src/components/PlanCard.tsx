import { useEffect, useRef, useState } from 'react';
import { api, type BillingInfo, type PlanStatus } from '../lib/api';
import { fmtDate, useT } from '../i18n';
import { useToast } from '../lib/toast';
import { openCheckout } from '../lib/paddle';
import { btnGhost, btnPrimary } from './ui';

// Plan status (decision 17): days left in the Pro trial, this month's agent-job usage on Free, keyless quota.
// Billing (Q1 = Paddle): upgrade buttons open the Paddle overlay checkout; the webhook flips workspaces.plan, so after
// checkout.completed we poll /api/plan until it says pro. Subscribers get a customer-portal link instead.
const fmtMb = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fmtPrice = (cents: number, currency: string) => `${currency === 'USD' ? 'US$' : currency + ' '}${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

export function PlanCard() {
  const { t, lang } = useT();
  const { toast } = useToast();
  const [p, setP] = useState<PlanStatus | null>(null);
  const [b, setB] = useState<BillingInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<number | null>(null);
  const load = () => Promise.all([api.plan().then(setP), api.billing().then(setB)]).catch(() => {});
  useEffect(() => { load(); return () => { if (pollRef.current) window.clearInterval(pollRef.current); }; }, []);
  if (!p) return null;
  const name = p.plan === 'pro' ? t('plan.pro') : p.trial_active ? t('plan.trial') : t('plan.free');
  const sub = b?.subscription;
  const paddle = b?.paddle ?? null;
  const showUpgrade = p.plan !== 'pro' && !!paddle;

  const buy = async (priceId: string) => {
    if (!paddle) return;
    setBusy(true);
    try {
      await openCheckout(paddle, priceId, name => {
        if (name === 'checkout.completed') {
          toast(t('plan.checkoutDone'));
          let tries = 0;
          pollRef.current = window.setInterval(async () => {
            tries += 1;
            const np = await api.plan().catch(() => null);
            if (np?.plan === 'pro' || tries >= 30) {
              if (pollRef.current) window.clearInterval(pollRef.current);
              if (np?.plan !== 'pro') toast(t('plan.checkoutSlow'));
              load();
            }
          }, 2000);
        }
        if (name === 'checkout.closed') setBusy(false);
      });
    } catch (e) { toast(t('plan.checkoutError', { err: (e as Error).message }), { kind: 'error' }); setBusy(false); }
  };
  const portal = async () => {
    setBusy(true);
    try { const u = await api.billingPortal(); window.open(u.overview, '_blank', 'noopener'); }
    catch (e) { toast(t('plan.portalError', { err: (e as Error).message }), { kind: 'error' }); }
    finally { setBusy(false); }
  };
  const scheduled = sub?.raw?.scheduled_change ?? null;
  const subLine = sub && p.plan === 'pro'
    ? sub.status === 'past_due' ? t('plan.subPastDue') : sub.status === 'paused' ? t('plan.subPaused') : sub.status === 'canceled' ? t('plan.subCanceled') : t('plan.subActive')
    : null;

  return (
    <section className="mb-10" data-testid="plan-card">
      <h2 className="text-[15px] font-semibold mb-1">{t('plan.title')}</h2>
      <div className="rounded-[10px] border border-line bg-porcelain px-4 py-3 text-[13px] leading-relaxed">
        <div><b>{name}</b>{p.trial_active && p.plan !== 'pro' ? t('plan.trialLeft', { days: p.trial_days_left }) : ''}</div>
        <div className="text-ink-soft">
          {p.runs_limit === null ? t('plan.unlimited', { n: p.runs_this_month }) : t('plan.runs', { used: p.runs_this_month, limit: p.runs_limit, month: p.month })}
          {p.trial_active && p.trial_runs_free > 0 && <> · {t('plan.trialRuns', { used: p.trial_runs_used, total: p.trial_runs_free })}</>}
        </div>
        <div className="text-ink-soft" data-testid="plan-limits">
          {t('plan.notes', { used: p.notes_used, limit: p.notes_limit })} · {t('plan.storage', { used: fmtMb(p.bytes_used), limit: fmtMb(p.bytes_limit) })} · {p.tokens_limit === null ? t('plan.tokensUnlimited') : t('plan.tokens', { n: p.tokens_limit })} · {t('plan.retention', { days: p.retention_days })}
        </div>
        {subLine && (
          <div className="mt-2 border-t border-line pt-2" data-testid="plan-subscription">
            <div>{subLine}</div>
            {sub?.current_period_end && (
              <div className="text-ink-soft">
                {scheduled?.action === 'cancel' || sub.status === 'canceled'
                  ? t('plan.endsAt', { date: fmtDate(lang, scheduled?.effective_at ?? sub.current_period_end) })
                  : t('plan.renews', { date: fmtDate(lang, sub.current_period_end) })}
              </div>
            )}
            {sub?.provider === 'paddle' && sub.provider_customer_id && (
              <button type="button" className={`${btnGhost} mt-2`} onClick={portal} disabled={busy} data-testid="plan-manage">{t('plan.manage')}</button>
            )}
          </div>
        )}
        {showUpgrade && paddle && (
          <div className="mt-2 border-t border-line pt-2" data-testid="plan-upgrade">
            <div className="font-semibold">{t('plan.upgradeTitle')}</div>
            <p className="text-ink-soft">{t('plan.upgradeBody')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} onClick={() => buy(paddle.prices.year.id)} disabled={busy} data-testid="plan-buy-year">{t('plan.buyYear', { price: fmtPrice(paddle.prices.year.amount, paddle.prices.year.currency) })}</button>
              <button type="button" className={btnGhost} onClick={() => buy(paddle.prices.month.id)} disabled={busy} data-testid="plan-buy-month">{t('plan.buyMonth', { price: fmtPrice(paddle.prices.month.amount, paddle.prices.month.currency) })}</button>
            </div>
            {paddle.environment === 'sandbox' && <div className="mt-1 text-[12px] text-amber">{t('plan.sandbox')}</div>}
          </div>
        )}
        {!p.trial_active && p.plan === 'free' && !paddle && <div className="mt-1 text-[12px] text-ink-faint">{t('plan.upgradeHint')}</div>}
        {b?.error && <div className="mt-1 text-[12px] text-danger" data-testid="plan-billing-error">{b.error}</div>}
      </div>
    </section>
  );
}
