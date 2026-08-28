export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`}>
      <span className="brand-mark">
        <span className="brand-document">
          <span className="brand-fold" />
          <span className="brand-line brand-line-one" />
          <span className="brand-line brand-line-two" />
          <span className="brand-scanner" />
        </span>
      </span>
      {!compact && (
        <span className="brand-copy">
          <strong>Fatture &amp; Incassi</strong>
          <span>PRO</span>
        </span>
      )}
    </div>
  )
}
