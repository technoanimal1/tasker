export type AssetKind = 'background' | 'key_visual' | 'logo'

export const ASSET_KINDS: { kind: AssetKind; label: string; accept: string }[] = [
  { kind: 'background', label: 'Background', accept: 'image/png,image/jpeg,image/webp' },
  { kind: 'key_visual', label: 'Key visual', accept: 'image/png,image/webp' },
  { kind: 'logo', label: 'Logotype', accept: 'image/svg+xml,image/png' },
]

export interface BrandAsset {
  id: string
  kind: AssetKind
  name: string
  storage_path: string
  url: string
  mime: string | null
  width: number | null
  height: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Branch {
  id: string
  name: string
  description: string | null
  parent_branch_id: string | null
  is_default: boolean
  created_at: string
}

export type LayerType = 'asset' | 'image' | 'text' | 'rect'

export interface Layer {
  id: string
  type: LayerType
  name: string
  x: number
  y: number
  w: number
  h: number
  rotation: number
  opacity: number
  z: number
  // asset layers reference a shared brand asset by KIND (resolved at render time)
  assetKind?: AssetKind
  // image layers carry their own image URL (e.g. a per-game key visual or logo)
  src?: string
  // text layers
  text?: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: number
  color?: string
  align?: 'left' | 'center' | 'right'
  // rect layers
  fill?: string
  radius?: number
}

export interface Frame {
  id: string
  branch_id: string
  name: string
  width: number
  height: number
  background_color: string
  layout: Layer[]
  created_at: string
  updated_at: string
}
