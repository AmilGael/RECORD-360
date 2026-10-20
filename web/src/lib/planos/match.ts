import { foldForSearch } from "@/lib/text/fold";

export type PlanosSearchable = {
  name: string;
  fileName: string | null;
  uploader: string;
  dateText: string;
};

/** True when `q` is blank or any of the displayed fields contains it. */
export function matchesPlanosQuery(doc: PlanosSearchable, q: string): boolean {
  const needle = foldForSearch(q.trim());
  if (!needle) return true;
  return [doc.name, doc.fileName ?? "", doc.uploader, doc.dateText].some((s) => foldForSearch(s).includes(needle));
}
