// Datasets taken off sale. Their DB rows stay, so reverting this file restores
// sale; every paid route answers 410 for these slugs before any payment challenge.
export const WITHDRAWN_DATASETS: Readonly<Record<string, string>> = {
  // Built from x402scan's internal API, whose Terms bar harvesting the service.
  'x402-sellers-base': 'Withdrawn from sale while we ask the data source for permission.',
};

/** The public reason a dataset is off sale, or null while it is on sale. */
export function withdrawnReason(slug: string): string | null {
  return WITHDRAWN_DATASETS[slug] ?? null;
}
