/**
 * One-shot bootstrap: deploy the Privy/Alchemy Modular-Account-v2 (sma-b) smart
 * wallet on Base mainnet via an EIP-7702 designation, bypassing the buggy
 * @virtuals-protocol/acp-node-v2@0.0.6 path.
 *
 * Strategy
 * --------
 * The Privy wallet at WALLET_ADDRESS is a P256-controlled EOA. Privy + Alchemy
 * use **EIP-7702** delegation to the Semi-Modular-Account-Bytecode (sma-b)
 * implementation at 0x69007702764179f14F51cdce752f4f775d74E139.
 *
 * 1. Build a viem Account via @privy-io/node createViemAccount — this exposes a
 *    working signAuthorization() that internally calls
 *    POST /v1/wallets/{id}/rpc with method=secp256k1_sign7702Authorization.
 * 2. Sign an authorization tuple (chainId=8453, contract=sma-b, nonce=0).
 * 3. Submit ONE userOperation through Pimlico's bundler on Base, attaching the
 *    7702 auth in `eip7702Auth`. Pimlico's verifying paymaster sponsors gas,
 *    so the wallet needs zero ETH.
 * 4. Wait for the userOp receipt, then verify code at the EOA (should be the
 *    7702 delegation prefix 0xef0100 + impl address).
 *
 * After this runs once, subsequent acp-node-v2 calls see code at the address
 * and skip the EIP-7702 auth path that triggers the SDK bug — userOp count
 * becomes 1, no auth, the buggy branch is never taken.
 *
 * Env required
 * ------------
 *   WALLET_ADDRESS               0x55a24a57cc662e180c5bb2e0f4ee2496f5ab7127
 *   WALLET_ID                    t28edruo4nzkhdbzt8csicyb
 *   WALLET_SIGNER_PRIVATE_KEY    base64 PKCS8 P256 (184 chars)
 *   PRIVY_APP_ID                 cmgcfzljw00caks0c5dj6t9mu
 *   PRIVY_APP_SECRET             from Privy dashboard
 *   PIMLICO_API_KEY              from https://dashboard.pimlico.io
 *   BASE_RPC_URL                 (optional) any Base RPC; default public
 *
 * Run
 * ---
 *   pnpm tsx scripts/deploy-smart-wallet.ts
 *
 * Cost: 0 ETH (Pimlico paymaster sponsors, free tier covers this).
 */

import { PrivyClient } from "@privy-io/node";
import { createViemAccount } from "@privy-io/node/viem";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { base } from "viem/chains";

// ---------- constants ----------
const SMA_B_7702_IMPL: Address = "0x69007702764179f14F51cdce752f4f775d74E139";
const ENTRYPOINT_V08: Address = "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108"; // ERC-4337 v0.8 (MA-v2 default). Use v0.7 0x0000000071727De22E5E9d8BAf0edAc6f37da032 if Pimlico mismatches.
const CHAIN_ID = 8453;

// MA-v2 SemiModularAccountBytecode `executeUserOp(bytes,bytes32)` is invoked
// implicitly; we pack a no-op execute via the standard `execute` selector.
// ABI for SemiModularAccountStorage / Bytecode `execute(target,value,data)`.
const accountAbi = parseAbi([
  "function execute(address target, uint256 value, bytes data) external",
]);

// ---------- env ----------
function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}
const WALLET_ADDRESS = need("WALLET_ADDRESS") as Address;
const WALLET_ID = need("WALLET_ID");
const PRIVY_APP_ID = need("PRIVY_APP_ID");
const PRIVY_APP_SECRET = need("PRIVY_APP_SECRET");
const SIGNER_KEY = need("WALLET_SIGNER_PRIVATE_KEY"); // base64 PKCS8
const PIMLICO_API_KEY = need("PIMLICO_API_KEY");
const BASE_RPC_URL = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

const PIMLICO_RPC = `https://api.pimlico.io/v2/${CHAIN_ID}/rpc?apikey=${PIMLICO_API_KEY}`;

// ---------- clients ----------
const publicClient = createPublicClient({
  chain: base,
  transport: http(BASE_RPC_URL),
});

const privy = new PrivyClient({
  appId: PRIVY_APP_ID,
  appSecret: PRIVY_APP_SECRET,
});

// authorizationContext = the Privy authorization signature scheme (P256 PKCS8 base64)
const authorizationContext = {
  authorization_private_keys: [SIGNER_KEY],
};

const account = createViemAccount(privy as any, {
  walletId: WALLET_ID,
  address: WALLET_ADDRESS,
  authorizationContext,
});

// ---------- helpers ----------
async function rpc<T = any>(url: string, method: string, params: any[]): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = (await res.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result as T;
}

const toHexBig = (n: bigint): Hex => `0x${n.toString(16)}` as Hex;

// ---------- main ----------
async function main() {
  // 0. short-circuit if already deployed
  const existing = await publicClient.getBytecode({ address: WALLET_ADDRESS });
  if (existing && existing !== "0x") {
    console.log("[deploy] already deployed, code present:", existing.slice(0, 60));
    return;
  }

  // 1. EIP-7702 authorization signed by the Privy P256 signer
  //    Privy's signAuthorization returns an Authorization object with r,s,yParity.
  //    nonce is the EOA's account nonce (0 for never-used wallet).
  const eoaNonce = await publicClient.getTransactionCount({ address: WALLET_ADDRESS });
  console.log("[deploy] EOA nonce:", eoaNonce);

  const authorization = await account.signAuthorization!({
    chainId: CHAIN_ID,
    contractAddress: SMA_B_7702_IMPL,
    nonce: eoaNonce,
  });
  console.log("[deploy] 7702 auth signed:", {
    address: authorization.address,
    nonce: authorization.nonce,
    chainId: authorization.chainId,
  });

  // 2. Build a no-op userOp: account.execute(self, 0, 0x)
  const callData = encodeFunctionData({
    abi: accountAbi,
    functionName: "execute",
    args: [WALLET_ADDRESS, 0n, "0x"],
  });

  // 3. AA nonce from EntryPoint (key=0)
  const aaNonce = await publicClient.readContract({
    address: ENTRYPOINT_V08,
    abi: parseAbi(["function getNonce(address,uint192) view returns (uint256)"]),
    functionName: "getNonce",
    args: [WALLET_ADDRESS, 0n],
  });

  // 4. Gas prices from Pimlico
  const gasPrices = await rpc<{
    fast: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
  }>(PIMLICO_RPC, "pimlico_getUserOperationGasPrice", []);

  // 5. Initial userOp (no signature yet, no paymaster yet)
  const userOp: Record<string, any> = {
    sender: WALLET_ADDRESS,
    nonce: toHexBig(aaNonce),
    callData,
    callGasLimit: "0x0",
    verificationGasLimit: "0x0",
    preVerificationGas: "0x0",
    maxFeePerGas: gasPrices.fast.maxFeePerGas,
    maxPriorityFeePerGas: gasPrices.fast.maxPriorityFeePerGas,
    signature: "0x" + "fa".repeat(65), // dummy for estimation; MA-v2 wraps it
    eip7702Auth: {
      chainId: toHexBig(BigInt(authorization.chainId)),
      nonce: toHexBig(BigInt(authorization.nonce)),
      address: authorization.address,
      r: authorization.r,
      s: authorization.s,
      yParity: toHexBig(BigInt(authorization.yParity)),
    },
  };

  // 6. Ask Pimlico to sponsor + estimate
  const sponsored = await rpc<any>(PIMLICO_RPC, "pm_sponsorUserOperation", [
    userOp,
    ENTRYPOINT_V08,
  ]);
  Object.assign(userOp, sponsored);

  // 7. Sign userOp hash with the Privy signer.
  //    MA-v2 wraps the validation signature with packUOSignature(): "0xFF" + "0x00" + sig.
  //    Compute userOpHash via EntryPoint.getUserOpHash, then secp256k1-style sign via
  //    the Privy signer (Privy returns a 65-byte ECDSA signature usable for 1271/UO).
  const userOpHash = (await rpc<Hex>(PIMLICO_RPC, "eth_getUserOperationHash", [
    userOp,
    ENTRYPOINT_V08,
  ])) as Hex;

  const rawSig = await account.sign!({ hash: userOpHash });
  // packUOSignature(validationSignature)
  userOp.signature = ("0xFF00" + rawSig.slice(2)) as Hex;

  // 8. Submit
  const opHash = await rpc<Hex>(PIMLICO_RPC, "eth_sendUserOperation", [
    userOp,
    ENTRYPOINT_V08,
  ]);
  console.log("[deploy] userOp submitted:", opHash);

  // 9. Poll for receipt
  for (let i = 0; i < 60; i++) {
    const receipt = await rpc<any>(PIMLICO_RPC, "eth_getUserOperationReceipt", [opHash]);
    if (receipt) {
      console.log("[deploy] userOp mined in tx:", receipt.receipt?.transactionHash);
      console.log("[deploy] success:", receipt.success);
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  // 10. Verify
  const code = await publicClient.getBytecode({ address: WALLET_ADDRESS });
  if (!code || code === "0x") throw new Error("post-state: no code at EOA");
  if (!code.toLowerCase().startsWith("0xef0100"))
    throw new Error(`unexpected delegation prefix: ${code.slice(0, 10)}`);
  console.log("[deploy] DONE. Delegation:", code);
  console.log(
    `[deploy] verify: https://base.blockscout.com/address/${WALLET_ADDRESS}?tab=contract`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
