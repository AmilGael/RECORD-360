import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { foldForSearch, searchLikePattern, SQL_FOLD_FROM, SQL_FOLD_TO } from "@/lib/text/fold";
import { foldedLike, foldedValue } from "@/lib/text/sql-fold";

const SPANISH = [
  "Mampostería",
  "Cerámica",
  "paño",
  "PAÑO",
  "ÁÉÍÓÚÜÑ",
  "áéíóúüñ",
  "ÀÄÂÈËÊÌÏÎÒÖÔÙÜÛÇ",
  "àäâèëêìïîòöôùüûç",
  "Plomeria",
  "Vaciado losa",
  "João Conceição",
  "ÃÕ ãõ",
];

describe("foldForSearch", () => {
  it("folds Spanish accents and capitals, and leaves an unaccented string unchanged", () => {
    expect(foldForSearch("ÁÉÍÓÚÜÑ")).toBe("aeiouun");
    expect(foldForSearch("áéíóúüñ")).toBe("aeiouun");
    expect(foldForSearch("Mampostería")).toBe("mamposteria");
    expect(foldForSearch("Cerámica")).toBe("ceramica");
    expect(foldForSearch("PAÑO")).toBe("pano");
    expect(foldForSearch("Plomeria")).toBe("plomeria");
    expect([...SQL_FOLD_FROM].length).toBe(48);
    expect([...SQL_FOLD_TO].length).toBe(48);
  });

  it("leaves the query unfolded (foldedLike folds it in SQL) and escapes LIKE wildcards", () => {
    expect(searchLikePattern(" Mampostería ")).toBe("Mampostería");
    expect(searchLikePattern("   ")).toBeNull();
    expect(searchLikePattern("50%")).toBe("50\\%");
    expect(searchLikePattern("a_b")).toBe("a\\_b");
    expect(searchLikePattern(" 100\\ ")).toBe("100\\\\");
  });
});

describe("SQL fold", () => {
  it("matches foldForSearch on the Spanish set", async () => {
    for (const name of SPANISH) {
      const rows = await prisma.$queryRaw<{ folded: string }[]>(Prisma.sql`SELECT ${foldedValue(name)} AS folded`);
      expect(rows[0]?.folded).toBe(foldForSearch(name));
    }
  });

  it("matches an exact spelling even for letters the SQL map does not fold", async () => {
    // Folding the query in JS used to turn "Škoda" into "skoda" while the
    // column stayed "škoda", so typing the name exactly found nothing.
    const rows = await prisma.$queryRaw<{ exact: boolean; unaccentedPt: boolean; spanish: boolean }[]>(Prisma.sql`
      SELECT
        ${foldedLike(Prisma.raw(`'Taller Škoda'`), searchLikePattern("Škoda")!)} AS exact,
        ${foldedLike(Prisma.raw(`'Visita de João'`), searchLikePattern("joao")!)} AS "unaccentedPt",
        ${foldedLike(Prisma.raw(`'Mampostería'`), searchLikePattern("MAMPOSTERIA")!)} AS spanish
    `);
    expect(rows[0]).toEqual({ exact: true, unaccentedPt: true, spanish: true });
  });

  it("matches 50% and a_b literally", async () => {
    const pct = searchLikePattern("50%")!;
    const under = searchLikePattern("a_b")!;
    const rows = await prisma.$queryRaw<{ pctHit: boolean; pctMiss: boolean; underHit: boolean; underMiss: boolean }[]>(Prisma.sql`
      SELECT
        ${foldedLike(Prisma.raw(`'cost 50% extra'`), pct)} AS "pctHit",
        ${foldedLike(Prisma.raw(`'500'`), pct)} AS "pctMiss",
        ${foldedLike(Prisma.raw(`'a_b'`), under)} AS "underHit",
        ${foldedLike(Prisma.raw(`'axb'`), under)} AS "underMiss"
    `);
    expect(rows[0]).toEqual({ pctHit: true, pctMiss: false, underHit: true, underMiss: false });
  });
});
