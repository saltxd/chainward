# @chainward/virtuals-plugin

ChainWard monitoring plugin for [Virtuals GAME SDK](https://docs.game.virtuals.io/) agents. Track transactions, balances, and gas for AI agents on Base in real time.

## Install

```bash
npm install @chainward/virtuals-plugin @virtuals-protocol/game
```

## Quick Start

```ts
import { GameAgent } from "@virtuals-protocol/game";
import { ChainwardPlugin } from "@chainward/virtuals-plugin";

const chainward = new ChainwardPlugin({
  apiKey: process.env.CHAINWARD_API_KEY,
});

const agent = new GameAgent(process.env.GAME_API_KEY, {
  name: "My Trading Agent",
  goal: "Execute trades on Base while monitoring wallet health",
  workers: [chainward.getWorker()],
});

await agent.init();
await agent.run(60, { verbose: true });
```

## Functions

The plugin provides 6 `GameFunction` actions bundled into a `GameWorker`:

| Function | Description |
|----------|-------------|
| `chainward_register_agent` | Register a wallet for real-time monitoring |
| `chainward_list_agents` | List all monitored wallets |
| `chainward_list_transactions` | View recent transactions with USD amounts |
| `chainward_check_balance` | Check wallet status and last activity |
| `chainward_create_alert` | Set up alerts (7 types, 3 delivery channels) |
| `chainward_list_alerts` | List configured alerts |

## Alert Types

`large_transfer` · `gas_spike` · `failed_tx` · `new_contract` · `balance_drop` · `inactivity` · `idle_balance`

Delivery via **Discord**, **Telegram**, or **webhook**.

## Get Your API Key

1. Connect your wallet at [chainward.ai](https://chainward.ai)
2. Go to Settings → API Keys
3. Create a key (starts with `ag_`)

## Links

- [ChainWard](https://chainward.ai) — Dashboard & docs
- [API Reference](https://chainward.ai/docs/api) — Full endpoint documentation
- [@chainward/sdk](https://www.npmjs.com/package/@chainward/sdk) — TypeScript SDK
- [GitHub](https://github.com/saltxd/chainward) — Source code

## License

MIT
