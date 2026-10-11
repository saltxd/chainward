import type { RiskReport } from './api';
import { plainAnswer } from './plainAnswer';
import { reportSearchCopy } from './risk';

/**
 * The title and description for a report page: the question, then the answer
 * word and why. Used by the server metadata and by the client when a re-check
 * replaces the report, so the tab title always matches the page. The third
 * answer is named by case (Inactive, No track record, Couldn't check), as on
 * the page, never the API's "Unknown".
 */
export function reportPageCopy(input: {
  report: RiskReport | null;
  short: string;
  chainName: string;
  now?: Date;
}): { title: string; description: string } {
  const { report, short, chainName, now } = input;
  const answer = report ? plainAnswer(report, now) : null;
  const verdict =
    report?.verdict && answer && answer.label === 'unknown'
      ? { ...report.verdict, text: answer.word, reason: answer.why }
      : report?.verdict;
  return reportSearchCopy({
    short,
    chainName,
    flagCount: report ? report.flags.length : null,
    verdict,
  });
}
