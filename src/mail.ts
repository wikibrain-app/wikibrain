import { config } from './config.js';
import { track } from './events.js';

export interface Mail { to: string; subject: string; text: string }

// Recently sent mail (for tests and development; production also keeps only the last 20 in memory).
export const outbox: Mail[] = [];

// With RESEND_API_KEY, send via the Resend REST API (no SDK dependency); otherwise print to the console.
export async function sendMail(mail: Mail): Promise<void> {
  outbox.push(mail);
  if (outbox.length > 20) outbox.shift();
  track('email', {}, { subject: mail.subject }); // counted for capacity planning (Resend quota)
  if (!config.resendApiKey) {
    console.log(`\n[mail → ${mail.to}] ${mail.subject}\n${mail.text}\n`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.resendApiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: config.mailFrom, to: [mail.to], subject: mail.subject, text: mail.text }),
  });
  if (!res.ok) {
    /* A failure here means someone is waiting for a verification or reset link that will never arrive, and they have
       no way to tell. Record it so it shows up on the operator page instead of only in the logs. */
    const detail = `${res.status} ${(await res.text()).slice(0, 200)}`;
    track('email_failed', {}, { subject: mail.subject, to: mail.to, detail });
    throw new Error(`Resend 寄信失敗：${detail}`);
  }
}
