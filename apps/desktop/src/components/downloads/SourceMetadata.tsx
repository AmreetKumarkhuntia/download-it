export function SourceMetadata({ fields }: { fields: [string, string][] }) {
  return (
    <section className="source-section">
      <h3>Source & file</h3>
      <p className="muted">
        URL query strings and fragments are hidden because they may contain access tokens.
      </p>
      <dl className="metadata-grid">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
