/** Lit brass nameplate that sits on the top rail of a table. Original Pit art; decorative bulbs only. */
export default function TableNameplate({ name, sub }: { name: string; sub?: string }) {
  return (
    <div className="table-nameplate" role="presentation">
      <span className="np-bulbs" aria-hidden="true" />
      <span className="np-gem" aria-hidden="true" />
      <span className="np-text"><b>{name}</b>{sub && <small>{sub}</small>}</span>
      <span className="np-gem" aria-hidden="true" />
    </div>
  );
}
