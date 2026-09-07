/* Paddle.js loader for the overlay checkout. The script is loaded on demand (only when a user opens the upgrade card),
   initialised once with the client token from /api/billing, and the checkout is opened with the workspace id as
   custom_data so the webhook can map the subscription back (src/paddle.ts translateWebhook). */
interface PaddleJs {
  Environment: { set: (env: 'sandbox' | 'production') => void };
  Initialize: (opts: { token: string; eventCallback?: (e: { name: string; data?: unknown }) => void }) => void;
  Checkout: { open: (opts: Record<string, unknown>) => void };
}
declare global { interface Window { Paddle?: PaddleJs } }
let loading: Promise<PaddleJs> | null = null;
let initialised = false;
export function loadPaddle(): Promise<PaddleJs> {
  if (window.Paddle) return Promise.resolve(window.Paddle);
  return (loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js'; s.async = true;
    s.onload = () => (window.Paddle ? resolve(window.Paddle) : reject(new Error('Paddle.js did not load')));
    s.onerror = () => reject(new Error('Paddle.js failed to load'));
    document.head.appendChild(s);
  }));
}
export async function openCheckout(cfg: { environment: 'sandbox' | 'production'; client_token: string; email: string; workspace_id: string }, priceId: string, onEvent: (name: string, detail?: string) => void) {
  const P = await loadPaddle();
  if (!initialised) {
    if (cfg.environment === 'sandbox') P.Environment.set('sandbox');
    P.Initialize({ token: cfg.client_token, eventCallback: e => {
      // Surface Paddle's own error detail (domain not approved, no default payment link, bad price...) instead of its generic dialog text
      const d = e.data as { error?: { detail?: string; code?: string }; detail?: string } | undefined;
      const detail = d?.error?.detail ?? d?.detail ?? (d?.error?.code ? String(d.error.code) : undefined);
      if (e.name === 'checkout.error' || e.name === 'checkout.payment-error') console.warn('Paddle', e.name, e.data);
      onEvent(e.name, detail);
    } });
    initialised = true;
  }
  P.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customer: { email: cfg.email },
    customData: { workspace_id: cfg.workspace_id },
    settings: { variant: 'one-page', displayMode: 'overlay', allowLogout: false, showAddDiscounts: true },
  });
}
