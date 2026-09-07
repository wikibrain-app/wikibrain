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
export async function openCheckout(cfg: { environment: 'sandbox' | 'production'; client_token: string; email: string; workspace_id: string }, priceId: string, onEvent: (name: string) => void) {
  const P = await loadPaddle();
  if (!initialised) {
    if (cfg.environment === 'sandbox') P.Environment.set('sandbox');
    P.Initialize({ token: cfg.client_token, eventCallback: e => onEvent(e.name) });
    initialised = true;
  }
  P.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customer: { email: cfg.email },
    customData: { workspace_id: cfg.workspace_id },
    settings: { variant: 'one-page', displayMode: 'overlay', allowLogout: false, locale: document.documentElement.lang.startsWith('zh') ? 'zh-Hant' : 'en', showAddDiscounts: true },
  });
}
