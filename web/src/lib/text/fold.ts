/**
 * Search fold shared by every client matcher. NFD, drop combining marks, lower case.
 * "mamposteria" matches "Mampostería". The SQL fold in sql-fold.ts maps the
 * Spanish and Portuguese letters below; server search folds the query with that
 * same SQL map (never with this function), so an exactly typed name always
 * matches, whatever its accents.
 */
export function foldForSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Capitals and small letters, same order on both sides. */
export const SQL_FOLD_FROM = "ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇÃÕáàäâéèëêíìïîóòöôúùüûñçãõ";
export const SQL_FOLD_TO = "aaaaeeeeiiiioooouuuuncaoaaaaeeeeiiiioooouuuuncao";

/** Escapes `\`, `%` and `_` so a folded query matches literally under LIKE. */
export function escapeLike(folded: string): string {
  return folded.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * The query as typed, trimmed and LIKE-escaped, for foldedLike. It is not folded
 * here: foldedLike folds it in SQL with the column's own map. Folding it with
 * foldForSearch instead stripped marks the SQL map keeps ("João" -> "joao"
 * against a column folded to "joão"), so exact spellings stopped matching.
 * Null when the query is blank.
 */
export function searchLikePattern(query: string): string | null {
  const trimmed = query.trim();
  if (!foldForSearch(trimmed)) return null;
  return escapeLike(trimmed);
}
