import type { Document } from "@prisma/client";
import { formatDate, formatRecordTime } from "@/lib/format/datetime";
import type { Lang } from "@/i18n/dictionaries";
import { PlanosUpload } from "@/components/planos-upload";
import { PlanosGrid, type PlanoCard } from "@/components/planos-grid";
import { PlanosBackfill } from "@/components/planos-backfill";

type PlanosT = {
  empty: string; upload: string; title: string; error: string; uploadedBy: string; view: string;
  search: string; searchCount: string; searchEmpty: string; searchClear: string;
  updated: string; defaultName: string;
  backfill: string; backfillProgress: string; backfillDone: string;
};

export function PlanosTab({
  projectId, docs, authorMap, lang, isAdmin, canEdit, initialQuery, t,
}: {
  projectId: string;
  docs: Document[];
  authorMap: Map<string, string>;
  lang: Lang;
  isAdmin: boolean;
  canEdit: boolean;
  initialQuery: string;
  t: PlanosT;
}) {
  const cards: PlanoCard[] = docs.map((d) => {
    const fileName = d.fileName ?? null;
    const name = d.title?.trim() || fileName || t.defaultName.replace("{date}", formatDate(d.createdAt, lang));
    return {
      id: d.id,
      url: d.url,
      thumbUrl: d.thumbKey ? `/api/media/${d.thumbKey}` : null,
      name,
      fileName,
      fileType: d.fileType,
      kind: d.kind,
      uploader: authorMap.get(d.uploadedById) ?? "—",
      dateText: formatRecordTime(d.createdAt, lang),
    };
  });
  const missing = docs.filter((d) => !d.thumbKey).map((d) => ({ id: d.id, url: d.url, fileName: d.fileName ?? null }));

  return (
    <div>
      {isAdmin && <PlanosUpload projectId={projectId} t={{ upload: t.upload, title: t.title, error: t.error }} />}
      {canEdit && missing.length > 0 && (
        <PlanosBackfill docs={missing} t={{ backfill: t.backfill, backfillProgress: t.backfillProgress, backfillDone: t.backfillDone }} />
      )}
      <PlanosGrid
        docs={cards}
        initialQuery={initialQuery}
        t={{
          empty: t.empty, uploadedBy: t.uploadedBy, search: t.search,
          searchCount: t.searchCount, searchEmpty: t.searchEmpty, searchClear: t.searchClear,
          updated: t.updated,
        }}
      />
    </div>
  );
}
