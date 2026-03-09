# @chainward/agentkit-plugin

ChainWard monitoring action provider for [Coinbase AgentKit](https://docs.cdp.coinbase.com/agentkit). Track transactions, balances, and gas for AI agents on Base in real time.

## Install

```bash
npm install @chainward/agentkit-plugin @coinbase/agentkit
```

## Quick Start

```ts
import { AgentKit } from "@coinbase/agentkit";
import { chainwardActionProvider } from "@chainward/agentkit-plugin";

const kit = await AgentKit.from({ ... });

kit.registerActionProvider(
  chainwardActionProvider({
    apiKey: process.env.CHAINWARD_API_KEY,
  })
);
```

## Actions

| Action | Description |
|--------|-------------|
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
## License

MIT
