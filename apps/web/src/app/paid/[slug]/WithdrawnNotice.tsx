import Link from 'next/link';

/**
 * Shown instead of the offer on a dataset page when the API says the dataset is
 * off sale. The page stays, so links from decodes still land on an explanation.
 */
export function WithdrawnNotice({ reason, decodeHref }: { reason: string; decodeHref: string }) {
  return (
    <div className="brf-notice">
      <p>{reason}</p>
      <p>
        The findings are still public in the <Link href={decodeHref}>decode</Link>.
      </p>
    </div>
  );
}
