# Security

## Audit status

ChainWard has **not had an external security audit yet.** What that covers, and what it doesn't:

- **No custom smart contracts.** ChainWard deploys no contracts of its own. Attestations are made through the
  audited [EAS](https://attest.org) contracts on Base (see [docs/ATTEST.md](docs/ATTEST.md)); the BNB Chain
  port will use the EAS-compatible BNB Attestation Service.
- **No custody.** ChainWard never holds user funds. Payments (x402 checks, datasets, briefs) are USDC
  transfers straight to the treasury, verified on-chain before anything is delivered.
- **What holds keys:** the attestation signer (`0x5edc6276B89CC185aC8D6A7eCfdE076e1ACf50DF`) lives only in the
  indexer, in a Kubernetes secret. It can attest and revoke; it cannot move funds.
- **Most recent internal review:** 2026-10-01 (commit `4dbbfe8`): SSRF hardening on alert delivery, rate
  limiting, the x402 payment gate, the web proxy, CSP, and payment-replay checks. Fixes are listed in that
  commit message.
- **Planned:** an external review of the attestation signer and the public API is budgeted in the BNB Chain
  grant proposal (milestone 3).

## Reporting a vulnerability

Please report security issues privately: email [hello@chainward.ai](mailto:hello@chainward.ai),
DM [@SaltCx](https://x.com/SaltCx) on X, or open a
[GitHub security advisory](https://github.com/saltxd/chainward/security/advisories/new). Don't open a public
issue for anything exploitable.
