/**
 * Put ChainWard on TermiX (BNB Chain) as a provider: handle, account + agent link, and the hire check listing.
 *
 *   TERMIX_PROVIDER_PRIVATE_KEY=0x… pnpm --filter @chainward/api exec tsx scripts/termix-provider.mts            # dry run (default)
 *   TERMIX_PROVIDER_PRIVATE_KEY=0x… pnpm --filter @chainward/api exec tsx scripts/termix-provider.mts --send     # do it
 *
 * Options: --price <USDT> (default 0.25), --mint-handle (also mint a NEW agent to claim the .agent handle; not recommended),
 *          --update (PATCH the existing listing's title, description, tags and price to match HIRE_CHECK_LISTING).
 * TREASURY_PRIVATE_KEY is read if TERMIX_PROVIDER_PRIVATE_KEY is unset. The key must own ERC-8004 agent 365669.
 *
 * Steps (docs/termix-provider.md):
 *   1. handle   TermiX handles ("<name>.agent") are set only when an agent is minted through TermiX. 365669 was
 *               minted outside TermiX, so TermiX indexed it with handle "365669". Claiming chainward.agent means
 *               minting a second agent (on-chain, gas); skipped unless --mint-handle.
 *   2. link     TermiX already lists 365669 under its owner address. Signing in with the owner key (off-chain,
 *               no gas) creates the TermiX account; the agent then shows under the account's agents.
 *   3. listing  "Set and Earn hire check", published (off-chain, no gas).
 * Nothing is printed that is secret: no key, no session token, no RPC URL.
 */
import { createPublicClient, createWalletClient, formatEther, http, parseAbi, toFunctionSelector, type Hex } from 'viem';
import { bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import {
  CHAINWARD_TERMIX_AGENT_TOKEN_ID,
  HIRE_CHECK_LISTING,
  TERMIX_API_BASE,
  TERMIX_MEASURED_GAS,
  TermixClient,
  termixItems,
} from '@chainward/common';

const REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;
const HANDLE_CANDIDATES = ['chainward', 'chainward-hire-check', 'chainward-ai', 'chainwardai'];
const registryAbi = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function register(string agentURI, (string key, bytes value)[] metadata) returns (uint256 agentId)',
]);
const REGISTER_SELECTORS = new Set([toFunctionSelector('register(string)'), toFunctionSelector('register(string,(string,bytes)[])')]);

const args = process.argv.slice(2);
const send = args.includes('--send');
if (send && args.includes('--dry-run')) throw new Error('pass --send or --dry-run, not both');
const mintHandle = args.includes('--mint-handle');
const priceArg = args.includes('--price') ? args[args.indexOf('--price') + 1] : undefined;
const price = priceArg ?? HIRE_CHECK_LISTING.basePrice;
if (!/^\d+(\.\d{1,6})?$/.test(price) || Number(price) <= 0) throw new Error('--price must be a positive USDT amount like 0.25');

const raw = (process.env.TERMIX_PROVIDER_PRIVATE_KEY ?? process.env.TREASURY_PRIVATE_KEY ?? '').replace(/[\s'"]/g, '').replace(/^0x/i, '');
if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error('set TERMIX_PROVIDER_PRIVATE_KEY (or TREASURY_PRIVATE_KEY): 64 hex chars');
const account = privateKeyToAccount(`0x${raw}` as Hex);
const rpc = process.env.BSC_RPC_URL || 'https://bsc-dataseed.bnbchain.org';
const pub = createPublicClient({ chain: bsc, transport: http(rpc) });
const api = new TermixClient({
  baseUrl: process.env.TERMIX_API_BASE || TERMIX_API_BASE.bsc,
  signer: { address: account.address, signMessage: (message) => account.signMessage({ message }) },
});
const mode = send ? 'SEND' : 'DRY RUN';
const say = (line = '') => console.log(line);
const bnb = (wei: bigint) => `${formatEther(wei)} BNB`;

// ── preflight (read-only) ─────────────────────────────────────────────────────
say(`termix-provider (${mode})  wallet ${account.address}  agent ${CHAINWARD_TERMIX_AGENT_TOKEN_ID}`);
const [chainId, owner, balance, gasPrice] = await Promise.all([
  pub.getChainId(),
  pub.readContract({ address: REGISTRY, abi: registryAbi, functionName: 'ownerOf', args: [BigInt(CHAINWARD_TERMIX_AGENT_TOKEN_ID)] }),
  pub.getBalance({ address: account.address }),
  pub.getGasPrice(),
]);
if (chainId !== 56) throw new Error(`RPC is chain ${chainId}, not BNB Chain`);
if (owner.toLowerCase() !== account.address.toLowerCase()) {
  throw new Error(`agent ${CHAINWARD_TERMIX_AGENT_TOKEN_ID} is owned by ${owner}, not this key's ${account.address}`);
}
say(`  BSC: owner check ok, balance ${bnb(balance)}, gas price ${Number(gasPrice) / 1e9} gwei`);

const config = await api.contractsConfig();
if (config.chainId !== 56) throw new Error(`TermiX backend reports chain ${config.chainId}`);
const usdt = config.settlementCurrencies.find((c) => c.symbol === 'USDT');
if (!usdt) throw new Error('TermiX lists no USDT settlement on BNB Chain');
say(`  TermiX: chain 56, USDT escrow ${usdt.contracts.escrow}, protocol fee ${usdt.protocolFeeBps / 100}%, provider stake lock ${usdt.providerLockBps ?? 'unknown'} bps`);

const storefront = (await api.agentByHandle(CHAINWARD_TERMIX_AGENT_TOKEN_ID)).seller;
if (!storefront?.id) throw new Error(`TermiX does not list agent ${CHAINWARD_TERMIX_AGENT_TOKEN_ID} yet; its indexer may be behind`);
say(
  `  TermiX lists agent ${CHAINWARD_TERMIX_AGENT_TOKEN_ID} as ${storefront.id} ("${storefront.displayName ?? ''}"), owner ${storefront.ownerAddress}, ` +
    `account ${storefront.accountId ? storefront.accountId : 'none yet'}, presence ${storefront.presence ?? 'unknown'}`,
);
if (storefront.ownerAddress?.toLowerCase() !== account.address.toLowerCase()) throw new Error('TermiX has a different owner for the agent');

// ── 1. handle ─────────────────────────────────────────────────────────────────
say();
say('1. handle');
let handle: string | null = null;
for (const name of HANDLE_CANDIDATES) {
  const r = await api.nameAvailability(name);
  say(`  ${r.normalized}: ${r.available ? 'available' : 'taken'}`);
  if (r.available && !handle) handle = name;
}
const sampleUri = 'https://termix-platform-prod.s3.ap-southeast-1.amazonaws.com/platform/agents/' + '0'.repeat(64) + '.json';
const mintGas = await pub.estimateContractGas({ address: REGISTRY, abi: registryAbi, functionName: 'register', args: [sampleUri, []], account });
say(
  `  The handle is set only by minting through TermiX (POST /agents/prepare, then register on ${REGISTRY}). ` +
    `Agent ${CHAINWARD_TERMIX_AGENT_TOKEN_ID} was minted outside TermiX, so its storefront handle is "${CHAINWARD_TERMIX_AGENT_TOKEN_ID}".`,
);
say(`  Claiming ${handle ? `${handle}.agent` : 'a handle'} = a second ERC-8004 agent: ~${mintGas} gas, ~${bnb(mintGas * gasPrice)} at the current price.`);
if (!mintHandle) {
  say('  Skipped (recommended): hires, reputation and the Set and Earn record stay on one agent. Pass --mint-handle to mint anyway.');
}

// ── 2. account + agent link ───────────────────────────────────────────────────
say();
say('2. link agent 365669 to a TermiX account');
if (!send) {
  say(`  Would sign in: POST /api/v1/auth/nonce, personal_sign of the returned message, POST /api/v1/auth/wallet. Off-chain, 0 gas.`);
  say(`  ${storefront.accountId ? 'The account exists already.' : 'First sign-in creates the TermiX account for this wallet (that is the registration).'}`);
  say(`  Then GET /api/v1/agents must list agent ${CHAINWARD_TERMIX_AGENT_TOKEN_ID} (${storefront.id}).`);
} else {
  const login = await api.login();
  say(`  signed in: account ${login.accountId ?? 'unknown'}${login.isNewAccount ? ' (new)' : ''}`);
  const owned = termixItems<{ id: string; agentTokenId?: string; name?: string }>(await api.myAgents());
  const ours = owned.find((a) => a.agentTokenId === CHAINWARD_TERMIX_AGENT_TOKEN_ID || a.id === storefront.id);
  say(`  owned agents: ${owned.map((a) => `${a.agentTokenId ?? '?'} (${a.id})`).join(', ') || 'none'}`);
  if (!ours) {
    throw new Error(
      `signed in, but TermiX does not list agent ${CHAINWARD_TERMIX_AGENT_TOKEN_ID} under this account. ` +
        'Do not mint: ask TermiX to attach the indexed agent, or check again after their indexer catches up.',
    );
  }
}

if (mintHandle && handle) {
  say();
  say(`1b. mint a new agent for ${handle}.agent`);
  if (!send) {
    say(`  Would POST /api/v1/agents/prepare {name: "${handle}", category: "Security & Verification"} and send its register call (~${bnb(mintGas * gasPrice)}).`);
  } else {
    const prep = await api.request<{ contract?: string; to?: string; callData?: string; data?: string }>('POST', '/api/v1/agents/prepare', {
      body: {
        name: handle,
        displayName: 'ChainWard',
        category: 'Security & Verification',
        description: 'On-chain checks for BNB Chain agents: the Set and Earn hire check. Never a safety verdict.',
        tags: ['set-and-earn', 'erc-8004', 'hire-check'],
      },
    });
    const to = prep.contract ?? prep.to;
    const data = (prep.callData ?? prep.data ?? '') as Hex;
    if (to?.toLowerCase() !== REGISTRY.toLowerCase() || !REGISTER_SELECTORS.has(data.slice(0, 10) as Hex)) {
      throw new Error('TermiX prepare did not return a register call on the ERC-8004 registry; not signing');
    }
    const gas = (await pub.estimateGas({ account, to: REGISTRY, data })) * 12n / 10n;
    if (balance < gas * gasPrice) throw new Error('not enough BNB for the mint');
    const wallet = createWalletClient({ account, chain: bsc, transport: http(rpc) });
    const hash = await wallet.sendTransaction({ to: REGISTRY, data, value: 0n, gas });
    say(`  sent ${hash}`);
    const receipt = await pub.waitForTransactionReceipt({ hash });
    say(`  status ${receipt.status}, block ${receipt.blockNumber}; poll GET /api/v1/agents/by-tx/${hash} until CONFIRMED`);
  }
}

// ── 3. listing ────────────────────────────────────────────────────────────────
say();
say('3. listing');
const body = { ...HIRE_CHECK_LISTING, basePrice: price };
const existing = termixItems<{ id: string; title?: string; skillTag?: string; status?: string; basePrice?: string; currency?: string }>(
  await api.agentServices(storefront.id),
).find((l) => l.skillTag === body.skillTag || l.title === body.title);
const fee = (Number(price) * usdt.protocolFeeBps) / 10_000;
say(`  "${body.title}" at ${price} ${body.currency}: TermiX keeps ${fee.toFixed(4)}, we receive ${(Number(price) - fee).toFixed(4)} ${body.currency} per settled order.`);
const update = args.includes('--update');
if (existing && update) {
  const patch = { title: body.title, description: body.description, tags: body.tags, basePrice: body.basePrice };
  if (!send) {
    say(`  Would PATCH /api/v1/listings/${existing.id} (off-chain, 0 gas) with title, description, tags, basePrice:`);
    say(JSON.stringify(patch, null, 2).replace(/^/gm, '    '));
  } else {
    const updated = await api.updateListing(existing.id, patch);
    say(`  updated ${updated.id} (${updated.status ?? '?'}): "${body.title}"`);
  }
} else if (existing) {
  say(`  Already listed: ${existing.id} (${existing.status ?? '?'}, ${existing.basePrice ?? '?'} ${existing.currency ?? ''}). Nothing to post; --update rewrites it.`);
} else if (!send) {
  say(`  Would POST /api/v1/agents/${storefront.id}/services, then POST /api/v1/listings/<id>/publish. Off-chain, 0 gas. Body:`);
  say(JSON.stringify(body, null, 2).replace(/^/gm, '    '));
} else {
  const created = await api.createListing(storefront.id, body);
  say(`  created ${created.id} (${created.status ?? 'DRAFT'})`);
  const published = await api.publishListing(created.id);
  say(`  published ${published.id} (${published.status ?? '?'})`);
}

// ── what running it costs ─────────────────────────────────────────────────────
say();
const perJob = TERMIX_MEASURED_GAS.acceptOrder + TERMIX_MEASURED_GAS.submitDelivery;
const withClaim = perJob + TERMIX_MEASURED_GAS.claimAfterTimeout;
say('Per order, paid by this wallet in BNB (gas measured on the BSC escrows):');
say(`  acceptOrder ${TERMIX_MEASURED_GAS.acceptOrder} + submitDelivery ${TERMIX_MEASURED_GAS.submitDelivery} = ${perJob} gas, ~${bnb(perJob * gasPrice)}`);
say(`  + claimAfterTimeout ${TERMIX_MEASURED_GAS.claimAfterTimeout} when the buyer never releases = ${withClaim} gas, ~${bnb(withClaim * gasPrice)}`);
say(`  The current balance covers ~${(balance / (withClaim * gasPrice)).toString()} orders with a claim, ~${(balance / (perJob * gasPrice)).toString()} without.`);
say();
say(send ? 'Done. Turn the worker on: termixProvider.enabled=true + TERMIX_PROVIDER_PRIVATE_KEY in chainward-secrets.' : 'Dry run only; nothing was signed or sent. Pass --send to do it.');
