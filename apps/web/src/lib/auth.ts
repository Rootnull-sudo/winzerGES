import 'server-only';
import { db, schema } from '@winzer/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';

export const auth = betterAuth({
  database: drizzleAdapter(db(), {
    provider: 'pg',
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification }
  }),
  emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  // Límite de intentos (anti fuerza bruta). Solo se desactiva para E2E local: AUTH_RATE_LIMIT=off.
  rateLimit: { enabled: process.env.AUTH_RATE_LIMIT !== 'off' },
  plugins: [nextCookies()]
});
