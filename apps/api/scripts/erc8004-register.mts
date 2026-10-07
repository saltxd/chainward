/**
 * Register ChainWard as an ERC-8004 agent on BNB Smart Chain.
 *
 *   REGISTRAR_PRIVATE_KEY=0x… pnpm --filter @chainward/api exec tsx scripts/erc8004-register.mts            # dry run: estimates gas, prints nothing secret
 *   REGISTRAR_PRIVATE_KEY=0x… pnpm --filter @chainward/api exec tsx scripts/erc8004-register.mts --send     # sends register(agentURI, metadata)
 *
 * Registry 0x8004A169… (the one TermiX and the Set and Earn campaign use). The agent
 * card lives at https://chainward.ai/.well-known/erc8004-agent.json. The key is read
 * from the environment and never printed.
 */
import { createPublicClient, createWalletClient, http, parseAbi, stringToHex, formatEther, type Hex } from 'viem';
import { bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;
const AGENT_URI = 'https://chainward.ai/.well-known/erc8004-agent.json';
const abi = parseAbi([
  'function register(string agentURI, (string key, bytes value)[] metadata) returns (uint256 agentId)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
]);

const raw = (process.env.REGISTRAR_PRIVATE_KEY ?? '').replace(/[\s'"]/g, '').replace(/^0x/i, '');
if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error('set REGISTRAR_PRIVATE_KEY (64 hex chars)');
const account = privateKeyToAccount(`0x${raw}` as Hex);
const rpc = process.env.BSC_RPC_URL ?? 'https://bsc-dataseed.bnbchain.org';
const pub = createPublicClient({ chain: bsc, transport: http(rpc) });
const send = process.argv.includes('--send');

const card = await fetch(AGENT_URI).then((r) => r.json()).catch(() => null);
if (!card?.name) throw new Error(`agent card not reachable at ${AGENT_URI}; deploy the web app first`);

const balance = await pub.getBalance({ address: account.address });
const metadata = [{ key: 'agentWallet', value: stringToHex(account.address) }];
const gas = await pub.estimateContractGas({ address: REGISTRY, abi, functionName: 'register', args: [AGENT_URI, metadata], account });
const gasPrice = await pub.getGasPrice();
console.log(`registrar ${account.address}  BNB ${formatEther(balance)}  gas ${gas}  cost ~${formatEther(gas * gasPrice)} BNB`);
if (!send) { console.log('dry run only; pass --send to register'); process.exit(0); }
if (balance < gas * gasPrice) throw new Error('not enough BNB for gas');

const wallet = createWalletClient({ account, chain: bsc, transport: http(rpc) });
const hash = await wallet.writeContract({ address: REGISTRY, abi, functionName: 'register', args: [AGENT_URI, metadata], gas });
console.log(`sent ${hash}`);
const receipt = await pub.waitForTransactionReceipt({ hash });
const log = receipt.logs.find((l) => l.address.toLowerCase() === REGISTRY.toLowerCase() && l.topics.length >= 3);
const agentId = log?.topics[1] ? BigInt(log.topics[1]).toString() : 'unknown';
console.log(`status ${receipt.status}  block ${receipt.blockNumber}  agentId ${agentId}`);
