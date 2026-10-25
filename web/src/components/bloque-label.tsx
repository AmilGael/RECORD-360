import { Layers } from "@/components/icons";

/**
 * How a bloque is named wherever it appears (obra cards, Analitica plates,
 * and the partida cards of Task 9): the Layers line icon beside the name,
 * never below it. A closed bloque keeps its text badge, so state is never
 * carried by the icon alone.
 */
export function BloqueLabel({
  name,
  closed,
  closedLabel,
}: {
  name: string;
  closed?: boolean;
  /** Text of the closed badge; the call site passes the translated string. */
  closedLabel?: string;
}) {
  return (
    <span className="bloque-label">
      <Layers size={14} />
      <span className="bloque-label-name">{name}</span>
      {closed && closedLabel && <span className="state-badge is-archived">{closedLabel}</span>}
    </span>
  );
}
