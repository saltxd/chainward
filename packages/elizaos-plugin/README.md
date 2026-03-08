# @chainward/elizaos-plugin

ChainWard monitoring plugin for [elizaOS](https://elizaos.ai) agents. Track transactions, balances, and gas for AI agents on Base in real time.

## Install

```bash
npm install @chainward/elizaos-plugin
```

## Quick Start

Add the plugin to your elizaOS agent character config:

```json
{
  "plugins": ["@chainward/elizaos-plugin"],
  "settings": {
    "CHAINWARD_API_KEY": "ag_...",
    "CHAINWARD_AGENT_WALLET": "0x...",
    "CHAINWARD_AGENT_NAME": "My Agent"
  }
}
```

The plugin auto-registers the wallet for monitoring on startup.

## Actions

| Action | Description |
|--------|-------------|
| `CHAINWARD_REGISTER_AGENT` | Register a wallet for real-time monitoring |
| `CHAINWARD_LIST_AGENTS` | List all monitored wallets |
| `CHAINWARD_LIST_TRANSACTIONS` | View recent transactions with USD amounts |
| `CHAINWARD_CHECK_BALANCE` | Check wallet status and last activity |
| `CHAINWARD_CREATE_ALERT` | Set up alerts (7 types, 3 delivery channels) |
| `CHAINWARD_LIST_ALERTS` | List configured alerts |

## Alert Types

`large_transfer` · `gas_spike` · `failed_tx` · `new_contract` · `balance_drop` · `inactivity` · `idle_balance`

Delivery via **Discord**, **Telegram**, or **webhook**.

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `CHAINWARD_API_KEY` | Yes | API key (starts with `ag_`) |
| `CHAINWARD_AGENT_WALLET` | No | Auto-register this wallet on startup |
| `CHAINWARD_AGENT_NAME` | No | Display name for auto-registered agent |
| `CHAINWARD_BASE_URL` | No | Custom API URL (default: https://api.chainward.ai) |

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
