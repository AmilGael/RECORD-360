/**
 * Computes pagination window for a newest-first feed.
 * Page 1 = newest records; higher page numbers = older records.
 *
 * @param total    Total number of records (from COUNT query)
 * @param page     Requested page number (1-based; clamped to [1, totalPages])
 * @param pageSize Number of records per page
 */
export function pageWindow(
  total: number,
  page: number,
  pageSize: number,
): {
  page: number;
  totalPages: number;
  skip: number;
  hasOlder: boolean;
  hasNewer: boolean;
} {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(Math.max(1, page), totalPages);
  const skip = (clamped - 1) * pageSize;
  return {
    page: clamped,
    totalPages,
    skip,
    hasOlder: clamped < totalPages,
    hasNewer: clamped > 1,
  };
}
