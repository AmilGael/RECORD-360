export default function Loading() {
  return (
    <div className="skel" role="status" aria-label="Cargando">
      <div className="skel-line is-title" />
      <div className="skel-line is-half" />
      <div className="skel-block" />
      <div className="skel-block" style={{ height: 220 }} />
    </div>
  );
}
