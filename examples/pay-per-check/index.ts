/**
 * pay-per-check — buy a fresh ChainWard risk report for any Base address over
 * x402: 0.05 USDC on Base per check, no account or API key. The facilitator
 * pays the gas; the wallet only needs the USDC. Not charged if the check fails.
 *
 *   cd examples/pay-per-check && npm install
 *   BUYER_PRIVATE_KEY=0x… npx tsx index.ts 0x…
 *
 * Docs: docs/ATTEST.md#pay-per-check-x402
 */
import { decodePaymentResponseHeader, wrapFetchWithPaymentFromConfig } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm';
import { getAddress, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const API = process.env.CHAINWARD_API ?? 'https://api.chainward.ai';

async function main(): Promise<void> {
  const target = getAddress(process.argv[2] ?? '');
  const key = process.env.BUYER_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new Error('set BUYER_PRIVATE_KEY (a Base wallet holding a little USDC)');

  const pay = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: 'eip155:8453', client: new ExactEvmScheme(privateKeyToAccount(key)) }],
  });
  const res = await pay(`${API}/api/risk/x402?address=${target}`);
  const body = await res.json();
  if (res.status === 402) {
    // Payment was refused (e.g. invalid_exact_evm_insufficient_balance); the reason rides in the header.
    const challenge = res.headers.get('payment-required');
    const reason = challenge ? JSON.parse(Buffer.from(challenge, 'base64').toString()).error : 'unknown';
    throw new Error(`payment not accepted: ${reason}`);
  }
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(body)}`);

  const receipt = res.headers.get('payment-response');
  if (receipt) {
    const settled = decodePaymentResponseHeader(receipt);
    console.log(`paid · tx ${settled.transaction} on ${settled.network}`);
  }

  const { status, report } = body.data;
  if (status !== 'ready') {
    console.log(`${target}: ${status}`);
    return;
  }
  console.log(`${target}: ${report.band} as of block ${report.freshness.as_of_block}`);
  for (const f of report.flags) console.log(`  [${f.severity}] ${f.title}: ${f.evidence}`);
  if (report.attestation) console.log(`  attested on Base: ${report.attestation.explorer_url}`);
  console.log(`  ${report.disclaimer}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
