/** A small indeterminate spinner (CSS `.spinner` in index.css). */
export function Spinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`spinner inline-block align-[-0.15em] ${className}`}
      style={{ width: size, height: size }}
    />
  )
}

/** Full-area loading state: centered spinner with an optional label. */
export function LoadingScreen({ label = 'Loading…', className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-20 text-zinc-400 ${className}`}>
      <Spinner size={26} />
      <p className="text-sm">{label}</p>
    </div>
  )
}
