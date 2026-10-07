/**
 * Hand an ERC-8004 agent on BSC to a dedicated hot wallet and fund it with BNB.
 *
 *   FROM_PRIVATE_KEY=0x… TO_ADDRESS=0x… AGENT_ID=365669 pnpm --filter @chainward/api exec tsx scripts/erc8004-handoff.mts [--send] [--fund 0.001]
 *
 * Dry run by default. Keys come from the environment and are never printed.
 */
import { createPublicClient, createWalletClient, http, parseAbi, parseEther, formatEther, type Hex } from 'viem';
import { bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;
const abi = parseAbi(['function transferFrom(address from, address to, uint256 tokenId)', 'function ownerOf(uint256 tokenId) view returns (address)']);
const raw = (process.env.FROM_PRIVATE_KEY ?? '').replace(/[\s'"]/g, '').replace(/^0x/i, '');
if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error('set FROM_PRIVATE_KEY');
const to = (process.env.TO_ADDRESS ?? '') as Hex;
if (!/^0x[0-9a-fA-F]{40}$/.test(to)) throw new Error('set TO_ADDRESS');
const agentId = BigInt(process.env.AGENT_ID ?? '365669');
const fundArg = process.argv.indexOf('--fund');
const fund = fundArg > 0 ? parseEther(process.argv[fundArg + 1]!) : 0n;
const send = process.argv.includes('--send');
const account = privateKeyToAccount(`0x${raw}` as Hex);
const rpc = process.env.BSC_RPC_URL ?? 'https://bsc-dataseed.bnbchain.org';
const pub = createPublicClient({ chain: bsc, transport: http(rpc) });
const wallet = createWalletClient({ account, chain: bsc, transport: http(rpc) });

const owner = await pub.readContract({ address: REGISTRY, abi, functionName: 'ownerOf', args: [agentId] });
const bal = await pub.getBalance({ address: account.address });
console.log(`agent ${agentId} owner ${owner}  from ${account.address} (${formatEther(bal)} BNB)  to ${to}  fund ${formatEther(fund)} BNB`);
if (owner.toLowerCase() !== account.address.toLowerCase()) throw new Error('from wallet does not own the agent');
const gas = await pub.estimateContractGas({ address: REGISTRY, abi, functionName: 'transferFrom', args: [account.address, to, agentId], account });
console.log(`transferFrom gas ${gas}`);
if (!send) { console.log('dry run; pass --send'); process.exit(0); }
const h1 = await wallet.writeContract({ address: REGISTRY, abi, functionName: 'transferFrom', args: [account.address, to, agentId], gas });
const r1 = await pub.waitForTransactionReceipt({ hash: h1 });
console.log(`transfer ${h1} ${r1.status}`);
if (fund > 0n) {
  const h2 = await wallet.sendTransaction({ to, value: fund });
  const r2 = await pub.waitForTransactionReceipt({ hash: h2 });
  console.log(`fund ${h2} ${r2.status}`);
}
console.log(`new owner ${await pub.readContract({ address: REGISTRY, abi, functionName: 'ownerOf', args: [agentId] })}`);
