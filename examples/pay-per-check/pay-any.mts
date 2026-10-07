/**
 * Pay any ChainWard x402 resource once and print the result.
 *
 *   BUYER_PRIVATE_KEY=0x… npx tsx pay-any.mts "https://api.chainward.ai/api/risk/hires?agent=352475&chain=bsc"
 *
 * Works for every paid route in /.well-known/x402 (counterparty check, seller check, hire check, datasets).
 * The facilitator pays the gas; the wallet only needs USDC on Base. Not charged if the check fails.
 */
import { decodePaymentResponseHeader, wrapFetchWithPaymentFromConfig } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm';
import { privateKeyToAccount } from 'viem/accounts';
const raw = (process.env.BUYER_PRIVATE_KEY ?? '').replace(/[\s'"]/g, '').replace(/^0x/i, '');
if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error('BUYER_PRIVATE_KEY missing');
const account = privateKeyToAccount(`0x${raw}`);
const url = process.argv[2];
const pay = wrapFetchWithPaymentFromConfig(fetch, { schemes: [{ network: 'eip155:8453', client: new ExactEvmScheme(account) }] });
const t0 = Date.now();
const res = await pay(url);
const body = await res.text();
const receipt = res.headers.get('payment-response');
console.log(`payer ${account.address} status ${res.status} in ${((Date.now()-t0)/1000).toFixed(1)}s`);
if (receipt) { const s = decodePaymentResponseHeader(receipt); console.log(`settled tx ${s.transaction} on ${s.network} payer ${s.payer}`); }
console.log(body.slice(0, 300));
