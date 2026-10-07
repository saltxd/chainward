import { CounterpartyPay } from '@/components/pay/CounterpartyPay';

export const metadata = {
  title: 'API — risk checks, reports, attestations, datasets',
  description:
    'Public ChainWard API: free on-chain risk checks for Base and BNB Chain addresses, public reports, EAS attestations, pay-per-check over x402, and the datasets behind our decodes. No account needed.',
  alternates: { canonical: 'https://chainward.ai/docs' },
  openGraph: {
    title: 'ChainWard API',
    description:
      'Free risk checks for Base and BNB Chain addresses, public reports, attestations, x402 pay-per-check and datasets. No account needed.',
    images: [{ url: '/chainward-og-card.png', width: 1200, height: 630 }],
  },
};

export default function DocsPage() {
  return (
    <article className="decode-prose">
      <h1>ChainWard API</h1>
      <p>
        Everything on chainward.ai is available over HTTP. The public endpoints need
        no account and no key. Base URL: <code>https://api.chainward.ai</code>. The
        free paths also work under <code>https://chainward.ai/api/…</code>; send paid
        requests to <code>https://api.chainward.ai</code> directly. The
        machine-readable spec is at <a href="/openapi.json">/openapi.json</a>.
      </p>
      <p>
        A report is a list of flags read from on-chain behavior, each tied to the
        transactions behind it. It is never a safety verdict: no flags means nothing
        surfaced in the window checked, not that an address is safe.
      </p>

      <h2>Run a risk check (free)</h2>
      <pre>
        <code>{`curl -X POST https://api.chainward.ai/api/risk/check \\
  -H 'Content-Type: application/json' \\
  -d '{"target":"0x4baadba26c3c0bdef9e8faf173925d463aa53bb2","chain":"base"}'`}</code>
      </pre>
      <ul>
        <li>
          <code>chain</code> is <code>base</code> (default) or <code>bsc</code> (BNB
          Chain). <code>force_recheck: true</code> re-runs an existing report (one
          forced re-check per address per 10 minutes).
        </li>
        <li>
          The response <code>status</code> is <code>ready</code> (a fresh report),{' '}
          <code>stale</code> (an older report plus a free re-check offer),{' '}
          <code>teaser</code> or <code>queued</code> (a decode is running: poll{' '}
          <code>GET /api/risk/check/:check_id</code>), or <code>no_history</code>.
        </li>
        <li>
          A first decode takes about a minute. Limits: 30 checks a minute and 8
          new decodes an hour per IP. Answers from an existing report, and
          rejected requests, don&apos;t count toward the 8.
        </li>
        <li>
          BNB Chain reads public RPC logs over the last 14 days; the report says
          exactly what window it covered. Attestations are Base-only for now.
        </li>
      </ul>

      <h2>Read reports (free)</h2>
      <pre>
        <code>{`# the latest report for an address (add ?chain=bsc for BNB Chain)
curl https://api.chainward.ai/api/risk/report/0x4baadba26c3c0bdef9e8faf173925d463aa53bb2

# every address on file, newest first
curl 'https://api.chainward.ai/api/risk/library?sort=recent&limit=50&distinct=address'

# the EAS attestation ChainWard published on Base for an address, with the
# canonical JSON so you can recompute reportHash yourself
curl https://api.chainward.ai/api/risk/attestation/0x4baadba26c3c0bdef9e8faf173925d463aa53bb2`}</code>
      </pre>
      <p>
        Every report is also a public page at{' '}
        <code>chainward.ai/report/&lt;address&gt;</code>. Attestations are readable
        on-chain by any agent or contract; see <a href="/attest">ChainWard Attest</a>.
      </p>

      <h2>Pay per request over x402</h2>
      <p>
        For agents that want a guaranteed-fresh answer in one call. Pay in USDC on
        Base with any x402 client; the first request returns <code>402</code> with
        the payment requirements, the retry with a payment header returns the data.
        Settlement happens only after the handler succeeds, so a failed check is
        never charged. Send paid requests to <code>https://api.chainward.ai</code>{' '}
        directly, not through <code>chainward.ai/api/…</code>: a fresh check can take
        close to a minute.
      </p>
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
              <code>GET /api/risk/x402/:address</code>
            </td>
            <td>0.05 USDC</td>
            <td>
              A risk report no older than 24h (a fresh check runs if needed). Add{' '}
              <code>?chain=bsc</code> for a BNB Chain address; payment is still USDC on Base.
            </td>
          </tr>
          <tr>
            <td>
              <code>GET /api/risk/seller-demand?address=</code>
            </td>
            <td>0.10 USDC</td>
            <td>
              Where a seller&apos;s buyers get their stablecoins: how much traces
              back to the seller, how much it pays back, whether one wallet funds
              most buyers. On Base, payers behind Meridian and Fluxa proxies are
              named; exchanges stay opaque. Add <code>?chain=bsc</code> for a BNB
              Chain seller.
            </td>
          </tr>
          <tr>
            <td>
              <code>GET /api/risk/hires?agent=&amp;chain=bsc</code>
            </td>
            <td>0.10 USDC</td>
            <td>
              For BNB Chain&apos;s Set and Earn: every wallet that hired an ERC-8004
              agent (an id, or an owner address) in the last 30 days, and whether each
              is the owner, funded by it or shares a funder with it.{' '}
              <code>independent_within_limits</code> means no link was found within 4
              hops, not proven independence. BNB Chain only. Free daily results for every
              agent hired since Oct 1: <a href="/set-and-earn">/set-and-earn</a>.
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
      <p>
        Discovery: <a href="/.well-known/x402">/.well-known/x402</a> and{' '}
        <a href="/openapi.json">/openapi.json</a>.
      </p>
      <h3>Or pay from this page</h3>
      <p>
        Run the counterparty check with a wallet that holds USDC on Base. You sign
        one transfer authorization; the facilitator pays the gas.
      </p>
      <CounterpartyPay />

      <h2>Datasets</h2>
      <pre>
        <code>{`# what's for sale
curl https://api.chainward.ai/api/paid

# free: is one wallet in a dataset, and in which tier?
curl https://api.chainward.ai/api/paid/termix-wallets/lookup/0xb709860b8a1ce20019f3786d6982f773912bd286`}</code>
      </pre>
      <p>
        People can buy a dataset from any wallet at{' '}
        <a href="/paid/termix-wallets">chainward.ai/paid/&lt;slug&gt;</a>: send the
        price in USDC on Base, and the page verifies the transfer and returns a
        24-hour download link. No account.
      </p>

      <h2>MCP server</h2>
      <p>
        For Claude, Cursor and other MCP clients: <code>npx chainward-mcp-server</code>{' '}
        (npm <code>chainward-mcp-server</code>, registry{' '}
        <code>io.github.saltxd/chainward</code>). Tools: <code>check_counterparty</code>,{' '}
        <code>lookup_agent</code>, <code>get_agent_profile</code>,{' '}
        <code>get_agent_economics</code>, <code>get_observatory_overview</code>,{' '}
        <code>get_top_agents</code>, <code>get_activity_feed</code>,{' '}
        <code>list_decodes</code>, <code>find_decodes_for_address</code>. Questions or
        listing requests: <a href="mailto:hello@chainward.ai">hello@chainward.ai</a>.
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
