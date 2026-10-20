import { CounterpartyPay } from '@/components/pay/CounterpartyPay';
import { CodeBlock } from '@/components/press';

export const metadata = {
  title: 'API: risk checks, reports, attestations, datasets',
  description:
    'Public ChainWard API: free on-chain risk checks for Base and BNB Chain addresses, public reports, EAS attestations, pay-per-check over x402, and the datasets behind our decodes. No account needed.',
  alternates: { canonical: 'https://chainward.ai/docs' },
  openGraph: {
    title: 'ChainWard API',
    description:
      'Free risk checks for Base and BNB Chain addresses, public reports, attestations, x402 pay-per-check and datasets. No account needed.',
    images: [{ url: '/chainward-og-card.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ChainWard API',
    description: 'Free risk checks for Base and BNB Chain addresses, public reports, attestations, x402 pay-per-check and datasets. No account needed.',
    images: ['/chainward-og-card.png'],
  },
};

const EXAMPLE = '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2';

const checkCurl = `curl -X POST https://api.chainward.ai/api/risk/check \\
  -H 'Content-Type: application/json' \\
  -d '{"target":"${EXAMPLE}","chain":"base"}'`;

const verdictExample = `"verdict": {
  "label": "hold",
  "text": "Hold",
  "reason": "USDC balance held in a dormant wallet: Holds 5451.386272 USDC while classified dormant (no transfers in the last 30 days; holds a balance from before the window).",
  "limits": "On-chain behavior only. Absence of flags is not a clearance of the counterparty."
}`;

const readCurl = `# the latest report for an address (add ?chain=bsc for BNB Chain; 404 if none)
curl https://api.chainward.ai/api/risk/report/${EXAMPLE}

# addresses on file, newest first (limit up to 100, page with offset)
curl 'https://api.chainward.ai/api/risk/library?sort=recent&limit=50&distinct=address'

# the EAS attestation ChainWard published on Base for an address, with the
# canonical JSON so you can recompute report_hash yourself
curl https://api.chainward.ai/api/risk/attestation/${EXAMPLE}`;

const probeCurl = `# no payment attached: answers 402 with the price
curl -i 'https://api.chainward.ai/api/risk/x402?address=${EXAMPLE}'`;

const datasetCurl = `# what's for sale
curl https://api.chainward.ai/api/paid

# free (30 a minute): is one wallet in a dataset, and in which tier?
curl https://api.chainward.ai/api/paid/termix-wallets/lookup/0xb709860b8a1ce20019f3786d6982f773912bd286

# the row itself, verdict first, for agents: 0.05 USDC over x402 (answers 402 until paid)
curl 'https://api.chainward.ai/api/paid/termix-wallets/check?address=0xb709860b8a1ce20019f3786d6982f773912bd286'`;

const mcpConfig = `{
  "mcpServers": {
    "chainward": {
      "command": "npx",
      "args": ["-y", "chainward-mcp-server"]
    }
  }
}`;

export default function DocsPage() {
  return (
    <article className="decode-prose">
      <h1>ChainWard API</h1>
      <p>
        Check an address before you pay it. An address is the <code>0x…</code> account
        a person, an AI agent or a contract uses on a blockchain. Everything on
        chainward.ai is also available over HTTP, and the public endpoints need no
        account and no key.
      </p>
      <p>
        Base URL: <code>https://api.chainward.ai</code>. The free endpoints also work
        under <code>https://chainward.ai/api/…</code>; send paid requests to{' '}
        <code>https://api.chainward.ai</code> directly. The machine-readable spec is at{' '}
        <a href="/openapi.json">/openapi.json</a>. The counterparty check is{' '}
        <a href="https://payapi.market/api/chainward-pay-hold-or-unknown-for-any-address">
          verified on PayAPI Market
        </a>
        , with a settled payment behind the listing.
      </p>

      <h2>Reading a verdict</h2>
      <p>
        Every check opens with a verdict: one decision and the one fact it rests on.
        Under it sits the evidence, each flag tied to the transactions behind it, and
        one line on what the check cannot see. Verdicts are read from on-chain behavior
        only, so Pay means nothing was found against paying, not that an address is
        safe.
      </p>
      <p>
        A verdict has two names. <code>label</code> is a fixed value for your code to
        branch on; <code>text</code> is the wording to show a person. For an address:
      </p>
      <div className="decode-table-scroll">
        <table className="docs-nowrap-code">
          <thead>
            <tr>
              <th>label</th>
              <th>text</th>
              <th>Means</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>pay</code>
              </td>
              <td>Pay</td>
              <td>Active in the last 30 days, with no high-severity flag.</td>
            </tr>
            <tr>
              <td>
                <code>hold</code>
              </td>
              <td>Hold</td>
              <td>A high-severity flag, or medium-severity flags that raise the signal band. The reason names the first one.</td>
            </tr>
            <tr>
              <td>
                <code>unknown</code>
              </td>
              <td>Inactive</td>
              <td>It has sent transactions before, but made no transfers in the last 30 days.</td>
            </tr>
            <tr>
              <td>
                <code>unknown</code>
              </td>
              <td>No track record</td>
              <td>No transfers in the last 30 days and no earlier activity found.</td>
            </tr>
            <tr>
              <td>
                <code>unknown</code>
              </td>
              <td>Couldn&apos;t check</td>
              <td>The data sources were down, so activity could not be read. Try again later.</td>
            </tr>
            <tr>
              <td>
                <code>unknown</code>
              </td>
              <td>Payer hidden</td>
              <td>
                A known relayer of the px402 privacy pool: it pays for agents it does not name, so the
                real payer can&apos;t be screened.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Branch on <code>label</code>, not <code>text</code>: the <code>unknown</code> label
        has four wordings. The seller check uses <code>real_demand</code>,{' '}
        <code>self_funded_demand</code>, <code>mixed</code> and{' '}
        <code>not_enough_data</code>; the hire check uses <code>hired_by_others</code>,{' '}
        <code>hired_by_own_circle</code> and <code>not_enough_data</code>. Their text is
        the same words in plain case (Real demand, Hired by its own circle, and so on).
        A verdict in a report looks like this:
      </p>
      <CodeBlock>{verdictExample}</CodeBlock>

      <h2>Run a risk check (free)</h2>
      <CodeBlock>{checkCurl}</CodeBlock>
      <ul>
        <li>
          <code>chain</code> is <code>base</code> (default) or <code>bsc</code> (BNB
          Chain). <code>force_recheck: true</code> runs a new check on an address that
          already has a report (one forced re-check per address every 10 minutes).
        </li>
        <li>
          The answer&apos;s <code>status</code> is one of:
          <ul>
            <li>
              <code>ready</code>: a current report is in <code>report</code>.
            </li>
            <li>
              <code>stale</code>: the report is out of date (over 24 hours old, or made
              by an older version of the checks). Re-run it free with{' '}
              <code>force_recheck: true</code>.
            </li>
            <li>
              <code>teaser</code>: the first check of this address has started. You get
              a few public stats now; poll <code>GET /api/risk/report/&lt;address&gt;</code>{' '}
              until it stops answering 404.
            </li>
            <li>
              <code>queued</code>: a check is already running. Poll{' '}
              <code>GET /api/risk/check/&lt;check_id&gt;</code> until its status is{' '}
              <code>ready</code> or <code>failed</code>.
            </li>
            <li>
              <code>no_history</code>: the address has no activity on that chain, so
              there is nothing to judge.
            </li>
          </ul>
        </li>
        <li>
          A first check takes about a minute. Limits per IP: 30 requests a minute and 8
          new checks an hour. Answers from an existing report, checks already running,{' '}
          <code>no_history</code> answers and rejected requests don&apos;t count toward
          the 8.
        </li>
        <li>
          On BNB Chain the check reads the last 14 days from public RPC nodes (the open
          servers anyone can query for chain data); the report says exactly what window
          it covered. Attestations are Base-only for now.
        </li>
      </ul>

      <h2>Read reports (free)</h2>
      <CodeBlock>{readCurl}</CodeBlock>
      <p>
        Every report is also a public page at{' '}
        <code>chainward.ai/report/&lt;address&gt;</code>. An attestation is a signed
        record of the report&apos;s result, published on Base through EAS (the
        Ethereum Attestation Service), so any agent or contract can read it on-chain;
        see <a href="/attest">ChainWard Attest</a>.
      </p>

      <h2>Pay per request over x402</h2>
      <p>
        x402 lets a program pay for a single API request with no account. The first
        request answers <code>402 Payment Required</code> with the price; the client
        signs a USDC payment on Base and sends the request again with it; the data comes
        back. Any x402 client works. Payment settles only after the check succeeds, so a
        failed check is never charged. Send paid requests to{' '}
        <code>https://api.chainward.ai</code> directly, not through{' '}
        <code>chainward.ai/api/…</code>: a fresh check can take close to a minute.
      </p>
      <div className="decode-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Price</th>
              <th>Returns</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>GET /api/risk/sanctions?address=</code>
              </td>
              <td>0.01 USDC</td>
              <td>
                <strong>Is the address on the US Treasury OFAC sanctions list?</strong>{' '}
                Hold if it is, Not listed otherwise, with the list&apos;s snapshot date.
                Any EVM chain. Cheap enough to run before every payment. Not listed is not
                a clearance; the counterparty check below reads behavior too.
              </td>
            </tr>
            <tr>
              <td>
                <code>GET /api/risk/rugcheck?token=</code>
              </td>
              <td>0.02 USDC</td>
              <td>
                <strong>A rug check on a Base token, before you buy it.</strong> Who launched
                it and how (Clanker&apos;s factory and Virtuals&apos; bonding curve are named when
                their contracts confirm the token), mints after the first issuance and how many
                went to the launch wallet, and what the launch wallet did: sanctions, its age at
                launch, its first funder, the share of supply it holds, whether it sent out 90%
                or more of the tokens it got at launch within the hour, and how many tokens it
                launched through Clanker in the 24 hours up to this one (5 or more answers{' '}
                <code>review</code>). The token&apos;s admin at launch is named; when it is not
                the launch wallet, as when Clanker&apos;s X bot launches for someone, its launches
                are not counted. Verdict{' '}
                <code>hold</code>, <code>review</code> or <code>no_flags</code>, which is not a
                clearance. It is not a honeypot, liquidity or holder check. An address that is not
                a token answers <code>not_a_contract</code> or <code>not_a_token</code>, and that
                answer is charged. Also at{' '}
                <code>/api/risk/token?address=</code>.
              </td>
            </tr>
            <tr>
              <td>
                <code>GET /api/risk/x402?address=</code>
              </td>
              <td>0.05 USDC</td>
              <td>
                <strong>The counterparty check.</strong> The verdict with its reason, then
                the full report, no older than 24 hours (a fresh check runs if needed). Add{' '}
                <code>&amp;chain=bsc</code> for a BNB Chain address; payment is still USDC
                on Base. <code>/api/risk/x402/&lt;address&gt;</code> also works.
              </td>
            </tr>
            <tr>
              <td>
                <code>GET /api/risk/seller-demand?address=</code>
              </td>
              <td>0.10 USDC</td>
              <td>
                <strong>Real demand, Self-funded demand, Mixed or Not enough data</strong>{' '}
                for a seller, with the numbers behind it: how much of the top buyers&apos;
                money traces back to the seller, how much it pays back, whether one wallet
                funds most buyers. On Base, payers behind the Meridian and Fluxa payment
                proxies are named; exchanges stay opaque. Add <code>&amp;chain=bsc</code>{' '}
                for a BNB Chain seller.
              </td>
            </tr>
            <tr>
              <td>
                <code>GET /api/risk/hires?agent=&amp;chain=bsc</code>
              </td>
              <td>0.10 USDC</td>
              <td>
                <strong>Hired by others, Hired by its own circle or Not enough data</strong>{' '}
                for an ERC-8004 agent (an agent registered on-chain: pass its id, or its
                owner&apos;s address for all its agents) under BNB Chain&apos;s Set and Earn
                rule. Then every wallet that hired it in the last 30 days, and whether each
                is the owner, funded by it, or shares a funder with it.{' '}
                <code>independent_within_limits</code> means no link was found within 4
                hops (4 transfers back), not proven independence. BNB Chain only. Free
                daily results for every agent hired since Oct 1:{' '}
                <a href="/set-and-earn">/set-and-earn</a>.
              </td>
            </tr>
            <tr>
              <td>
                <code>GET /api/paid/:slug/check?address=</code>
              </td>
              <td>0.05 USDC</td>
              <td>
                Is one wallet in a dataset: <code>listed</code> or{' '}
                <code>not_listed</code>, with the tier, the reason and the limit.
              </td>
            </tr>
            <tr>
              <td>
                <code>GET /api/paid/:slug/file</code>
              </td>
              <td>10 USDC</td>
              <td>The full dataset behind a decode, as CSV.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Dataset slugs today: <code>termix-wallets</code> and{' '}
        <code>set-and-earn-week-one</code> (<code>GET /api/paid</code> lists them). About to pay
        rewards or an airdrop to a list of wallets? <a href="/screen">Send us the list first</a>: we
        flag the wallets that share a funder. Screening one wallet at a time from your own code? The{' '}
        <a href="/wallet-api">wallet screening API</a> is free for 1,000 lookups a month with a key. To see
        a price without paying, call an endpoint with no payment:
      </p>
      <CodeBlock>{probeCurl}</CodeBlock>
      <p>
        The <code>PAYMENT-REQUIRED</code> header is base64-encoded JSON. Its{' '}
        <code>amount</code> is in USDC&apos;s smallest unit (6 decimals): 10000 is 0.01
        USDC, 20000 is 0.02, 50000 is 0.05, 100000 is 0.10 and 10000000 is 10. The JSON body says the
        price in plain words. Discovery files for x402 clients:{' '}
        <a href="/.well-known/x402">/.well-known/x402</a> and{' '}
        <a href="/openapi.json">/openapi.json</a>.
      </p>
      <h3>Or pay from this page</h3>
      <p>
        Run the counterparty check with a wallet that holds USDC on Base. You sign
        one transfer authorization; the facilitator pays the gas.
      </p>
      <CounterpartyPay />

      <h2>Datasets</h2>
      <CodeBlock>{datasetCurl}</CodeBlock>
      <p>
        People can buy a dataset from any wallet at{' '}
        <a href="/paid/termix-wallets">chainward.ai/paid/&lt;slug&gt;</a>: send the
        price in USDC on Base, and the page checks the transfer and gives you a download
        link that works for 24 hours. No account.
      </p>

      <h2>MCP server</h2>
      <p>
        MCP (Model Context Protocol) lets an AI assistant such as Claude or Cursor call
        outside tools. Add ChainWard to your client&apos;s MCP config:
      </p>
      <CodeBlock>{mcpConfig}</CodeBlock>
      <p>
        Or run it directly with <code>npx -y chainward-mcp-server</code>. Package:{' '}
        <a href="https://www.npmjs.com/package/chainward-mcp-server">
          chainward-mcp-server on npm
        </a>{' '}
        (MCP registry name <code>io.github.saltxd/chainward</code>, source on{' '}
        <a href="https://github.com/saltxd/chainward/tree/main/packages/mcp-server">GitHub</a>
        ). Tools: <code>check_counterparty</code>, <code>lookup_agent</code>,{' '}
        <code>get_agent_profile</code>, <code>get_agent_economics</code>,{' '}
        <code>get_observatory_overview</code>, <code>get_top_agents</code>,{' '}
        <code>get_activity_feed</code>, <code>list_decodes</code>,{' '}
        <code>find_decodes_for_address</code>. Questions or listing requests:{' '}
        <a href="mailto:hello@chainward.ai">hello@chainward.ai</a>.
      </p>

      <h2>Agent monitoring (signed-in)</h2>
      <p>
        The original ChainWard dashboard still runs for signed-in wallets: register
        agent addresses, browse their transactions and balances, and get Discord,
        Telegram or webhook alerts. It uses an API key from Settings. See the{' '}
        <a href="/docs/api">monitoring API</a>, the <a href="/docs/cli">CLI</a> and{' '}
        <a href="/docs/alerts">alert types</a>.
      </p>
    </article>
  );
}
