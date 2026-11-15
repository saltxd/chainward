/**
 * The noun for a count: "1 buyer", "25 buyers". Returns only the word, so the
 * caller keeps its own number formatting. No dependencies: the public pages
 * import it.
 */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return n === 1 ? singular : pluralForm;
}
