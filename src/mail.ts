import { config } from './config.js';

export interface Mail { to: string; subject: string; text: string }

// Recently sent mail (for tests and development; production also keeps only the last 20 in memory).
export const outbox: Mail[] = [];

// With RESEND_API_KEY, send via the Resend REST API (no SDK dependency); otherwise print to the console.
export async function sendMail(mail: Mail): Promise<void> {
  outbox.push(mail);
  if (outbox.length > 20) outbox.shift();
  if (!config.resendApiKey) {
    console.log(`\n[mail → ${mail.to}] ${mail.subject}\n${mail.text}\n`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.resendApiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: config.mailFrom, to: [mail.to], subject: mail.subject, text: mail.text }),
  });
  if (!res.ok) throw new Error(`Resend 寄信失敗：${res.status} ${await res.text()}`);
}
