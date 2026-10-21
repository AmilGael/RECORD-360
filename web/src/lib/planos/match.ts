/** Case- and accent-insensitive fold for Planos card search. */
export function foldQuery(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export type PlanosSearchable = {
  name: string;
  fileName: string | null;
  uploader: string;
  dateText: string;
};

/** True when `q` is blank or any of the displayed fields contains it. */
export function matchesPlanosQuery(doc: PlanosSearchable, q: string): boolean {
  const needle = foldQuery(q.trim());
  if (!needle) return true;
  return [doc.name, doc.fileName ?? "", doc.uploader, doc.dateText].some((s) => foldQuery(s).includes(needle));
}
