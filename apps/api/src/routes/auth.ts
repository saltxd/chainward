import { Hono } from 'hono';
import { getAuth } from '../lib/auth.js';

const auth = new Hono();

auth.all('/*', async (c) => {
  const betterAuth = getAuth();
  return betterAuth.handler(c.req.raw);
});

export { auth };
