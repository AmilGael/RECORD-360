"use client";
import { BloqueLabel } from "@/components/bloque-label";
import type { PartidaCard } from "@/lib/partida/card-model";

export type PartidaCardGridT = {
  recordsOne: string; recordsMany: string; noActivity: string;
  statusNotStarted: string; statusInProgress: string; statusConcluded: string;
  aging7: string; aging14: string;
};

const STATUS_CLASS = { concluded: "is-concluded", inProgress: "is-active", notStarted: "" } as const;

/**
 * The bloque workspace's partidas as a grid of wide cards. Each card is one
 * button (it opens the preview), named after the partida so the list reads by
 * name first. State is written out as text; the band and accent edge only
 * repeat it.
 */
export function PartidaCardGrid({
  cards, selectedId, onSelect, emptyLabel, t, cardRef,
}: {
  cards: PartidaCard[];
  selectedId?: string;
  onSelect: (id: string) => void;
  /** Shown instead of an empty grid: no partidas in the bloque, or no match for the search. */
  emptyLabel: string;
  t: PartidaCardGridT;
  /** Lets the workspace return focus to the card that opened the preview. */
  cardRef?: (id: string, el: HTMLButtonElement | null) => void;
}) {
  if (cards.length === 0) return <p className="partida-grid-empty">{emptyLabel}</p>;

  const statusText = { concluded: t.statusConcluded, inProgress: t.statusInProgress, notStarted: t.statusNotStarted };
  return (
    <ul className="partida-grid">
      {cards.map((c) => {
        const selected = c.id === selectedId;
        const records = c.recordCount === 1 ? t.recordsOne : t.recordsMany.replace("{count}", String(c.recordCount));
        return (
          <li key={c.id} className={`partida-card${selected ? " is-selected" : ""}${c.aging === "aging14" ? " is-aging-14" : ""}`}>
            <button
              type="button"
              className="partida-card-btn"
              aria-pressed={selected}
              aria-label={`${c.name} — ${c.progressPct}%`}
              title={c.name}
              onClick={() => onSelect(c.id)}
              ref={cardRef ? (el) => cardRef(c.id, el) : undefined}
            >
              {c.blockName && (
                <span className="partida-card-bloque">
                  <BloqueLabel name={c.blockName} vertical />
                </span>
              )}
              <span className="partida-card-body">
                <span className="partida-card-name">{c.name}</span>
                <span className="partida-card-meta mono">
                  <span>{records}</span>
                  <span className="sep" aria-hidden="true">·</span>
                  <span className={c.aging === "aging7" ? "is-aging-7" : undefined}>{c.lastUpdated ?? t.noActivity}</span>
                </span>
                <span className="partida-card-status">
                  <span className={`state-badge ${STATUS_CLASS[c.status]}`}>{statusText[c.status]}</span>
                  <span className="mono">{c.progressPct}%</span>
                  {(c.aging === "aging7" || c.aging === "aging14") && (
                    <span className={`aging-mark is-${c.aging === "aging14" ? "14" : "7"}`}>
                      {c.aging === "aging14" ? t.aging14 : t.aging7}
                    </span>
                  )}
                  {c.tags.map((name) => <span key={name} className="chip">{name}</span>)}
                </span>
              </span>
              <span className="partida-card-track" aria-hidden="true" />
              <span
                className={`partida-card-band${c.status === "concluded" ? " is-done" : ""}`}
                style={{ width: `${c.progressPct}%` }}
                aria-hidden="true"
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
