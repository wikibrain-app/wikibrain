import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { config } from './config.js';
import { pool } from './db.js';
import { sendMail } from './mail.js';
import { ensureWorkspaceFor } from './workspaces.js';
import { track } from './events.js';
import { createAuthMiddleware } from 'better-auth/api';

// Web account system (PRD R1): email + password, verification mail, Google sign-in (enabled only with credentials).
// MCP-side Bearer token auth lives in auth.ts; both share user / workspace.
export const authOptions = {
  database: pool,
  baseURL: config.appUrl,
  secret: config.authSecret,
  trustedOrigins: [config.appUrl, 'http://localhost:5173', ...config.trustedOrigins],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      await sendMail({ to: user.email, subject: 'WikiBrain 重設密碼', text: `請點此連結重設密碼：\n${url}\n\n若非你本人操作請忽略本信。` });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({ to: user.email, subject: 'WikiBrain 信箱驗證', text: `歡迎使用 WikiBrain。請點此連結完成驗證：\n${url}` });
    },
  },
  /* Signing up with an address that already has an account: better-auth deliberately answers exactly as it would for a
     new address, so the form cannot be used to find out who has an account. The cost of that is a person who forgot
     they registered, sees "we sent you a verification e-mail", and waits for something that never comes. Telling the
     existing account by e-mail keeps the response identical and gives the person a way forward. */
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-up/email') return;
      const email = String((ctx.body as { email?: unknown } | undefined)?.email ?? '').trim().toLowerCase();
      if (!email) return;
      const { rows } = await pool.query<{ id: string }>(`SELECT id FROM "user" WHERE lower(email) = $1`, [email]);
      if (!rows.length) return;
      const al = ctx.headers?.get('accept-language') ?? '';
      const en = !!al && !/^\s*zh/i.test(al);
      void sendMail({
        to: email,
        subject: en ? 'You already have a WikiBrain account' : 'WikiBrain：你已有帳號',
        text: en
          ? `Someone (probably you) just tried to sign up for WikiBrain with this address, but it already has an account.\n\nTo sign in: ${config.appUrl}/login\nForgot the password? Reset it here: ${config.appUrl}/forgot\n\nIf this wasn't you, nothing has changed and you can ignore this message.`
          : `剛才有人（多半是你）用這個信箱註冊 WikiBrain，但它已經有帳號了。\n\n直接登入：${config.appUrl}/login\n忘記密碼？在這裡重設：${config.appUrl}/forgot\n\n如果不是你，什麼都沒有改變，忽略這封信即可。`,
      }).catch(e => console.error('existing-account notice failed:', e));
    }),
  },
  socialProviders: config.google ? { google: config.google } : {},
  user: { deleteUser: { enabled: true } }, // POST /api/auth/delete-user { password }; FKs cascade to workspace, notes, tokens, jobs
  databaseHooks: {
    user: {
      create: {
        after: async (user, ctx) => {
          const al = (ctx as { headers?: Headers } | undefined)?.headers?.get?.('accept-language') ?? '';
          const lang = !al ? 'zh-TW' : /^\s*zh/i.test(al) ? 'zh-TW' : 'en';
          const ws = await ensureWorkspaceFor(user.id, lang);
          track('signup', { userId: user.id, workspaceId: ws.id });
        },
      },
    },
  },
} satisfies BetterAuthOptions;

export const auth = betterAuth(authOptions);
export type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
