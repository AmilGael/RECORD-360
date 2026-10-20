/**
 * Search fold shared by every client matcher. NFD, drop combining marks, lower case.
 * "mamposteria" matches "Mampostería". The SQL fold in sql-fold.ts covers the
 * same Spanish letters; it does not strip every Unicode mark.
 */
export function foldForSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Capitals and small letters, same order on both sides. */
export const SQL_FOLD_FROM = "ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇáàäâéèëêíìïîóòöôúùüûñç";
export const SQL_FOLD_TO = "aaaaeeeeiiiioooouuuuncaaaaeeeeiiiioooouuuunc";

/** Escapes `\`, `%` and `_` so a folded query matches literally under LIKE. */
export function escapeLike(folded: string): string {
  return folded.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Folded, escaped needle. Null when the query is blank after folding. */
export function searchLikePattern(query: string): string | null {
  const folded = foldForSearch(query.trim());
  if (!folded) return null;
  return escapeLike(folded);
}
