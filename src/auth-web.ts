import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { config } from './config.js';
import { pool } from './db.js';
import { sendMail } from './mail.js';
import { ensureWorkspaceFor } from './workspaces.js';
import { track } from './events.js';

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
