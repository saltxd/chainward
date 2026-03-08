/**
 * Example: Using the ChainWard plugin with Virtuals GAME SDK
 *
 * Prerequisites:
 *   - GAME_API_KEY: Your Virtuals GAME API key
 *   - CHAINWARD_API_KEY: Your ChainWard API key (starts with ag_)
 *
 * Install:
 *   npm install @virtuals-protocol/game @chainward/virtuals-plugin
 */

import { GameAgent } from "@virtuals-protocol/game";
import { ChainwardPlugin } from "./chainwardPlugin.js";

const GAME_API_KEY = process.env.GAME_API_KEY!;
const CHAINWARD_API_KEY = process.env.CHAINWARD_API_KEY!;

// 1. Create the ChainWard plugin
const chainward = new ChainwardPlugin({
  apiKey: CHAINWARD_API_KEY,
  // baseUrl: "https://api.chainward.ai",  // default
});

// 2. Get the pre-configured worker with all 6 monitoring functions
const monitorWorker = chainward.getWorker();

// 3. Create a GAME agent with the ChainWard worker
const agent = new GameAgent(GAME_API_KEY, {
  name: "Monitoring Agent",
  goal: "Monitor AI agent wallets on Base, track transactions, and manage alerts via ChainWard.",
  description:
    "An autonomous agent that uses ChainWard to monitor onchain activity for AI agent wallets on Base. " +
    "It can register new wallets, list transactions, check balances, and configure alerts for large transfers, " +
    "gas spikes, failed transactions, and more.",
  workers: [monitorWorker],
});

// 4. Initialize and run
async function main() {
  await agent.init();
  // Run with a 60-second heartbeat
  await agent.run(60, { verbose: true });
}

main().catch(console.error);
