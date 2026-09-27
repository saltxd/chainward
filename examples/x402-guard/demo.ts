/**
 * demo — two local x402 sellers, one buyer with counterpartyGuard.
 *
 * Seller A's payTo carries a high-severity ChainWard attestation on Base; seller
 * B's doesn't. The guard refuses A before anything is signed and lets B through.
 * The buyer is a fresh key with no funds, so B's payment is then refused by the
 * facilitator; with a funded wallet it would settle. No money moves either way.
 *
 *   npm install && npx tsx demo.ts
 */
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { paymentMiddleware, x402ResourceServer } from '@x402/hono';
import { ExactEvmScheme as ServerExactEvm } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { counterpartyGuard } from './guard.js';

const SELLERS = [
  { name: 'A', port: 4021, payTo: '0x4baaDbA26C3C0bdEf9E8fAf173925d463aA53BB2' },
  { name: 'B', port: 4022, payTo: '0x999A1B6033998A05F7e37e4BD471038dF46624E1' },
];

function startSeller(payTo: string, port: number) {
  const facilitator = new HTTPFacilitatorClient({ url: 'https://facilitator.payai.network' });
  const server = new x402ResourceServer(facilitator).register('eip155:8453', new ServerExactEvm());
  const app = new Hono();
  app.use(
    paymentMiddleware(
      { 'GET /data': { accepts: { scheme: 'exact', price: '$0.01', network: 'eip155:8453', payTo } } },
      server,
    ),
  );
  app.get('/data', (c) => c.json({ data: 'paid content' }));
  return serve({ fetch: app.fetch, port });
}

async function main(): Promise<void> {
  const servers = SELLERS.map((s) => startSeller(s.payTo, s.port));

  const buyer = privateKeyToAccount(generatePrivateKey());
  const client = new x402Client().register('eip155:8453', new ExactEvmScheme(buyer));
  client.onBeforePaymentCreation(
    counterpartyGuard({
      onDecision: (v, allowed) =>
        console.log(`  guard: ${v.address} → ${v.status}${v.band ? ` (${v.band})` : ''} → ${allowed ? 'pay' : 'refuse'}`),
    }),
  );
  const pay = wrapFetchWithPayment(fetch, client);

  for (const s of SELLERS) {
    console.log(`\nseller ${s.name} (payTo ${s.payTo}):`);
    try {
      const res = await pay(`http://localhost:${s.port}/data`);
      const challenge = res.headers.get('payment-required');
      const reason = challenge ? JSON.parse(Buffer.from(challenge, 'base64').toString()).error : null;
      console.log(`  seller answered ${res.status}${reason ? ` (${reason}: the demo wallet has no USDC)` : ''}`);
    } catch (err) {
      console.log(`  payment refused before signing: ${(err as Error).message}`);
    }
  }
  servers.forEach((s) => s.close());
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
