import { Layers } from "@/components/icons";

/**
 * How a bloque is named wherever it appears (obra cards, Analitica plates,
 * partida cards): the Layers line icon beside the name, never below it. A
 * closed bloque keeps its text badge, so state is never carried by the icon
 * alone. `vertical` turns the same label on its side for the partida card's
 * edge strip; the icon still leads the name.
 */
export function BloqueLabel({
  name,
  closed,
  closedLabel,
  vertical,
}: {
  name: string;
  closed?: boolean;
  /** Text of the closed badge; the call site passes the translated string. */
  closedLabel?: string;
  vertical?: boolean;
}) {
  return (
    <span className={`bloque-label${vertical ? " is-vertical" : ""}`} title={vertical ? name : undefined}>
      <Layers size={14} />
      <span className="bloque-label-name">{name}</span>
      {closed && closedLabel && <span className="state-badge is-archived">{closedLabel}</span>}
    </span>
  );
}
