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

/** Branded loader: a spinning ring around a pulsing brand mark. */
export function BrandLoader({ className = '' }: { className?: string }) {
  return (
    <span role="status" aria-label="Loading" className={`brand-loader ${className}`}>
      <i />
    </span>
  )
}

/** Full-area loading state: centered branded loader with an optional label. */
export function LoadingScreen({ label = 'Loading…', className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 py-20 text-zinc-400 ${className}`}>
      <BrandLoader />
      <p className="animate-pulse text-sm">{label}</p>
    </div>
  )
}
