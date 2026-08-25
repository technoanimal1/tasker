import { useRef, useState } from 'react'
import type { useBrandAssets } from '../hooks/useBrandAssets'
import { ASSET_KINDS, type AssetKind } from '../lib/types'

interface Props {
  api: ReturnType<typeof useBrandAssets>
}

export function BrandAssets({ api }: Props) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Brand assets</h1>
        <p className="text-sm text-zinc-400">
          Shared across every branch and frame. Replace one here and it updates everywhere it's used.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {ASSET_KINDS.map(({ kind, label, accept }) => (
          <AssetCard key={kind} kind={kind} label={label} accept={accept} api={api} />
        ))}
      </div>
    </div>
  )
}

function AssetCard({
  kind,
  label,
  accept,
  api,
}: {
  kind: AssetKind
  label: string
  accept: string
  api: Props['api']
}) {
  const asset = api.byKind(kind)
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      await api.upload(kind, file)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{label}</h2>
        {asset && <span className="text-xs text-zinc-500">{kind}</span>}
      </div>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          handleFile(e.dataTransfer.files[0])
        }}
        className={`checker grid aspect-video cursor-pointer place-items-center overflow-hidden rounded-xl border-2 border-dashed transition ${
          drag ? 'border-brand' : 'border-zinc-700'
        }`}
      >
        {asset ? (
          <img src={asset.url} alt={label} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="px-4 text-center text-xs text-zinc-400">
            {busy ? 'Uploading…' : 'Click or drop a file'}
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          {asset ? (
            <>
              <p className="truncate text-xs text-zinc-300" title={asset.name}>
                {asset.name}
              </p>
              {asset.width && asset.height && (
                <p className="text-[11px] text-zinc-500">
                  {asset.width}×{asset.height}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-zinc-500">No asset yet</p>
          )}
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="shrink-0 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs hover:bg-zinc-700 disabled:opacity-60"
        >
          {busy ? '…' : asset ? 'Replace' : 'Upload'}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  )
}
