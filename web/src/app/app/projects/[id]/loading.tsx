export default function Loading() {
  return (
    <div className="skel" role="status" aria-label="Cargando">
      <div className="skel-line is-title" />
      <div className="skel-line is-short" />
      <div className="skel-line" style={{ height: 38 }} />
      <div className="skel-block" style={{ height: 360 }} />
    </div>
  );
}
