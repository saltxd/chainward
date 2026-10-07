// Response `data` of the three paid checks, from the examples apps/api serves in
// /openapi.json (lib/x402.ts: OUTPUT_EXAMPLE, SELLER_OUTPUT_EXAMPLE,
// HIRES_OUTPUT_EXAMPLE), each a trimmed real response, plus the fields the
// routes add (chain, method, notes, disclaimer).

export const SELLER = {
  address: '0x68396bd35874695ad86cd29410bd80a550991a2b',
  window_days: 30,
  sample: { inflow_transfers: 1000, buyers: 500, capped: true },
  via_intermediary_share: 0,
  top_buyer_share: 0.037,
  buyers_checked: 30,
  seller_funded: { buyers: 30, volume_share: 1, hops: { '3': 30 } },
  paid_back_share: 0,
  common_first_funder: { address: '0x82b551e820efc3503a3a27fc450e07e328daf91c', buyer_share: 0.5 },
  walk_stops: {},
  method: 'Samples the seller’s USDC inflows and walks each top buyer’s funding back.',
  proxied_payers: [
    {
      proxy: '0x9999999999999999999999999999999999999999',
      name: 'Meridian',
      payers_resolved: 5,
      coverage_share: 1,
      source: 'x402scan',
      receipts: { read: 5, matched: 5 },
      payers_checked: 5,
      payers_funded_by_seller: 5,
    },
  ],
  signals: [
    {
      id: 'buyers_funded_by_seller',
      title: "Most checked buyers' USDC traces back to this address",
      evidence: '30 of 30 top buyers reach this address within 3 hops of their largest funders (100% of their volume).',
    },
    {
      id: 'common_funder',
      title: 'One wallet funds most checked buyers',
      evidence: '0x82b551e820efc3503a3a27fc450e07e328daf91c is the largest funder of 50% of the top buyers checked.',
    },
  ],
  notes: [],
  not_assessed: ['Off-chain agreements between seller and buyers'],
  disclaimer:
    'Describes where stablecoins moved on this chain, not why. A common funder can be a legitimate faucet, exchange or custodian. Not a safety verdict.',
  chain: 'base',
};

export const HIRES = {
  chain: 'bsc',
  agent_id: 332962,
  agent_ids: [332962],
  owner: '0x15d08640aeefbdce11930d9c9a30884011f654f6',
  agent_wallet: '0x15d08640aeefbdce11930d9c9a30884011f654f6',
  window_days: 30,
  hires: { total: 3, distinct_hirers: 2, by_source: { termix_escrow: 3, erc8183_shared: 0 } },
  hirers: [
    {
      address: '0x4e276b4db12447254134b45e5add170993df5ad2',
      hires: 1,
      first_hire_at: '2026-10-01T07:42:05.000Z',
      verdict: 'inconclusive',
      evidence:
        "The hirer's first-incoming-BNB trail stops at 0x8894e0a0c962cb723c1976a4421c95949be2d4e3, a hub (exchange-style wallet, router or custodian), after 2 hops; funding behind it is not visible.",
      path: [
        '0x4e276b4db12447254134b45e5add170993df5ad2',
        '0x1d21aa41a77737e593b8ca92d6bf6437fa81697f',
        '0x8894e0a0c962cb723c1976a4421c95949be2d4e3',
      ],
    },
    {
      address: '0x99f88c4cae19f858052236f808b75967eece5bd0',
      hires: 2,
      first_hire_at: '2026-10-03T07:19:06.000Z',
      verdict: 'shared_funder',
      evidence:
        "The hirer's and the owner wallet's funding trails meet at 0x0fe05614b2d344fb0ef9797431890d4c13c0f0f1, which is not a hub or a contract (hirer: 1 hop up its first-incoming-stablecoin trail; owner wallet: 1 hop up its first-incoming-stablecoin trail).",
      path: [
        '0x99f88c4cae19f858052236f808b75967eece5bd0',
        '0x0fe05614b2d344fb0ef9797431890d4c13c0f0f1',
        '0x15d08640aeefbdce11930d9c9a30884011f654f6',
      ],
    },
  ],
  summary: { owner_linked: 1, inconclusive: 1, independent_within_limits: 0, passes_three_independent: false },
  method: 'Follows each hirer’s first incoming BNB and stablecoin up to 4 hops.',
  limits: ['Funding through an exchange or bridge is not followed.'],
  as_of: { block: 125969567, time: '2026-10-06T01:09:22.000Z' },
};

export const COUNTERPARTY = {
  status: 'ready',
  report: {
    address: '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2',
    chain: 'base',
    band: 'high-signal',
    flags: [
      {
        id: 'stranded_value',
        severity: 'high',
        title: 'USDC balance held in a dormant wallet',
        evidence: 'Holds 5451.386272 USDC while classified dormant',
        source: 'https://base.blockscout.com/address/0x4baadba26c3c0bdef9e8faf173925d463aa53bb2',
      },
    ],
    not_assessed: ['Contract bytecode or source auditing', 'Social-engineering or off-chain reputation'],
    freshness: { as_of_block: 51846337, generated_at: '2026-09-27T04:07:05.375Z', ttl_state: 'fresh' },
    attestation: {
      uid: '0xda5dc4ca34777d908c3f16fc9eb10a75325d2c83683adb7539c8bc4ade6f6560',
      explorer_url:
        'https://base.easscan.org/attestation/view/0xda5dc4ca34777d908c3f16fc9eb10a75325d2c83683adb7539c8bc4ade6f6560',
    },
    disclaimer:
      'Risk flags from on-chain behavior only. ChainWard cannot see social engineering, off-chain agreements, or intent. Absence of flags is not a guarantee of safety.',
  },
};

export const NO_HISTORY = {
  status: 'no_history',
  address: '0x0000000000000000000000000000000000000abc',
  chain: 'bsc',
  disclaimer: COUNTERPARTY.report.disclaimer,
};
