import { agentUrl, marketplaceLabel, registeredLabel, utcDay, verdictLabel, type SetAndEarnRow } from '@/lib/setAndEarn';
import { hireCheckUrl, PAID_CHECK_PRICE } from '@/lib/paidChecks';
import { PayCheckRow } from '@/components/pay/PayCheckButton';

/** The board's table; styles (se-*) live on the page. A verdict from an earlier run carries its date. */
export function BoardTable({ rows, generatedAt }: { rows: SetAndEarnRow[]; generatedAt: string }) {
  return (
    <div className="se-scroll">
      <table className="se-table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Marketplace</th>
            <th>Hires</th>
            <th>Distinct hirers</th>
            <th>No link found</th>
            <th>3 with no link?</th>
            <th>Hire check</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const verdict = verdictLabel(row);
            const registered = registeredLabel(row);
            return (
              <PayCheckRow
                key={row.agent_id}
                resource={hireCheckUrl(row.agent_id)}
                label={`Hire check for agent #${row.agent_id}`}
                price={PAID_CHECK_PRICE.hires}
                colSpan={7}
              >
                <td>
                  <a className="se-addr" href={agentUrl(row.agent_id)} target="_blank" rel="noopener noreferrer">
                    #{row.agent_id}
                  </a>
                  {row.name && <div className="se-sub">{row.name}</div>}
                  {registered && <div className="se-sub">{registered}</div>}
                </td>
                <td>{marketplaceLabel(row.marketplace)}</td>
                <td>
                  {row.hires_total.toLocaleString('en-US')}
                  {row.completed !== null && <div className="se-sub">{row.completed.toLocaleString('en-US')} completed</div>}
                </td>
                <td>{row.distinct_hirers.toLocaleString('en-US')}</td>
                <td>{row.independent_within_limits ?? '—'}</td>
                <td className={`se-verdict se-verdict--${verdict.tone}`}>
                  {verdict.text}
                  {row.checked_at && utcDay(row.checked_at) !== utcDay(generatedAt) && (
                    <div className="se-sub">as of {utcDay(row.checked_at)}</div>
                  )}
                </td>
              </PayCheckRow>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
