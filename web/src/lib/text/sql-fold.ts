import { Prisma } from "@prisma/client";
import { SQL_FOLD_FROM, SQL_FOLD_TO } from "@/lib/text/fold";

const FROM = Prisma.raw(`'${SQL_FOLD_FROM}'`);
const TO = Prisma.raw(`'${SQL_FOLD_TO}'`);

/** Locale-independent fold. `lower` may leave Á as Á; `translate` still maps it. */
export function foldedExpr(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`translate(lower(${column}), ${FROM}, ${TO})`;
}

/** Same fold applied to a bound string, for the parity check against foldForSearch. */
export function foldedValue(value: string): Prisma.Sql {
  return Prisma.sql`translate(lower(${value}), ${FROM}, ${TO})`;
}

/**
 * `column` folded LIKE the escaped pattern folded the same way, with `\` as the
 * escape. Both sides go through one SQL expression, so they cannot disagree.
 * The escapes survive the fold: lower/translate never touch `\`, `%` or `_`.
 */
export function foldedLike(column: Prisma.Sql, pattern: string): Prisma.Sql {
  return Prisma.sql`${foldedExpr(column)} LIKE ('%' || ${foldedValue(pattern)} || '%') ESCAPE '\\'`;
}
