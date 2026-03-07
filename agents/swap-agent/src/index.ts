/**
 * ChainWard Swap Agent — Autonomous round-trip swap agent on Base mainnet.
 *
 * Executes randomized ETH<->USDC swap cycles via Aerodrome to generate
 * on-chain activity for ChainWard to monitor. Uses viem — no CDP dependency.
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
  formatUnits,
  encodeFunctionData,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

// --- Config ---
const PRIVATE_KEY = process.env.PRIVATE_KEY as Hex;
if (!PRIVATE_KEY) {
  console.error("PRIVATE_KEY env var required");
  process.exit(1);
}

const RPC_URL = process.env.RPC_URL ?? "https://mainnet.base.org";
const MAX_CYCLES = parseInt(process.env.MAX_CYCLES ?? "10", 10);
const MIN_ETH_BALANCE = 0.0002;
const SWAP_AMOUNT_MIN = 0.00005;
const SWAP_AMOUNT_MAX = 0.00015;
const INTERVAL_MIN_MS = 60 * 60 * 1000; // 1 hour
const INTERVAL_MAX_MS = 2 * 60 * 60 * 1000; // 2 hours
const COOLDOWN_MIN_MS = 120_000; // 2 minutes
const COOLDOWN_MAX_MS = 180_000; // 3 minutes

// --- Contracts ---
const AERODROME_ROUTER = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as const;
const WETH = "0x4200000000000000000000000000000000000006" as const;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const AERODROME_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da" as const;

// Aerodrome Router ABI (only the functions we need)
const routerAbi = [
  {
    name: "swapExactETHForTokens",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "amountOutMin", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "stable", type: "bool" },
          { name: "factory", type: "address" },
        ],
      },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    name: "swapExactTokensForETH",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "stable", type: "bool" },
          { name: "factory", type: "address" },
        ],
      },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    name: "getAmountsOut",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "stable", type: "bool" },
          { name: "factory", type: "address" },
        ],
      },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
] as const;

const erc20Abi = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// --- Setup ---
const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: base, transport: http(RPC_URL) });

const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Swap functions ---

async function getEthBalance(): Promise<number> {
  const balance = await publicClient.getBalance({ address: account.address });
  return parseFloat(formatEther(balance));
}

async function getUsdcBalance(): Promise<bigint> {
  return publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
}

async function swapEthToUsdc(amountEth: number): Promise<string> {
  const amountIn = parseEther(amountEth.toFixed(18));
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800); // 30 min
  const route = [{ from: WETH, to: USDC, stable: false, factory: AERODROME_FACTORY }];

  // Get expected output
  const amounts = await publicClient.readContract({
    address: AERODROME_ROUTER,
    abi: routerAbi,
    functionName: "getAmountsOut",
    args: [amountIn, route],
  });
  const expectedOut = amounts[amounts.length - 1];
  const minOut = (expectedOut * 95n) / 100n; // 5% slippage

  log(`Swapping ${amountEth.toFixed(6)} ETH → USDC (min out: ${formatUnits(minOut, 6)} USDC)`);

  const hash = await walletClient.sendTransaction({
    to: AERODROME_ROUTER,
    value: amountIn,
    data: encodeFunctionData({
      abi: routerAbi,
      functionName: "swapExactETHForTokens",
      args: [minOut, route, account.address, deadline],
    }),
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  log(`ETH→USDC tx: ${hash} (status: ${receipt.status})`);
  return hash;
}

async function swapUsdcToEth(amountUsdc: bigint): Promise<string> {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
  const route = [{ from: USDC, to: WETH, stable: false, factory: AERODROME_FACTORY }];

  // Check and set allowance
  const allowance = await publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, AERODROME_ROUTER],
  });

  if (allowance < amountUsdc) {
    log("Approving USDC for Aerodrome Router...");
    const approveHash = await walletClient.writeContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "approve",
      args: [AERODROME_ROUTER, 2n ** 256n - 1n],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    log(`Approval tx: ${approveHash}`);
  }

  // Get expected output
  const amounts = await publicClient.readContract({
    address: AERODROME_ROUTER,
    abi: routerAbi,
    functionName: "getAmountsOut",
    args: [amountUsdc, route],
  });
  const expectedOut = amounts[amounts.length - 1];
  const minOut = (expectedOut * 95n) / 100n; // 5% slippage

  log(`Swapping ${formatUnits(amountUsdc, 6)} USDC → ETH (min out: ${formatEther(minOut)} ETH)`);

  const hash = await walletClient.writeContract({
    address: AERODROME_ROUTER,
    abi: routerAbi,
    functionName: "swapExactTokensForETH",
    args: [amountUsdc, minOut, route, account.address, deadline],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  log(`USDC→ETH tx: ${hash} (status: ${receipt.status})`);
  return hash;
}

// --- Main loop ---

let shutdownRequested = false;
process.on("SIGTERM", () => {
  log("Shutdown signal received, finishing current cycle...");
  shutdownRequested = true;
});
process.on("SIGINT", () => {
  log("Shutdown signal received, finishing current cycle...");
  shutdownRequested = true;
});

async function main() {
  log(`Swap agent starting — wallet: ${account.address}`);
  log(`Max cycles: ${MAX_CYCLES === 0 ? "unlimited" : MAX_CYCLES}`);

  let cycle = 0;

  while (!shutdownRequested) {
    cycle++;
    if (MAX_CYCLES > 0 && cycle > MAX_CYCLES) {
      log(`Completed ${MAX_CYCLES} cycles, exiting.`);
      break;
    }

    const ethBalance = await getEthBalance();
    log(`--- Cycle ${cycle} | ETH balance: ${ethBalance.toFixed(6)} ---`);

    if (ethBalance < MIN_ETH_BALANCE) {
      log(`Balance too low (${ethBalance.toFixed(6)} < ${MIN_ETH_BALANCE}), stopping.`);
      break;
    }

    try {
      // Step 1: ETH → USDC
      const swapAmount = randomBetween(SWAP_AMOUNT_MIN, SWAP_AMOUNT_MAX);
      await swapEthToUsdc(swapAmount);

      // Cooldown
      const cooldown = randomBetween(COOLDOWN_MIN_MS, COOLDOWN_MAX_MS);
      log(`Waiting ${(cooldown / 1000).toFixed(0)}s before swap-back...`);
      await sleep(cooldown);

      if (shutdownRequested) break;

      // Step 2: USDC → ETH (swap back full USDC balance)
      const usdcBalance = await getUsdcBalance();
      if (usdcBalance > 0n) {
        await swapUsdcToEth(usdcBalance);
      } else {
        log("No USDC balance to swap back");
      }
    } catch (err) {
      log(`Error in cycle ${cycle}: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (shutdownRequested) break;

    // Sleep between cycles
    const interval = randomBetween(INTERVAL_MIN_MS, INTERVAL_MAX_MS);
    log(`Sleeping ${(interval / 3_600_000).toFixed(1)}h until next cycle...\n`);
    await sleep(interval);
  }

  log("Agent stopped.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
