import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTemplate } from '../hooks/useTemplate'
import { useThumbnailsData } from '../hooks/useThumbnailsData'
import { useFigmaAssets } from '../hooks/useFigmaAssets'
import {
  FRAME_SIZES,
  FRAME_DESIGN_KEYS,
  TEXT_LOGO_PRESET,
  branchParams,
  defaultLayout,
  effectiveParams,
  frameSize,
  resolveGrad,
  withDefaults,
  type AssetUrls,
  type GradientParams,
  type ParamOverride,
  type SizeLayout,
  type TemplateParams,
  type Thumbnail,
} from '../lib/thumb'
import { PALETTES, type PaletteMode } from '../lib/palettes'
import { FONT_OPTIONS, WEIGHT_OPTIONS, ensureFont } from '../lib/fonts'
import type { Branch } from '../lib/types'
import type { Role } from '../hooks/useProfile'
import { ThumbnailCard } from './Thumbnail'
import { KvControls, LogoControls, Slider, pct } from './LayoutControls'
import { LazyMount } from './LazyMount'
import { GridTile } from './GridTile'
import { LoadingScreen, Spinner } from './Spinner'
import {
  Undo2,
  Frame,
  Zap,
  Play,
  Pause,
  ListChecks,
  Download,
  Pencil,
  Trash2,
  ChevronDown,
  Contrast,
  ArrowLeft,
} from 'lucide-react'
import { exportThumbPng, exportThumbAnim, animSupported, type StillFormat } from '../lib/exportThumb'
import { PARTICLE_PRESETS, isParticlePreset } from '../lib/animate'
import { ExportProgress, type ExportJob } from './ExportProgress'
import { GenerativeMotion } from './GenerativeMotion'
import { WhiteLogo } from './WhiteLogo'

type ExportFormat = StillFormat | 'anim'

/** Presets that move the artwork, split from the code-drawn particle effects. */
const MOTION_PRESETS = ['float', 'pulse', 'kenburns', 'shine', 'zoom', 'wiggle', 'bounce', 'heartbeat'] as const

// Compact square icon-button styles (toolbar).
const ICON_BTN =
  'grid h-8 w-8 place-items-center rounded-lg border border-zinc-700 text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-40'
const ICON_BTN_ON = 'grid h-8 w-8 place-items-center rounded-lg border border-accent bg-accent/15 text-accent transition'

type Scope = 'global' | 'selected'

interface Props {
  role: Role
  branch: Branch | null
  saveFrameParams: (id: string, frame_params: Record<string, unknown>) => Promise<void>
}

export function ThumbnailStudio({ role, branch, saveFrameParams }: Props) {
  const { template, loading: tLoading, save } = useTemplate()
  const { thumbnails, providerCounts, providerLoading, allItems, allLoading, allDone, loadMoreAll, searchGames, ensureProvider, loading: thLoading, saveOverrides, saveAnim, saveAnimAlpha, saveLogoWhite, saveLogoColor, savePreview, deleteThumbnail, insertThumbnail } = useThumbnailsData()
  const { assetsFor, ensureResolved } = useFigmaAssets(thumbnails)

  const [params, setParams] = useState<TemplateParams | null>(null)
  const [overrides, setOverrides] = useState<Record<string, ParamOverride>>({})
  const [frameParams, setFrameParams] = useState<ParamOverride>({})
  const [scope, setScope] = useState<Scope>('global')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [format, setFormat] = useState<ExportFormat>('png')
  const [playing, setPlaying] = useState(false)
  const [phase, setPhase] = useState(0)
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([])
  const [exportOpen, setExportOpen] = useState(false)
  const [showFrame, setShowFrame] = useState(true)
  // Grid render mode: false = fast baked-WebP overview; true = live layered tiles
  // that react to setting changes. Auto-enables the moment a global setting
  // changes so the whole grid reflects the edit; the toolbar toggle overrides.
  const [liveGrid, setLiveGrid] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'thumbs' | 'controls' | null>(null)
  // Bulk multi-select editor (grid): pick several, change size/variant/colour at once.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  // Left sidebar: provider dropdowns + game search.
  const [sidebarSearch, setSidebarSearch] = useState('')
  // Providers whose game list is expanded in the sidebar (lazy-loads on expand).
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set())
  // Which category the grid shows: a provider name, or null = "All" (infinite scroll).
  const [activeProvider, setActiveProvider] = useState<string | null>(null)
  const [providerPickerOpen, setProviderPickerOpen] = useState(false) // mobile 70% sheet
  // View-only aspect override for the grid/preview (doesn't change saved params).
  const [viewSize, setViewSize] = useState<string | null>(null)
  // Top-bar catalogue-wide game search (server-side, debounced).
  const [gameSearch, setGameSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Thumbnail[]>([])
  const [searching, setSearching] = useState(false)
  // Undo stack for risky actions (delete / bulk / recolour).
  const [undoStack, setUndoStack] = useState<{ label: string; run: () => void | Promise<void> }[]>([])
  // Mobile controls half-sheet: draggable height (top offset in vh). 30 = 70% tall.
  const [sheetTopVh, setSheetTopVh] = useState(30)
  const [sheetDragging, setSheetDragging] = useState(false)
  const sheetDrag = useRef<{ startY: number; startTop: number } | null>(null)
  const cancelRef = useRef(false)
  const gridScrollRef = useRef<HTMLDivElement>(null)
  // Infinite-scroll sentinel: when it scrolls into view, load the next batch.
  const loadMoreRef = useRef<HTMLDivElement>(null)
  // Desktop-width gate. Background preview baking loads full-res Figma layers per
  // tile, which is too heavy on a phone (scrolling a large grid can exhaust
  // memory) — designers bake on desktop; mobile just consumes the baked WebPs.
  const [isWide, setIsWide] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true))
  useEffect(() => {
    const onR = () => setIsWide(window.innerWidth >= 1024)
    window.addEventListener('resize', onR)
    return () => window.removeEventListener('resize', onR)
  }, [])

  const isDesigner = role === 'designer'
  const editingBranch = !!branch && !branch.is_default // a client branch = frame-design mode

  useEffect(() => {
    if (template && !params) setParams(withDefaults(template.params))
  }, [template, params])
  // Seed each thumbnail's saved overrides the first time it appears. The
  // catalogue arrives in waves (infinite-scroll batches, a provider opening,
  // search hits), so this must merge per id — a one-shot "initialise if empty"
  // silently dropped the saved overrides of everything loaded after the first
  // batch, which made per-thumbnail colours/sizes revert to the template on
  // reload even though they were saved. Existing entries are never overwritten,
  // so in-flight local edits survive.
  useEffect(() => {
    setOverrides((cur) => {
      let added = false
      const next = { ...cur }
      for (const t of thumbnails) {
        if (!(t.id in next)) {
          next[t.id] = (t.overrides as ParamOverride) ?? {}
          added = true
        }
      }
      return added ? next : cur
    })
    if (!selectedId && thumbnails.length) setSelectedId(thumbnails[0].id)
  }, [thumbnails, selectedId])
  // Reset the frame-design draft whenever the active branch changes.
  useEffect(() => {
    setFrameParams((branch?.frame_params as ParamOverride) ?? {})
  }, [branch?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const selected = thumbnails.find((t) => t.id === selectedId) ?? null
  const selOv = selectedId ? overrides[selectedId] ?? {} : {}
  // Bulk editing: the SAME controls panel as single-thumbnail editing, applied
  // to every selected tile. A representative (the first selected) drives what
  // the controls read; every edit is fanned out to the whole selection.
  const repId = [...selectedIds][0] ?? null
  const bulkMode = isDesigner && !editingBranch && selectMode && selectedIds.size > 0
  const repOv = repId ? overrides[repId] ?? {} : {}

  // Resolve the open game's Figma layers on demand (grid tiles resolve themselves
  // as they scroll into view; this covers the single-view editor).
  useEffect(() => {
    if (selected) ensureResolved(selected)
  }, [selected, ensureResolved])

  // The composited params used to render a given thumbnail (list, preview, export).
  // The active branch's frame design (frame_params) is layered on for every branch;
  // while editing a client branch we use the live draft so changes preview instantly.
  // The default (main) branch never overlays the template — the template *is* the
  // main design, so frame keys like cornerMode/stroke edit it directly. Only a
  // client branch layers its own frame_params on top.
  const activeFrameParams = editingBranch
    ? frameParams
    : branch && !branch.is_default
      ? ((branch.frame_params as ParamOverride) ?? {})
      : {}
  const paramsForThumb = useMemo(() => {
    return (t: (typeof thumbnails)[number]): TemplateParams | null => {
      if (!params) return null
      return branchParams(effectiveParams(params, overrides[t.id]), activeFrameParams)
    }
  }, [params, overrides, activeFrameParams])

  // Values shown in the control panel (reflect what's being edited).
  const activeParams = params
    ? editingBranch
      ? branchParams(params, frameParams)
      : bulkMode
        ? effectiveParams(params, repOv)
        : scope === 'global'
          ? params
          : effectiveParams(params, selOv)
    : null

  // keep the selected text-logo font warm in the preview
  useEffect(() => {
    if (activeParams?.textLogo) ensureFont(activeParams.fontFamily)
  }, [activeParams?.textLogo, activeParams?.fontFamily])

  // animation preview: drive a 0..1 loop phase while playing
  useEffect(() => {
    if (!playing || !activeParams?.animEnabled) {
      setPhase(0)
      return
    }
    const dur = Math.max(0.5, activeParams.animSpeed) * 1000
    let raf = 0
    const t0 = performance.now()
    const loop = () => {
      setPhase(((performance.now() - t0) % dur) / dur)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, activeParams?.animEnabled, activeParams?.animSpeed])

  // Cmd/Ctrl+Z → undo the last risky action.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        const tag = (e.target as HTMLElement | null)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const globalDirty = useMemo(
    () => (template && params ? JSON.stringify(params) !== JSON.stringify(template.params) : false),
    [params, template],
  )
  const selDirty = useMemo(
    () => (selected ? JSON.stringify(selOv) !== JSON.stringify(selected.overrides ?? {}) : false),
    [selOv, selected],
  )
  const branchDirty = useMemo(
    () => (editingBranch ? JSON.stringify(frameParams) !== JSON.stringify(branch?.frame_params ?? {}) : false),
    [editingBranch, frameParams, branch],
  )
  const bulkDirty = useMemo(() => {
    if (!selectMode || !selectedIds.size) return false
    for (const id of selectedIds) {
      const saved = thumbnails.find((t) => t.id === id)?.overrides ?? {}
      if (JSON.stringify(overrides[id] ?? {}) !== JSON.stringify(saved)) return true
    }
    return false
  }, [selectMode, selectedIds, overrides, thumbnails])
  const dirty = editingBranch
    ? branchDirty
    : bulkMode
      ? bulkDirty
      : scope === 'global'
        ? globalDirty
        : selDirty

  // Loaded games grouped by provider (each sorted by name). Only providers that
  // have been fetched appear here; the sidebar lists every provider from the
  // lightweight index and loads a provider's games when its category opens.
  // MUST stay above the early return below — hooks can't run conditionally.
  const gamesByProvider = useMemo(() => {
    const m = new Map<string, typeof thumbnails>()
    for (const t of thumbnails) {
      const key = t.provider || '—'
      const arr = m.get(key)
      if (arr) arr.push(t)
      else m.set(key, [t])
    }
    for (const v of m.values()) v.sort((a, b) => a.name.localeCompare(b.name))
    return m
  }, [thumbnails])

  // Load data for the active view: a provider's games, or the first "All" batch.
  useEffect(() => {
    if (activeProvider) ensureProvider(activeProvider)
  }, [activeProvider, ensureProvider])
  useEffect(() => {
    if (!activeProvider && allItems.length === 0) loadMoreAll()
  }, [activeProvider, allItems.length, loadMoreAll])

  // Top-bar game search: debounce, then query the whole catalogue by name.
  const gameQuery = gameSearch.trim()
  useEffect(() => {
    if (!gameQuery) {
      setSearchResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const id = setTimeout(async () => {
      const items = await searchGames(gameQuery)
      setSearchResults(items)
      setSearching(false)
    }, 300)
    return () => clearTimeout(id)
  }, [gameQuery, searchGames])

  // Games shown in the grid: search hits (when searching), else a provider's
  // loaded games, or the infinite-scroll All list.
  const gridItems = useMemo(
    () =>
      gameQuery
        ? searchResults
        : activeProvider
          ? thumbnails.filter((t) => t.provider === activeProvider)
          : allItems,
    [gameQuery, searchResults, activeProvider, thumbnails, allItems],
  )
  const totalCatalog = useMemo(() => providerCounts.reduce((n, p) => n + p.count, 0), [providerCounts])
  // Infinite scroll: load the next All batch when the sentinel nears the viewport.
  const allView = !gameQuery && !activeProvider
  useEffect(() => {
    if (!allView) return
    const el = loadMoreRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreAll()
      },
      { rootMargin: '600px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [allView, allDone, gridItems.length, loadMoreAll])

  if (tLoading || thLoading || !params || !activeParams) {
    return <LoadingScreen label="Loading studio…" />
  }

  /** Apply an override patch to every selected thumbnail (local + live). */
  function patchSelected(fn: (cur: ParamOverride) => ParamOverride) {
    setLiveGrid(true)
    setOverrides((o) => {
      const next = { ...o }
      for (const id of selectedIds) next[id] = fn(next[id] ?? {})
      return next
    })
  }

  // Section visibility by role + mode.
  const showDesignerSections = !editingBranch && isDesigner // brand-defining controls
  const showFrameSections = editingBranch || isDesigner // frame design (client branch, or designer on main)
  const showScope = isDesigner && !editingBranch
  const lockedForClient = !isDesigner && !editingBranch // client viewing the main template

  function set<K extends keyof TemplateParams>(key: K, value: TemplateParams[K]) {
    setLiveGrid(true) // a user edit → let the grid reflect it live
    // Aspect is the size you're viewing/designing — always template-level, never
    // a per-thumbnail override (that would resize a single game).
    if (key === 'sizeKey') {
      setParams((prev) => (prev ? { ...prev, sizeKey: value as string } : prev))
      return
    }
    if (bulkMode) {
      patchSelected((cur) => ({ ...cur, [key]: value }))
      return
    }
    if (editingBranch) {
      if (!FRAME_DESIGN_KEYS.includes(key)) return
      setFrameParams((fp) => ({ ...fp, [key]: value }))
    } else if (scope === 'global') setParams((prev) => (prev ? { ...prev, [key]: value } : prev))
    else if (selectedId) setOverrides((o) => ({ ...o, [selectedId]: { ...(o[selectedId] ?? {}), [key]: value } }))
  }
  /** Apply several params at once, honouring the active scope (bulk / global /
   *  this-one). Used for presets, where setting keys one by one would stack
   *  partial states and fight the current scope. */
  function setMany(patch: Partial<TemplateParams>) {
    setLiveGrid(true)
    if (bulkMode) {
      patchSelected((cur) => ({ ...cur, ...patch }))
      return
    }
    if (editingBranch) return // text-logo styling is designer-only
    if (scope === 'global') setParams((prev) => (prev ? { ...prev, ...patch } : prev))
    else if (selectedId) setOverrides((o) => ({ ...o, [selectedId]: { ...(o[selectedId] ?? {}), ...patch } }))
  }
  // Per-size alignment layout. Global scope edits the template; selected scope
  // stores a per-thumbnail layout override (merged over the template by size).
  function setLayout(patch: Partial<SizeLayout>) {
    if (!params) return
    setLiveGrid(true)
    const key = params.sizeKey
    if (bulkMode) {
      const tpl = params
      patchSelected((cur) => {
        const base = cur.layouts?.[key] ?? tpl.layouts?.[key] ?? defaultLayout(key)
        return { ...cur, layouts: { ...(cur.layouts ?? {}), [key]: { ...base, ...patch } } }
      })
      return
    }
    if (scope === 'global') {
      setParams((prev) => {
        if (!prev) return prev
        const cur = prev.layouts?.[key] ?? defaultLayout(key)
        return { ...prev, layouts: { ...(prev.layouts ?? {}), [key]: { ...cur, ...patch } } }
      })
    } else if (selectedId) {
      setOverrides((o) => {
        const curOv = o[selectedId] ?? {}
        const cur = curOv.layouts?.[key] ?? params.layouts?.[key] ?? defaultLayout(key)
        return { ...o, [selectedId]: { ...curOv, layouts: { ...(curOv.layouts ?? {}), [key]: { ...cur, ...patch } } } }
      })
    }
  }
  // Drop the layout for the current size (revert to template / auto).
  function resetLayout() {
    if (!params) return
    const key = params.sizeKey
    if (scope === 'global') {
      setParams((prev) => {
        if (!prev?.layouts) return prev
        const next = { ...prev.layouts }
        delete next[key]
        return { ...prev, layouts: next }
      })
    } else if (selectedId) {
      setOverrides((o) => {
        const curOv = o[selectedId]
        if (!curOv?.layouts) return o
        const next = { ...curOv.layouts }
        delete next[key]
        return { ...o, [selectedId]: { ...curOv, layouts: next } }
      })
    }
  }
  // Gradient edits: if the effective gradient for this size comes from a per-size
  // override, keep editing there (so the slider stays live); otherwise edit the
  // flat globals. Prevents the "dead slider" once a per-size gradient exists.
  function setGrad<K extends keyof GradientParams>(key: K, value: number) {
    if (!params) return
    const size = params.sizeKey
    if (bulkMode) {
      const tpl = params
      patchSelected((cur) => {
        const basePer = tpl.gradients?.[size]
        const ovPer = cur.gradients?.[size]
        if (ovPer || basePer) {
          const merged: GradientParams = { ...resolveGrad(tpl), ...(ovPer ?? {}), [key]: value }
          return { ...cur, gradients: { ...(cur.gradients ?? {}), [size]: merged } }
        }
        return { ...cur, [key]: value }
      })
      return
    }
    if (editingBranch) {
      setFrameParams((fp) => {
        const per = (fp.gradients as TemplateParams['gradients'])?.[size]
        if (per) return { ...fp, gradients: { ...(fp.gradients ?? {}), [size]: { ...per, [key]: value } } }
        return { ...fp, [key]: value }
      })
    } else if (scope === 'global') {
      setParams((prev) => {
        if (!prev) return prev
        if (prev.gradients?.[size]) return { ...prev, gradients: { ...prev.gradients, [size]: { ...prev.gradients[size], [key]: value } } }
        return { ...prev, [key]: value }
      })
    } else if (selectedId) {
      setOverrides((o) => {
        const cur = o[selectedId] ?? {}
        const basePer = params.gradients?.[size]
        const ovPer = cur.gradients?.[size]
        if (ovPer || basePer) {
          const merged: GradientParams = { ...resolveGrad(params), ...(ovPer ?? {}), [key]: value }
          return { ...o, [selectedId]: { ...cur, gradients: { ...(cur.gradients ?? {}), [size]: merged } } }
        }
        return { ...o, [selectedId]: { ...cur, [key]: value } }
      })
    }
  }
  async function handleSave() {
    if (!params) return
    setSaving(true)
    try {
      if (editingBranch && branch) await saveFrameParams(branch.id, frameParams)
      else if (bulkMode) {
        for (const id of selectedIds) await saveOverrides(id, overrides[id] ?? {})
      } else if (scope === 'global') await save(params)
      else if (selectedId) await saveOverrides(selectedId, selOv)
    } finally {
      setSaving(false)
    }
  }
  function handleReset() {
    if (editingBranch) setFrameParams((branch?.frame_params as ParamOverride) ?? {})
    else if (scope === 'global') template && setParams(withDefaults(template.params))
    else if (selectedId) setOverrides((o) => ({ ...o, [selectedId]: {} }))
  }
  async function exportOne(t: (typeof thumbnails)[number], pp: TemplateParams): Promise<number> {
    if (format === 'anim') return exportThumbAnim(t, pp)
    return exportThumbPng(t, pp, 1, format)
  }
  async function runExport(list: (typeof thumbnails)) {
    if (!list.length || exporting) return
    cancelRef.current = false
    const fmtLabel = format === 'anim' ? 'WEBM' : format.toUpperCase()
    setExportJobs(list.map((t) => ({ id: t.id, name: t.name, format: fmtLabel, status: 'pending' })))
    setExportOpen(true)
    setExporting(true)
    try {
      for (const t of list) {
        if (cancelRef.current) {
          setExportJobs((js) => js.map((j) => (j.status === 'pending' ? { ...j, status: 'error', error: 'Cancelled' } : j)))
          break
        }
        setExportJobs((js) => js.map((j) => (j.id === t.id ? { ...j, status: 'active' } : j)))
        try {
          const pp = paramsForThumb(t)
          const size = pp ? await exportOne(t, pp) : 0
          setExportJobs((js) => js.map((j) => (j.id === t.id ? { ...j, status: 'done', size } : j)))
        } catch (e) {
          setExportJobs((js) => js.map((j) => (j.id === t.id ? { ...j, status: 'error', error: (e as Error).message } : j)))
        }
        await new Promise((r) => setTimeout(r, 120))
      }
    } finally {
      setExporting(false)
    }
  }
  const exportAll = () => runExport(thumbnails)

  // ── Undo ─────────────────────────────────────────────────────────────────
  function pushUndo(label: string, run: () => void | Promise<void>) {
    setUndoStack((s) => [...s.slice(-49), { label, run }])
  }
  function undo() {
    setUndoStack((s) => {
      const entry = s[s.length - 1]
      if (entry) Promise.resolve(entry.run())
      return s.slice(0, -1)
    })
  }
  function restoreOverride(id: string, prev: ParamOverride | undefined) {
    setOverrides((o) => ({ ...o, [id]: prev ?? {} }))
    saveOverrides(id, prev ?? {})
  }

  // Mobile: open the controls sheet tall (top at 12vh → ~88vh sheet) so the
  // pinned live preview sits above a comfortable scrolling controls area.
  function openControls() {
    setSheetTopVh(12)
    setMobilePanel('controls')
  }
  // Open a specific thumbnail's editor (single-view + controls scoped to it).
  function openEditor(id: string) {
    setSelectedId(id)
    if (showScope) setScope('selected')
    openControls()
  }
  // Drag the sheet handle to resize/maximize; release snaps to full / 70% / close.
  function onSheetDown(e: React.PointerEvent) {
    sheetDrag.current = { startY: e.clientY, startTop: sheetTopVh }
    setSheetDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  function onSheetMove(e: React.PointerEvent) {
    if (!sheetDrag.current) return
    const dvh = ((e.clientY - sheetDrag.current.startY) / window.innerHeight) * 100
    setSheetTopVh(Math.max(4, Math.min(92, sheetDrag.current.startTop + dvh)))
  }
  function onSheetUp() {
    if (!sheetDrag.current) return
    sheetDrag.current = null
    setSheetDragging(false)
    setSheetTopVh((t) => (t > 60 ? (setMobilePanel(null), 30) : t < 20 ? 6 : 30))
  }

  async function handleDelete(id: string, name: string) {
    if (typeof window !== 'undefined' && !window.confirm(`Delete “${name}”?\nThis removes the thumbnail from the dashboard (the Figma source is untouched).`)) return
    const snapshot = thumbnails.find((t) => t.id === id)
    if (selectedId === id) setSelectedId(thumbnails.find((t) => t.id !== id)?.id ?? null)
    await deleteThumbnail(id)
    if (snapshot) pushUndo(`Deleted “${name}”`, () => insertThumbnail(snapshot))
  }

  // Quick per-thumbnail recolour (designer): set + persist the colour override.
  function recolorThumb(id: string, palette: PaletteMode, colorKey: string, record = true) {
    if (record) {
      const prev = overrides[id]
      pushUndo('Recolour', () => restoreOverride(id, prev))
    }
    const next: ParamOverride = { ...(overrides[id] ?? {}), palette, colorKey }
    setOverrides((o) => ({ ...o, [id]: next }))
    saveOverrides(id, next)
  }

  // Pick the frame colour automatically from a thumbnail's background (bg-color fn).
  async function autoColorThumb(t: (typeof thumbnails)[number], record = true): Promise<boolean> {
    if (!t.figma_file_key || !t.figma_bg_node) return false
    const { data } = await supabase.functions.invoke('bg-color', {
      body: { fileKey: t.figma_file_key, node: t.figma_bg_node },
    })
    const key = (data as { colorKey?: string })?.colorKey
    if (!key) return false
    recolorThumb(t.id, ((data as { palette?: PaletteMode }).palette ?? 'dark'), key, record)
    return true
  }

  // ── Bulk (multi-select) helpers ──────────────────────────────────────────
  function toggleSelected(id: string) {
    setSelectedIds((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  function exitSelect() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }
  async function bulkPatch(patch: ParamOverride) {
    if (!selectedIds.size) return
    const prev = [...selectedIds].map((id) => [id, overrides[id]] as const)
    pushUndo('Bulk edit', () => prev.forEach(([id, o]) => restoreOverride(id, o)))
    setBulkBusy(true)
    try {
      for (const id of selectedIds) {
        const cur = overrides[id] ?? {}
        const next: ParamOverride = { ...cur, ...patch }
        if (patch.logo) next.logo = { ...(cur.logo ?? {}), ...patch.logo }
        setOverrides((o) => ({ ...o, [id]: next }))
        await saveOverrides(id, next)
      }
    } finally {
      setBulkBusy(false)
    }
  }
  async function bulkAutoColor() {
    if (!selectedIds.size) return
    const prev = [...selectedIds].map((id) => [id, overrides[id]] as const)
    pushUndo('Bulk auto-colour', () => prev.forEach(([id, o]) => restoreOverride(id, o)))
    setBulkBusy(true)
    try {
      for (const id of selectedIds) {
        const t = thumbnails.find((x) => x.id === id)
        if (t) await autoColorThumb(t, false)
      }
    } finally {
      setBulkBusy(false)
    }
  }

  const p = activeParams
  // Aspect used for rendering the grid/preview — a view-only override wins over
  // the saved sizeKey, so you can preview every thumbnail at another size without
  // editing the template.
  const effSizeKey = viewSize ?? p.sizeKey
  const size = frameSize(effSizeKey)
  const previewW = Math.min(520, Math.round(size.w * (460 / size.h)))
  const gridW = Math.min(260, Math.round(size.w * (260 / size.h)))
  const selectedParamsBase = selected ? paramsForThumb(selected) : null
  const selectedParams = selectedParamsBase ? { ...selectedParamsBase, sizeKey: effSizeKey } : null
  // Single canvas only when a specific thumbnail is targeted; otherwise a grid.
  const singleView = !editingBranch && scope === 'selected' && !!selected
  const headerTitle = singleView
    ? (selected?.name ?? '')
    : gameQuery
      ? `Search · ${gridItems.length}`
      : activeProvider
        ? `${activeProvider} · ${gridItems.length}`
        : `All · ${gridItems.length}${totalCatalog ? ` / ${totalCatalog}` : ''}`
  const previewPhase = playing ? phase : 0
  const canExportAnim = animSupported()
  const sidebarQuery = sidebarSearch.trim().toLowerCase()

  // Below lg the side panels become bottom-sheet modals (toggled by the mobile
  // toolbar); at lg they revert to inline sidebars. `mobilePanel` picks which is open.
  const sheetChrome =
    'z-40 flex-col overflow-hidden border border-zinc-800 bg-zinc-950 shadow-2xl ' +
    'lg:static lg:inset-auto lg:z-auto lg:rounded-xl lg:shadow-none lg:bg-zinc-900/50 lg:max-h-none lg:shrink-0'
  // Thumbnails: near-full sheet. Controls: a bottom HALF sheet so the tapped
  // thumbnail stays visible above while you edit.
  const leftSheet = `fixed inset-x-2 bottom-2 top-16 rounded-2xl ${sheetChrome} lg:w-[236px] ${mobilePanel === 'thumbs' ? 'flex' : 'hidden'} lg:flex`
  const rightSheet = `fixed inset-x-0 bottom-0 rounded-t-2xl ${sheetChrome} lg:w-[300px] ${mobilePanel === 'controls' ? 'flex' : 'hidden'} lg:flex`

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100vh-7.5rem)]">
      {/* Top bar — title/count + game search (left) and format + export (right),
          between the app header and the workspace. */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {singleView && (
            <button
              onClick={() => setScope('global')}
              title="Back to all thumbnails"
              aria-label="Back"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-zinc-700 text-zinc-200 transition hover:bg-zinc-800"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <span className="hidden shrink-0 truncate text-sm font-medium text-zinc-200 sm:inline">{headerTitle}</span>
          {!singleView && (
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                value={gameSearch}
                onChange={(e) => setGameSearch(e.target.value)}
                placeholder="Search all games…"
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-900 pl-8 pr-8 text-xs text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-accent"
              />
              {searching ? (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2"><Spinner size={13} /></span>
              ) : gameSearch ? (
                <button onClick={() => setGameSearch('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-zinc-500 hover:text-zinc-300">✕</button>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
            className="h-9 rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none focus:border-accent"
            title="Export format"
          >
            <option value="png">PNG</option>
            <option value="webp">WebP</option>
            <option value="avif">AVIF</option>
            <option value="anim" disabled={!canExportAnim}>
              WebM
            </option>
          </select>
          <button
            onClick={() => (singleView && selected ? runExport([selected]) : exportAll())}
            disabled={exporting}
            title={singleView ? 'Export this thumbnail' : 'Export all'}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-zinc-900 transition hover:bg-accent-dark disabled:opacity-50"
          >
            {exporting ? <Spinner size={14} /> : <Download size={16} />}
            <span className="hidden sm:inline">{singleView ? 'Export' : 'Export all'}</span>
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
      {/* Backdrop behind an open mobile sheet */}
      {mobilePanel && (
        <button
          aria-label="Close panel"
          onClick={() => setMobilePanel(null)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      )}

      {/* Mobile: bottom-fixed provider selector + colour/white logo switcher */}
      {!singleView && !mobilePanel && !providerPickerOpen && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex items-center justify-center gap-2 px-3 lg:hidden"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => setProviderPickerOpen(true)}
            className="pointer-events-auto flex min-w-0 items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/95 px-4 py-2.5 text-xs font-semibold text-zinc-200 shadow-xl backdrop-blur"
          >
            <span className="max-w-[38vw] truncate">{activeProvider ?? 'All providers'}</span>
            <ChevronDown size={14} className="text-zinc-500" />
          </button>
          <div className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900/95 p-1 text-xs shadow-xl backdrop-blur">
            {(['color', 'white'] as const).map((v) => (
              <button
                key={v}
                onClick={() => {
                  setParams((prev) => (prev ? { ...prev, logoVariant: v } : prev))
                  setLiveGrid(true)
                }}
                className={`rounded-full px-4 py-2 font-semibold transition ${
                  p.logoVariant === v ? 'bg-accent text-zinc-900 shadow' : 'text-zinc-300'
                }`}
              >
                {v === 'color' ? 'Colour' : 'White'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mobile: 70%-height provider picker */}
      {providerPickerOpen && (
        <>
          <button
            aria-label="Close"
            onClick={() => setProviderPickerOpen(false)}
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          />
          <div className="fixed inset-x-0 bottom-0 z-40 flex h-[70vh] flex-col rounded-t-2xl border-t border-zinc-700 bg-zinc-900 shadow-2xl lg:hidden">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <span className="text-sm font-semibold text-zinc-100">Choose provider</span>
              <button
                onClick={() => setProviderPickerOpen(false)}
                className="grid h-7 w-7 place-items-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto p-2">
              <button
                onClick={() => {
                  setActiveProvider(null)
                  setProviderPickerOpen(false)
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                  activeProvider === null ? 'bg-accent/15 text-accent' : 'text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                <span>All providers</span>
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">{totalCatalog}</span>
              </button>
              {providerCounts.map(({ provider, count }) => (
                <button
                  key={provider}
                  onClick={() => {
                    setActiveProvider(provider)
                    ensureProvider(provider)
                    setProviderPickerOpen(false)
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                    activeProvider === provider ? 'bg-accent/15 text-accent' : 'text-zinc-200 hover:bg-zinc-800'
                  }`}
                >
                  <span className="truncate">{provider}</span>
                  <span className="ml-2 shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">{count}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* LEFT — thumbnails */}
      <aside className={leftSheet}>
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
          <span className="text-sm font-medium">Thumbnails</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">{thumbnails.length}</span>
            <button
              onClick={() => setMobilePanel(null)}
              className="grid h-6 w-6 place-items-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 lg:hidden"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="border-b border-zinc-800 p-2">
          <div className="relative">
            <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="Search games…"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/70 py-1.5 pl-8 pr-7 text-xs text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-accent"
            />
            {sidebarSearch && (
              <button onClick={() => setSidebarSearch('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-zinc-500 hover:text-zinc-300">✕</button>
            )}
          </div>
        </div>
        <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
          {!sidebarQuery && (
            <button
              onClick={() => {
                setActiveProvider(null)
                setMobilePanel(null)
              }}
              className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide transition ${
                activeProvider === null ? 'bg-accent/15 text-accent' : 'text-zinc-300 hover:bg-zinc-800/50'
              }`}
            >
              <span>All providers</span>
              <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">{totalCatalog}</span>
            </button>
          )}
          {providerCounts.map(({ provider, count }) => {
            const loaded = gamesByProvider.get(provider) ?? []
            const shown = sidebarQuery ? loaded.filter((t) => t.name.toLowerCase().includes(sidebarQuery)) : loaded
            if (sidebarQuery && shown.length === 0) return null
            const open = !!sidebarQuery || expandedProviders.has(provider)
            return (
              <div key={provider}>
                <button
                  onClick={() => {
                    // Filter the grid to this provider (and load its games).
                    setActiveProvider(provider)
                    ensureProvider(provider)
                    setMobilePanel(null)
                    setExpandedProviders((s) => {
                      const n = new Set(s)
                      if (n.has(provider)) n.delete(provider)
                      else n.add(provider)
                      return n
                    })
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide transition ${
                    activeProvider === provider ? 'bg-accent/15 text-accent' : 'text-zinc-300 hover:bg-zinc-800/50'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className={`text-zinc-500 transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
                    {provider}
                  </span>
                  <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                    {sidebarQuery ? `${shown.length}/${count}` : count}
                  </span>
                </button>
                {open && (
                  <div className="mt-0.5 space-y-0.5 pl-1">
                    {providerLoading === provider && loaded.length === 0 && (
                      <p className="flex items-center gap-1.5 px-2 py-2 text-[11px] text-zinc-500">
                        <Spinner size={12} /> Loading…
                      </p>
                    )}
                    {shown.map((t) => {
                      const hasOv = Object.keys(overrides[t.id] ?? {}).length > 0
                      const pp = paramsForThumb(t)
                      return (
                        <div key={t.id} className="group/item relative">
                          <button
                            onClick={() => openEditor(t.id)}
                            className={`flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition ${
                              t.id === selectedId ? 'bg-zinc-800 ring-1 ring-zinc-700' : 'hover:bg-zinc-800/50'
                            }`}
                          >
                            <div className="overflow-hidden rounded">
                              {pp && (
                                <LazyMount w={52} h={(52 * frameSize(pp.sizeKey).h) / frameSize(pp.sizeKey).w} rootMargin="300px">
                                  <ThumbnailCard thumb={t} params={pp} assets={assetsFor(t)} displayW={52} showFrame={showFrame} />
                                </LazyMount>
                              )}
                            </div>
                            <div className="min-w-0 flex-1 pr-6">
                              <p className="truncate text-xs font-medium text-zinc-200">{t.name}</p>
                              <p className="text-[10px] text-zinc-500">{hasOv ? 'custom' : t.provider}</p>
                            </div>
                          </button>
                          {isDesigner && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(t.id, t.name)
                              }}
                              title="Delete thumbnail"
                              aria-label={`Delete ${t.name}`}
                              className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-zinc-500 opacity-0 transition hover:bg-red-500/15 hover:text-red-400 focus:opacity-100 group-hover/item:opacity-100"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          {sidebarQuery && !thumbnails.some((t) => t.name.toLowerCase().includes(sidebarQuery)) && (
            <p className="px-2 py-4 text-center text-xs text-zinc-500">
              No loaded games match “{sidebarSearch}”. Open a provider to load its games.
            </p>
          )}
        </div>
        <div className="border-t border-zinc-800 p-2">
          <button
            onClick={exportAll}
            disabled={exporting}
            className="w-full rounded-lg bg-zinc-800 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-60"
          >
            {exporting ? 'Exporting…' : 'Export all'}
          </button>
        </div>
      </aside>

      {/* CENTER — canvas / grid */}
      <div className="flex min-h-[55vh] flex-1 flex-col overflow-visible rounded-xl border border-zinc-800 bg-zinc-950/40 lg:min-h-0 lg:overflow-hidden">
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-zinc-800 px-4 py-2.5">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <select
              value={effSizeKey}
              onChange={(e) => setViewSize(e.target.value)}
              title="Preview aspect size (view only)"
              className="h-8 rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none transition focus:border-zinc-500"
            >
              {FRAME_SIZES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.key}
                </option>
              ))}
            </select>
            {isDesigner && (
              <button onClick={undo} disabled={!undoStack.length} title="Undo (⌘Z)" className={ICON_BTN}>
                <Undo2 size={16} />
              </button>
            )}
            <button
              onClick={() => {
                setShowFrame((v) => !v)
                setLiveGrid(true)
              }}
              className={showFrame ? ICON_BTN_ON : ICON_BTN}
              title="Show / hide the frame + provider badge"
            >
              <Frame size={16} />
            </button>
            {!singleView && (
              <button
                onClick={() => setLiveGrid((v) => !v)}
                className={liveGrid ? ICON_BTN_ON : ICON_BTN}
                title={liveGrid ? 'Live tiles (react to edits). Tap for fast overview.' : 'Fast baked overview. Tap for live tiles.'}
              >
                <Zap size={16} />
              </button>
            )}
            {p.animEnabled && (
              <button onClick={() => setPlaying((v) => !v)} className={ICON_BTN} title={playing ? 'Pause' : 'Play'}>
                {playing ? <Pause size={16} /> : <Play size={16} />}
              </button>
            )}
            {!singleView && isDesigner && (
              <button
                onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
                className={selectMode ? ICON_BTN_ON : ICON_BTN}
                title={selectMode ? `Selecting${selectedIds.size ? ` · ${selectedIds.size}` : ''}` : 'Select multiple'}
              >
                <ListChecks size={16} />
              </button>
            )}
          </div>
        </div>
        {singleView && selected && selectedParams ? (
          <div
            className="flex flex-1 items-center justify-center overflow-auto p-4 sm:p-8"
            style={{
              backgroundImage: 'radial-gradient(circle at center, #1a1c22 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }}
          >
            <div className="shadow-2xl">
              <ThumbnailCard thumb={selected} params={selectedParams} assets={assetsFor(selected)} displayW={previewW} phase={previewPhase} showFrame={showFrame} />
            </div>
          </div>
        ) : (
          <div
            ref={gridScrollRef}
            className="overflow-visible p-4 pb-24 sm:p-6 lg:flex-1 lg:overflow-auto lg:pb-6"
            style={{
              backgroundImage: 'radial-gradient(circle at center, #1a1c22 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }}
          >
            {selectMode && (
              <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-zinc-900/95 p-2 text-xs shadow-lg backdrop-blur">
                <span className="font-medium text-zinc-100">{selectedIds.size} selected</span>
                <button onClick={() => setSelectedIds(new Set(gridItems.map((t) => t.id)))} className="rounded-md border border-zinc-700 px-2 py-1 text-zinc-300 hover:bg-zinc-800">All</button>
                <button onClick={() => setSelectedIds(new Set())} className="rounded-md border border-zinc-700 px-2 py-1 text-zinc-300 hover:bg-zinc-800">None</button>
                <span className="mx-1 h-4 w-px bg-zinc-700" />
                <span className="text-zinc-400">Logo</span>
                <button disabled={!selectedIds.size || bulkBusy} onClick={() => bulkPatch({ logoVariant: 'white' })} className="rounded-md border border-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-800 disabled:opacity-40">White</button>
                <button disabled={!selectedIds.size || bulkBusy} onClick={() => bulkPatch({ logoVariant: 'color' })} className="rounded-md border border-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-800 disabled:opacity-40">Colour</button>
                <button disabled={!selectedIds.size || bulkBusy} onClick={bulkAutoColor} className="rounded-md border border-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-800 disabled:opacity-40" title="Pick each frame colour from its background">Auto colour</button>
                <span className="ml-1 hidden text-[11px] text-zinc-500 lg:inline">Size &amp; placement → controls panel</span>
                {bulkBusy && <span className="text-zinc-400">working…</span>}
              </div>
            )}
            <div
              className="grid grid-cols-2 gap-3 sm:gap-4 lg:[grid-template-columns:repeat(auto-fill,minmax(var(--gw),1fr))]"
              style={{ '--gw': `${gridW}px` } as React.CSSProperties}
            >
              {gridItems.map((t) => {
                const pp0 = paramsForThumb(t)
                if (!pp0) return null
                const active = t.id === selectedId
                const picked = selectedIds.has(t.id)
                const pp = { ...pp0, sizeKey: effSizeKey }
                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      if (selectMode) {
                        toggleSelected(t.id)
                        return
                      }
                      openEditor(t.id)
                    }}
                    className={`group relative flex cursor-pointer flex-col items-center gap-2 rounded-xl p-2 transition ${
                      selectMode && picked
                        ? 'bg-accent/10 ring-2 ring-accent'
                        : active
                          ? 'bg-zinc-800/60 ring-1 ring-zinc-600'
                          : 'hover:bg-zinc-800/30'
                    }`}
                    title={selectMode ? 'Toggle selection' : showScope ? 'Open in canvas' : t.name}
                  >
                    {selectMode && (
                      <div
                        className={`absolute left-3 top-3 z-10 grid h-5 w-5 place-items-center rounded-md border text-[11px] leading-none ${
                          picked ? 'border-accent bg-accent text-zinc-900' : 'border-zinc-400 bg-black/50 text-transparent'
                        }`}
                      >
                        ✓
                      </div>
                    )}
                    <div className="w-full overflow-hidden rounded-lg shadow-lg">
                      <GridTile
                        thumb={t}
                        params={pp}
                        assets={assetsFor(t)}
                        showFrame={showFrame}
                        gridW={gridW}
                        phase={previewPhase}
                        live={liveGrid || selectMode || (viewSize != null && viewSize !== p.sizeKey)}
                        canBake={isDesigner && isWide}
                        onBaked={savePreview}
                        onNeedAssets={() => ensureResolved(t)}
                      />
                    </div>
                    {isDesigner && !selectMode && (
                      <div className="absolute right-3 top-3 opacity-0 transition group-hover:opacity-100">
                        <ThumbColorPicker
                          palette={pp.palette}
                          colorKey={pp.colorKey}
                          onPick={(mode, key) => recolorThumb(t.id, mode, key)}
                        />
                      </div>
                    )}
                    {isDesigner && !selectMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditor(t.id)
                        }}
                        title={`Edit ${t.name}`}
                        aria-label={`Edit ${t.name}`}
                        className="absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white shadow-md backdrop-blur transition hover:bg-black/80 lg:opacity-0 lg:group-hover:opacity-100"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                    )}
                    {isDesigner && !selectMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(t.id, t.name)
                        }}
                        title="Remove thumbnail"
                        aria-label={`Remove ${t.name}`}
                        className="absolute left-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-full bg-black/50 text-zinc-200 opacity-0 shadow-md transition hover:bg-red-500/80 hover:text-white group-hover:opacity-100"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                    <span className="max-w-full truncate text-[11px] text-zinc-400">{t.name}</span>
                  </div>
                )
              })}
            </div>

            {gridItems.length === 0 &&
              (searching || allLoading || (activeProvider && providerLoading === activeProvider) ? (
                <LoadingScreen label={gameQuery ? 'Searching…' : 'Loading games…'} className="py-16" />
              ) : gameQuery ? (
                <p className="py-16 text-center text-sm text-zinc-500">No games match “{gameSearch}”.</p>
              ) : (
                <p className="py-16 text-center text-sm text-zinc-500">No games here yet.</p>
              ))}

            {/* "All" view: infinite scroll — a sentinel loads the next batch as it
                nears the viewport; a spinner shows while the batch fetches. */}
            {!gameQuery && !activeProvider && (
              <div ref={loadMoreRef} className="mb-20 mt-5 flex items-center justify-center lg:mb-5">
                {allLoading ? (
                  <span className="flex items-center gap-2 text-xs text-zinc-400">
                    <Spinner size={16} /> Loading more…
                  </span>
                ) : allDone && gridItems.length > 0 ? (
                  <span className="text-xs text-zinc-600">That’s all {gridItems.length} thumbnails.</span>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>

      {/* RIGHT — controls */}
      <aside className={rightSheet} style={{ top: `${sheetTopVh}vh`, transition: sheetDragging ? 'none' : 'top 0.22s ease' }}>
        <div
          onPointerDown={onSheetDown}
          onPointerMove={onSheetMove}
          onPointerUp={onSheetUp}
          onPointerCancel={onSheetUp}
          className="flex shrink-0 cursor-grab touch-none justify-center py-2.5 active:cursor-grabbing lg:hidden"
          aria-label="Drag to resize (up to maximize, down to close)"
        >
          <div className="h-1.5 w-10 rounded-full bg-zinc-600" />
        </div>
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 pb-2.5 lg:hidden">
          <span className="text-sm font-medium">Edit{selected ? ` · ${selected.name}` : ''}</span>
          <button
            onClick={() => setMobilePanel(null)}
            className="grid h-6 w-6 place-items-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Mobile: pinned live preview of the thumbnail being edited. Stays fixed
            at the top of the sheet while the controls below scroll, so slider and
            colour changes are visible as you make them. Hidden on lg (the desktop
            canvas already shows the live preview). */}
        {selected && selectedParams && (
          <div
            className="shrink-0 overflow-hidden border-b border-zinc-800 lg:hidden"
            style={{
              height: '23vh',
              backgroundImage: 'radial-gradient(circle at center, #1a1c22 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }}
          >
            <FitPreview
              thumb={selected}
              params={selectedParams}
              assets={assetsFor(selected)}
              showFrame={showFrame}
              phase={previewPhase}
            />
          </div>
        )}

        <div className="border-b border-zinc-800 p-3">
          {editingBranch ? (
            <>
              <div className="rounded-lg bg-zinc-800/70 px-3 py-2 text-xs">
                <span className="font-medium text-zinc-100">Frame design</span>
                <span className="text-zinc-500"> · {branch?.name}</span>
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                Customising this client branch. Background, logo size and game colours are inherited from the main template.
              </p>
            </>
          ) : bulkMode ? (
            <>
              <div className="flex items-center justify-between rounded-lg bg-accent/10 px-3 py-2 text-xs">
                <span className="font-medium text-accent">{selectedIds.size} selected</span>
                <button onClick={exitSelect} className="text-[11px] text-zinc-400 underline hover:text-zinc-200">
                  done
                </button>
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                Editing all {selectedIds.size} at once — the controls below show “{thumbnails.find((t) => t.id === repId)?.name}”. Changes preview on the selected tiles; Save applies them to every one.
              </p>
            </>
          ) : showScope ? (
            <>
              <Seg
                options={[
                  { value: 'global', label: 'All thumbnails' },
                  { value: 'selected', label: 'This one', disabled: !selected },
                ]}
                value={scope}
                onChange={(v) => setScope(v as Scope)}
              />
              <p className="mt-2 text-[11px] text-zinc-500">
                {scope === 'global' ? 'Editing the main template — applies to all.' : `Overriding “${selected?.name}” only.`}
              </p>
            </>
          ) : (
            <p className="text-[11px] text-zinc-500">Main template (read-only). Select your branch above to customise the frame design.</p>
          )}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-3">
          {lockedForClient && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-3 text-xs text-zinc-400">
              You have client access. Pick your branch from the top bar to change the frame design and choose colour or white logotypes.
            </div>
          )}

          {showFrameSections && (
            <Section title="Frame">
              <Row label="Aspect">
                <select
                  value={p.sizeKey}
                  onChange={(e) => set('sizeKey', e.target.value)}
                  className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs outline-none focus:border-zinc-500"
                >
                  {FRAME_SIZES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.key}
                    </option>
                  ))}
                </select>
              </Row>
              <Seg options={['sharp', 'friendly', 'playful'].map((o) => ({ value: o, label: o }))} value={p.cornerMode} onChange={(v) => set('cornerMode', v as TemplateParams['cornerMode'])} />
            </Section>
          )}

          {showDesignerSections && (() => {
            // In the selected-thumbnail scope, persist the colour immediately (like
            // the quick picker); in global scope it edits the template via set().
            const pickPalette = (v: PaletteMode) =>
              scope === 'selected' && selectedId ? recolorThumb(selectedId, v, p.colorKey) : set('palette', v)
            const pickColor = (key: string) =>
              scope === 'selected' && selectedId ? recolorThumb(selectedId, p.palette, key) : set('colorKey', key)
            return (
              <Section title={scope === 'selected' && selected ? `Colour · ${selected.name}` : 'Colour'}>
                <Seg options={['dark', 'light'].map((o) => ({ value: o, label: o }))} value={p.palette} onChange={(v) => pickPalette(v as PaletteMode)} />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {PALETTES[p.palette].map((c) => (
                    <button
                      key={c.key}
                      title={c.label}
                      onClick={() => pickColor(c.key)}
                      className={`h-6 w-6 rounded-full ring-2 ${p.colorKey === c.key ? 'ring-white' : 'ring-transparent'}`}
                      style={{ background: c.stroke }}
                    />
                  ))}
                </div>
                {scope === 'selected' && selected && (
                  <button
                    onClick={() => autoColorThumb(selected)}
                    className="w-full rounded-lg border border-zinc-700 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                    title="Pick the frame colour from this game's background"
                  >
                    Auto colour from background
                  </button>
                )}
                {scope === 'selected' && (
                  <p className="text-[11px] text-zinc-500">Overrides the auto colour for this thumbnail · saved instantly.</p>
                )}
              </Section>
            )
          })()}

          {showDesignerSections && (
            <Section title="Background">
              <Slider label="Zoom" min={1} max={3} step={0.01} value={p.bgScale} onChange={(v) => set('bgScale', v)} fmt={(v) => `${v.toFixed(2)}×`} />
              <p className="text-[11px] text-zinc-500">Centered · fills the frame.</p>
            </Section>
          )}

          {showFrameSections && (() => {
            const g = resolveGrad(p)
            return (
              <Section title="Light gradient">
                <Slider label="Top fade" min={0} max={100} value={g.gradStop1} onChange={(v) => setGrad('gradStop1', v)} fmt={(v) => `${Math.round(v)}%`} />
                <Slider label="Colour stop" min={0} max={100} value={g.gradStop2} onChange={(v) => setGrad('gradStop2', v)} fmt={(v) => `${Math.round(v)}%`} />
                <Slider label="Bottom fade" min={0} max={100} value={g.gradBottom} onChange={(v) => setGrad('gradBottom', v)} fmt={(v) => `${Math.round(v)}%`} />
                <Slider label="Opacity" min={0} max={1} step={0.02} value={g.gradOpacity} onChange={(v) => setGrad('gradOpacity', v)} {...pct} />
                <Slider label="Band height" min={10} max={80} value={g.gradBandPct} onChange={(v) => setGrad('gradBandPct', v)} fmt={(v) => `${Math.round(v)}%`} />
              </Section>
            )
          })()}

          {showDesignerSections && (() => {
            // Same editing surface as the Template controller (shared controls);
            // only the storage target differs (template per size vs. this thumb).
            const lay = p.layouts?.[p.sizeKey] ?? defaultLayout(p.sizeKey)
            const hasLayout = scope === 'global' ? !!params.layouts?.[p.sizeKey] : !!selOv.layouts?.[p.sizeKey]
            return (
              <>
                <Section title={`Key visual · ${p.sizeKey}`}>
                  <KvControls
                    lay={lay}
                    autoCenter={p.kvAutoCenter ?? true}
                    onLayout={setLayout}
                    onAutoCenter={(v) => set('kvAutoCenter', v)}
                  />
                </Section>
                <Section title={`Logo · ${p.sizeKey}`}>
                  <LogoControls lay={lay} onLayout={setLayout} />
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-zinc-500">
                      {bulkMode
                        ? `Placement for ${selectedIds.size} selected · this size.`
                        : scope === 'global'
                          ? 'Saved per size · applies to all thumbnails.'
                          : `Placement for “${selected?.name}” · this size.`}
                    </p>
                    {hasLayout && (
                      <button onClick={resetLayout} className="text-[11px] text-zinc-400 underline hover:text-zinc-200">
                        Auto
                      </button>
                    )}
                  </div>
                </Section>
              </>
            )
          })()}

          {showFrameSections && (
            <Section title="Logo style">
              <Seg options={['color', 'white'].map((o) => ({ value: o, label: o }))} value={p.logoVariant} onChange={(v) => set('logoVariant', v as TemplateParams['logoVariant'])} />
              <Row label="Text logo">
                <input
                  type="checkbox"
                  checked={p.textLogo}
                  // Turning it on seeds the house text-logo style, so a text
                  // logotype always starts from the same look.
                  onChange={(e) =>
                    e.target.checked ? setMany({ ...TEXT_LOGO_PRESET, textLogo: true }) : set('textLogo', false)
                  }
                />
              </Row>
              {p.textLogo && (
                <>
                  <Row label="Font">
                    <select
                      value={p.fontFamily}
                      onChange={(e) => set('fontFamily', e.target.value)}
                      className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs outline-none focus:border-zinc-500"
                    >
                      {FONT_OPTIONS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </Row>
                  <Row label="Weight">
                    <select
                      value={p.textWeight}
                      onChange={(e) => set('textWeight', Number(e.target.value))}
                      className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs outline-none focus:border-zinc-500"
                    >
                      {WEIGHT_OPTIONS.map((w) => (
                        <option key={w} value={w}>
                          {w}
                        </option>
                      ))}
                    </select>
                  </Row>
                  <Row label="Align">
                    <div className="w-40">
                      <Seg
                        options={['left', 'center', 'right'].map((o) => ({ value: o, label: o }))}
                        value={p.textAlign}
                        onChange={(v) => set('textAlign', v as TemplateParams['textAlign'])}
                      />
                    </div>
                  </Row>
                  <Row label="Colour">
                    <div className="flex items-center gap-2">
                      <div className="w-28">
                        <Seg
                          options={[
                            { value: 'game', label: 'game' },
                            { value: 'white', label: 'white' },
                            { value: 'custom', label: '◆' },
                          ]}
                          value={p.textColorMode}
                          onChange={(v) => set('textColorMode', v as TemplateParams['textColorMode'])}
                        />
                      </div>
                      {p.textColorMode === 'custom' && (
                        <input
                          type="color"
                          value={p.textColor}
                          onChange={(e) => set('textColor', e.target.value)}
                          className="h-6 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent"
                        />
                      )}
                    </div>
                  </Row>
                  <Slider label="Size" min={0.6} max={1.4} step={0.02} value={p.textScale} onChange={(v) => set('textScale', v)} {...pct} />
                  <Slider label="Max lines" min={1} max={4} value={p.textMaxLines} onChange={(v) => set('textMaxLines', v)} fmt={intFmt} />
                  <Slider label="Line gap" min={0.8} max={1.6} step={0.02} value={p.textLineHeight} onChange={(v) => set('textLineHeight', v)} fmt={(v) => v.toFixed(2)} />
                  <Slider label="Letter" min={-5} max={30} value={p.textLetterPct} onChange={(v) => set('textLetterPct', v)} fmt={(v) => `${Math.round(v)}%`} />
                  <Row label="Capital letters">
                    <input type="checkbox" checked={p.textAllCaps} onChange={(e) => set('textAllCaps', e.target.checked)} />
                  </Row>
                  <Row label="Shadow">
                    <input type="checkbox" checked={p.textShadow} onChange={(e) => set('textShadow', e.target.checked)} />
                  </Row>
                  <Row label="Vary line widths">
                    <input type="checkbox" checked={p.textFillLines} onChange={(e) => set('textFillLines', e.target.checked)} />
                  </Row>
                </>
              )}
            </Section>
          )}

          {showFrameSections && (
            <Section title="Animation">
              <Row label="Enable">
                <input
                  type="checkbox"
                  checked={p.animEnabled}
                  onChange={(e) => {
                    set('animEnabled', e.target.checked)
                    setPlaying(e.target.checked)
                  }}
                />
              </Row>
              {p.animEnabled && (
                <>
                  {/* Motion presets move the artwork; particle presets add
                      code-drawn effects on top (no video needed). */}
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Motion</p>
                  <div className="grid grid-cols-4 gap-1">
                    {MOTION_PRESETS.map((o) => (
                      <button
                        key={o}
                        onClick={() => set('animPreset', o)}
                        className={`rounded-md border px-1 py-1.5 text-[10px] font-medium capitalize transition ${
                          p.animPreset === o ? 'border-accent bg-accent/15 text-accent' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                        }`}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Effects</p>
                  <div className="grid grid-cols-4 gap-1">
                    {PARTICLE_PRESETS.map((o) => (
                      <button
                        key={o}
                        onClick={() => set('animPreset', o)}
                        className={`rounded-md border px-1 py-1.5 text-[10px] font-medium capitalize transition ${
                          p.animPreset === o ? 'border-accent bg-accent/15 text-accent' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                        }`}
                      >
                        {o === 'coins' ? '🪙 coins' : o === 'fire' ? '🔥 fire' : o === 'sparkle' ? '✨ sparkle' : '🎉 confetti'}
                      </button>
                    ))}
                  </div>
                  <Slider label="Speed" min={0.3} max={20} step={0.1} value={p.animSpeed} onChange={(v) => set('animSpeed', v)} fmt={(v) => `${v.toFixed(1)}s`} />
                  <Slider label="Intensity" min={0} max={2} step={0.05} value={p.animIntensity} onChange={(v) => set('animIntensity', v)} {...pct} />
                  {isParticlePreset(p.animPreset) && (
                    <Slider label="Density" min={0} max={200} step={1} value={p.animCount ?? 26} onChange={(v) => set('animCount', v)} fmt={(v) => `${Math.round(v)}`} />
                  )}
                  <button
                    onClick={() => setPlaying((v) => !v)}
                    className="w-full rounded-lg bg-zinc-800 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
                  >
                    {playing ? "Pause preview" : "Play preview"}
                  </button>
                  <p className="text-[11px] text-zinc-500">Export with the “Animated (WebM)” format to save the motion.</p>
                </>
              )}
            </Section>
          )}

          {/* AI white-logo remake — available for every game (regenerate even when
              a Figma white variant exists). */}
          {isDesigner && selected && <WhiteLogo thumb={selected} saveLogoWhite={saveLogoWhite} saveLogoColor={saveLogoColor} />}
          {isDesigner && selected && <GenerativeMotion thumb={selected} saveAnim={saveAnim} saveAnimAlpha={saveAnimAlpha} />}

          {/* Provider label styling moved to the Template controller — it's a
              product-wide setting, edited once for every thumbnail. */}
        </div>

        {!lockedForClient && (
          <div className="flex gap-2 border-t border-zinc-800 p-3">
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-zinc-900 hover:bg-accent-dark disabled:opacity-50"
            >
              {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
            </button>
            <button onClick={handleReset} disabled={!dirty} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 disabled:opacity-40">
              {editingBranch || scope === 'global' ? 'Reset' : 'Clear'}
            </button>
          </div>
        )}
      </aside>
      </div>

      <ExportProgress
        open={exportOpen}
        jobs={exportJobs}
        onClose={() => setExportOpen(false)}
        onCancel={() => {
          cancelRef.current = true
        }}
      />
    </div>
  )
}

/**
 * Renders a thumbnail scaled to fit ("contain") inside whatever box it's given,
 * preserving aspect ratio for any frame size. Used for the pinned mobile editor
 * preview: it fills the fixed preview area at the top of the controls sheet and
 * updates live as params change.
 */
function FitPreview({
  thumb,
  params,
  assets,
  showFrame,
  phase,
}: {
  thumb: Thumbnail
  params: TemplateParams
  assets: AssetUrls
  showFrame: boolean
  phase: number
}) {
  const fr = frameSize(params.sizeKey)
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r) setBox({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Contain within the box: width capped by both the box width and the width
  // implied by the box height at the frame's aspect ratio.
  const dw = box.w && box.h ? Math.floor(Math.min(box.w, (box.h * fr.w) / fr.h)) : 0
  return (
    <div ref={ref} className="flex h-full w-full items-center justify-center p-3">
      {dw > 0 && (
        <div className="overflow-hidden rounded-lg shadow-2xl">
          <ThumbnailCard thumb={thumb} params={params} assets={assets} displayW={dw} phase={phase} showFrame={showFrame} />
        </div>
      )}
    </div>
  )
}

const intFmt = (v: number) => `${Math.round(v)}`

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-zinc-300">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-400">{label}</span>
      {children}
    </div>
  )
}

function Seg({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string; disabled?: boolean }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex rounded-lg bg-zinc-800/70 p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded py-1 capitalize transition ${
            value === o.value ? 'bg-zinc-700 font-medium text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
          } disabled:opacity-40`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}


function ThumbColorPicker({
  palette,
  colorKey,
  onPick,
}: {
  palette: PaletteMode
  colorKey: string
  onPick: (mode: PaletteMode, key: string) => void
}) {
  const [tab, setTab] = useState<PaletteMode>(palette)
  const current = PALETTES[palette].find((c) => c.key === colorKey)?.stroke ?? '#ffffff'
  return (
    <div className="group/col relative">
      <button
        title="Colour"
        className="grid h-7 w-7 place-items-center rounded-full border-2 border-white/80 shadow-md ring-1 ring-black/30"
        style={{ background: current }}
      >
        <Contrast size={13} className="text-white mix-blend-difference" />
      </button>
      {/* popover — pt-1.5 acts as an invisible bridge so hover survives the gap */}
      <div className="invisible absolute right-0 top-full z-30 pt-1.5 opacity-0 transition group-hover/col:visible group-hover/col:opacity-100">
        <div className="w-44 rounded-xl border border-zinc-700 bg-[#15161a] p-2 shadow-2xl">
          <div className="mb-2 flex rounded-lg bg-zinc-800 p-0.5 text-[11px]">
            {(['dark', 'light'] as PaletteMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setTab(m)}
                className={`flex-1 rounded-md py-1 capitalize transition ${tab === m ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {PALETTES[tab].map((c) => {
              const activeSw = palette === tab && colorKey === c.key
              return (
                <button
                  key={c.key}
                  title={c.label}
                  onClick={() => onPick(tab, c.key)}
                  className={`h-6 w-6 rounded-full ring-2 transition ${activeSw ? 'ring-white' : 'ring-transparent hover:ring-white/50'}`}
                  style={{ background: c.stroke }}
                />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
