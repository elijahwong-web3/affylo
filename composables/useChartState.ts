export interface Card {
  id: number
  x: number
  y: number
  name: string
  jurisdiction: string
  details: Record<string, unknown>
}

export interface Relationship {
  id: number
  fromId: number
  toId: number
  label: string
  /** Label position along path, 0–1 (default 0.5 = middle) */
  labelT?: number
  /** Control point 1 offset from default (curve start handle) */
  control1Dx?: number
  control1Dy?: number
  /** Control point 2 offset from default (curve end handle) */
  control2Dx?: number
  control2Dy?: number
}

interface ChartSnapshot {
  cards: Card[]
  relationships: Relationship[]
  nextCardId: number
  nextRelId: number
}

export interface PortableChartData {
  app?: string
  version?: number
  name?: string
  cards: Card[]
  relationships: Relationship[]
  nextCardId?: number
  nextRelId?: number
}

export const CARD_WIDTH = 200
export const CARD_HEIGHT = 72
/** Hard boundary: canvas origin is fixed at top-left; cards cannot go left of or above this (fixes clipped connectors). */
export const CANVAS_MIN_X = 0
export const CANVAS_MIN_Y = 0
export const DEFAULT_HINT = "Drag a card's dot to another card to connect · Drag background to pan, scroll to zoom"

/** Clamp one card so its top-left stays within bounds (right/bottom unlimited). */
function clampCardInPlace(card: Card) {
  card.x = Math.max(CANVAS_MIN_X, card.x)
  card.y = Math.max(CANVAS_MIN_Y, card.y)
}

/**
 * After a drag, shift the whole group so the top-left of the bounding box
 * is not left of / above the origin (preserves relative positions).
 */
function clampCardGroupInPlace(group: Card[]) {
  if (!group.length) return
  let minX = Infinity
  let minY = Infinity
  for (const c of group) {
    minX = Math.min(minX, c.x)
    minY = Math.min(minY, c.y)
  }
  const dx = minX < CANVAS_MIN_X ? CANVAS_MIN_X - minX : 0
  const dy = minY < CANVAS_MIN_Y ? CANVAS_MIN_Y - minY : 0
  if (dx === 0 && dy === 0) return
  for (const c of group) {
    c.x += dx
    c.y += dy
  }
}

// Shared state (singleton) – loaded from Firestore on app mount
const cards = ref<Card[]>([])
const relationships = ref<Relationship[]>([])
const nextCardId = ref(1)
const nextRelId = ref(1)
const linkFromId = ref<number | string | null>(null)
const panX = ref(0)
const panY = ref(0)
const zoom = ref(1)
const lastDraggedCardId = ref<number | null>(null)
const pendingLink = ref<{ fromId: number; toId: number } | null>(null)
const modalCardOpen = ref(false)
const modalCardViewMode = ref(true)
const modalLinkOpen = ref(false)
const editingCardId = ref<number | null>(null)
const linkHint = ref(DEFAULT_HINT)
const deleteConnectionMode = ref(false)
const editingRelationshipId = ref<number | null>(null)
const selectMode = ref(false)
const selectedCardIds = ref<number[]>([])
const selectedRelationshipIds = ref<number[]>([])
const marqueeStart = ref<{ x: number; y: number } | null>(null)
const marqueeEnd = ref<{ x: number; y: number } | null>(null)
const searchQuery = ref('')
const chartEditMode = ref(false)
/** Rendered height per card id (for variable-height cards on mobile); fallback to CARD_HEIGHT */
const cardRenderedHeights = ref<Record<number, number>>({})

const chartLoadError = ref<string | null>(null)
const chartSavePending = ref(false)
const chartLastSavedAt = ref<Date | null>(null)
const firebaseConfigured = ref(false)
const sidebarOpen = ref(true)
const chartList = ref<Array<{ id: string; name: string; updatedAt: string }>>([])
const activeChartId = ref<string | null>(null)
/** Don't save until initial load has completed (avoids overwriting with empty on refresh) */
const firebaseInitialLoadDone = ref(false)
/** True until first loadFromFirebase() has finished (success or fail) */
const chartLoading = ref(true)

let saveTimeout: ReturnType<typeof setTimeout> | null = null
const SAVE_DEBOUNCE_MS = 1500
const HISTORY_LIMIT = 100
const undoStack = ref<ChartSnapshot[]>([])
const redoStack = ref<ChartSnapshot[]>([])
let historySerialized = ''
let historySuspend = false

function nowIso() {
  return new Date().toISOString()
}

function activeChartIndex() {
  if (!activeChartId.value) return -1
  return chartList.value.findIndex((c) => c.id === activeChartId.value)
}

function buildWorkspacePayload() {
  const list = chartList.value.map((c) => ({ ...c }))
  const idx = activeChartIndex()
  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      updatedAt: nowIso(),
      cards: cards.value,
      relationships: relationships.value,
      nextCardId: nextCardId.value,
      nextRelId: nextRelId.value
    } as typeof list[number] & {
      cards: Card[]
      relationships: Relationship[]
      nextCardId: number
      nextRelId: number
    }
  }
  return {
    charts: list.map((c) => ({
      id: c.id,
      name: c.name,
      updatedAt: c.updatedAt,
      cards: (c as any).cards ?? [],
      relationships: (c as any).relationships ?? [],
      nextCardId: (c as any).nextCardId ?? 1,
      nextRelId: (c as any).nextRelId ?? 1
    })),
    activeChartId: activeChartId.value
  }
}

function scheduleSaveToFirebase() {
  if (typeof window === 'undefined') return
  if (!firebaseInitialLoadDone.value) return
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    saveTimeout = null
    const persistence = useChartPersistence()
    const payload = buildWorkspacePayload()
    // Keep in-memory chart list in sync with latest active-chart edits.
    chartList.value = payload.charts as any
    chartSavePending.value = true
    persistence
      .saveWorkspace(payload)
      .then((ok) => {
        chartSavePending.value = false
        if (ok) chartLastSavedAt.value = new Date()
      })
      .catch(() => {
        chartSavePending.value = false
      })
  }, SAVE_DEBOUNCE_MS)
}

let firebaseWatchInitialized = false

function makeSnapshot(): ChartSnapshot {
  return {
    cards: JSON.parse(JSON.stringify(cards.value)),
    relationships: JSON.parse(JSON.stringify(relationships.value)),
    nextCardId: nextCardId.value,
    nextRelId: nextRelId.value
  }
}

function applySnapshot(snapshot: ChartSnapshot) {
  cards.value = JSON.parse(JSON.stringify(snapshot.cards))
  relationships.value = JSON.parse(JSON.stringify(snapshot.relationships))
  nextCardId.value = snapshot.nextCardId
  nextRelId.value = snapshot.nextRelId
}

function resetHistory() {
  undoStack.value = []
  redoStack.value = []
  historySerialized = JSON.stringify(makeSnapshot())
}

function recordHistoryIfChanged() {
  if (historySuspend) return
  const current = makeSnapshot()
  const serialized = JSON.stringify(current)
  if (!historySerialized) {
    historySerialized = serialized
    return
  }
  if (serialized === historySerialized) return
  undoStack.value.push(JSON.parse(historySerialized) as ChartSnapshot)
  if (undoStack.value.length > HISTORY_LIMIT) undoStack.value.shift()
  redoStack.value = []
  historySerialized = serialized
}

export function useChartState() {
  if (!firebaseWatchInitialized && typeof window !== 'undefined') {
    firebaseWatchInitialized = true
    watch([cards, relationships, nextCardId, nextRelId], scheduleSaveToFirebase, { deep: true })
    watch([cards, relationships, nextCardId, nextRelId], recordHistoryIfChanged, { deep: true })
    resetHistory()
  }

  function getCard(id: number) {
    return cards.value.find((c) => c.id === id)
  }

  function getCardHeight(card: Card) {
    return cardRenderedHeights.value[card.id] ?? CARD_HEIGHT
  }

  function setCardHeight(id: number, height: number) {
    cardRenderedHeights.value = { ...cardRenderedHeights.value, [id]: height }
  }

  function cardBottomCenter(card: Card) {
    return {
      x: card.x + CARD_WIDTH / 2,
      y: card.y + getCardHeight(card)
    }
  }

  function cardTopCenter(card: Card) {
    return {
      x: card.x + CARD_WIDTH / 2,
      y: card.y
    }
  }

  function addCard() {
    const card: Card = {
      id: nextCardId.value++,
      x: Math.max(CANVAS_MIN_X, 100 + cards.value.length * 30),
      y: Math.max(CANVAS_MIN_Y, 100 + cards.value.length * 30),
      name: '',
      jurisdiction: '',
      details: {}
    }
    cards.value.push(card)
    return card
  }

  function updateCard(id: number, data: Partial<Card>) {
    const card = getCard(id)
    if (card) {
      Object.assign(card, data)
      if (data.x !== undefined || data.y !== undefined) clampCardInPlace(card)
    }
  }

  function addRelationship(fromId: number, toId: number, label: string) {
    relationships.value.push({
      id: nextRelId.value++,
      fromId,
      toId,
      label: label.trim() || '—'
    })
  }

  function deleteCard(id: number) {
    relationships.value = relationships.value.filter((r) => r.fromId !== id && r.toId !== id)
    cards.value = cards.value.filter((c) => c.id !== id)
  }

  function deleteRelationship(id: number) {
    relationships.value = relationships.value.filter((r) => r.id !== id)
  }

  function getRelationship(id: number) {
    return relationships.value.find((r) => r.id === id)
  }

  function updateRelationship(id: number, data: Partial<Relationship>) {
    const rel = getRelationship(id)
    if (rel) Object.assign(rel, data)
  }

  function getCanvasCoords(
    e: { clientX: number; clientY: number },
    wrapRect: DOMRect,
    _panX: number,
    _panY: number,
    _zoom: number
  ) {
    const wx = e.clientX - wrapRect.left
    const wy = e.clientY - wrapRect.top
    return {
      x: (wx - _panX) / _zoom,
      y: (wy - _panY) / _zoom
    }
  }

  /** Keep canvas origin anchored at viewport top-left; disallow showing negative canvas space. */
  function clampPanToOrigin() {
    if (panX.value > 0) panX.value = 0
    if (panY.value > 0) panY.value = 0
  }

  function zoomIn(wrapRect: DOMRect | null) {
    const newZoom = Math.min(4, zoom.value * 1.25)
    if (wrapRect) {
      const wx = wrapRect.width / 2
      const wy = wrapRect.height / 2
      const cx = (wx - panX.value) / zoom.value
      const cy = (wy - panY.value) / zoom.value
      panX.value = wx - cx * newZoom
      panY.value = wy - cy * newZoom
    }
    zoom.value = newZoom
    clampPanToOrigin()
  }

  function zoomOut(wrapRect: DOMRect | null) {
    const newZoom = Math.max(0.25, zoom.value / 1.25)
    if (wrapRect) {
      const wx = wrapRect.width / 2
      const wy = wrapRect.height / 2
      const cx = (wx - panX.value) / zoom.value
      const cy = (wy - panY.value) / zoom.value
      panX.value = wx - cx * newZoom
      panY.value = wy - cy * newZoom
    }
    zoom.value = newZoom
    clampPanToOrigin()
  }

  function clearSelection() {
    selectedCardIds.value = []
    selectedRelationshipIds.value = []
  }

  function rectsOverlap(
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number }
  ) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  }

  function getRelationshipBBox(rel: Relationship) {
    const from = getCard(rel.fromId)
    const to = getCard(rel.toId)
    if (!from || !to) return null
    const p1 = { x: from.x + CARD_WIDTH / 2, y: from.y + getCardHeight(from) }
    const p2 = { x: to.x + CARD_WIDTH / 2, y: to.y }
    const pull = Math.min(Math.abs(p2.y - p1.y) * 0.4, 80)
    const minY = Math.min(p1.y, p1.y + pull, p2.y - pull, p2.y)
    const maxY = Math.max(p1.y, p1.y + pull, p2.y - pull, p2.y)
    const minX = Math.min(p1.x, p2.x)
    const maxX = Math.max(p1.x, p2.x)
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }

  function setSelectionFromMarquee(rect: { x: number; y: number; w: number; h: number }) {
    const cardIds: number[] = []
    for (const card of cards.value) {
      const h = getCardHeight(card)
      const cr = { x: card.x, y: card.y, w: CARD_WIDTH, h }
      if (rectsOverlap(rect, cr)) cardIds.push(card.id)
    }
    const relIds: number[] = []
    for (const rel of relationships.value) {
      const br = getRelationshipBBox(rel)
      if (br && rectsOverlap(rect, br)) relIds.push(rel.id)
    }
    selectedCardIds.value = cardIds
    selectedRelationshipIds.value = relIds
  }

  function applyCanvasTransform() {
    return `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})`
  }

  function resetInteractionState() {
    linkFromId.value = null
    linkHint.value = DEFAULT_HINT
    modalLinkOpen.value = false
    pendingLink.value = null
    modalCardOpen.value = false
    editingCardId.value = null
    deleteConnectionMode.value = false
    editingRelationshipId.value = null
    selectMode.value = false
    clearSelection()
    marqueeStart.value = null
    marqueeEnd.value = null
    searchQuery.value = ''
  }

  function applyChartData(data: {
    cards: Card[]
    relationships: Relationship[]
    nextCardId: number
    nextRelId: number
  }) {
    const raw = Array.isArray(data.cards) ? [...data.cards] : []
    for (const c of raw) clampCardInPlace(c)
    cards.value = raw
    relationships.value = Array.isArray(data.relationships) ? [...data.relationships] : []
    nextCardId.value = typeof data.nextCardId === 'number' ? data.nextCardId : 1
    nextRelId.value = typeof data.nextRelId === 'number' ? data.nextRelId : 1
    resetHistory()
  }

  function undo() {
    if (!undoStack.value.length) return
    const previous = undoStack.value.pop()
    if (!previous) return
    redoStack.value.push(makeSnapshot())
    historySuspend = true
    applySnapshot(previous)
    historySuspend = false
    historySerialized = JSON.stringify(makeSnapshot())
  }

  function redo() {
    if (!redoStack.value.length) return
    const next = redoStack.value.pop()
    if (!next) return
    undoStack.value.push(makeSnapshot())
    historySuspend = true
    applySnapshot(next)
    historySuspend = false
    historySerialized = JSON.stringify(makeSnapshot())
  }

  async function loadFromFirebase(): Promise<void> {
    chartLoadError.value = null
    chartLoading.value = true
    const persistence = useChartPersistence()
    firebaseConfigured.value = persistence.isConfigured()
    const LOAD_TIMEOUT_MS = 15000
    let timedOut = false
    const timeoutId = setTimeout(() => {
      timedOut = true
      chartLoadError.value = 'Load timed out. Check your connection.'
      chartLoading.value = false
      firebaseInitialLoadDone.value = true
    }, LOAD_TIMEOUT_MS)
    try {
      const workspace = await persistence.loadWorkspace()
      if (timedOut) return
      if (workspace && Array.isArray(workspace.charts) && workspace.charts.length) {
        chartList.value = workspace.charts.map((c) => ({
          id: c.id,
          name: c.name,
          updatedAt: c.updatedAt,
          cards: c.cards,
          relationships: c.relationships,
          nextCardId: c.nextCardId,
          nextRelId: c.nextRelId
        })) as any
        activeChartId.value =
          typeof workspace.activeChartId === 'string' &&
          chartList.value.some((c) => c.id === workspace.activeChartId)
            ? workspace.activeChartId
            : chartList.value[0].id
        const active = (chartList.value as any).find((c: any) => c.id === activeChartId.value)
        if (active) applyChartData(active)
      }
    } catch (e) {
      if (timedOut) return
      chartLoadError.value = e instanceof Error ? e.message : 'Failed to load chart'
    } finally {
      if (!timedOut) {
        clearTimeout(timeoutId)
        chartLoading.value = false
        firebaseInitialLoadDone.value = true
      }
    }
  }

  async function switchChart(id: string) {
    if (!id || id === activeChartId.value) return
    const payload = buildWorkspacePayload()
    // Persist active-chart edits into chartList before switching views.
    chartList.value = payload.charts as any
    const target = payload.charts.find((c) => c.id === id)
    if (!target) return
    activeChartId.value = id
    applyChartData(target)
    resetInteractionState()
    chartSavePending.value = true
    const ok = await useChartPersistence().saveWorkspace({ ...payload, activeChartId: id })
    chartSavePending.value = false
    if (ok) chartLastSavedAt.value = new Date()
  }

  async function createChart(name?: string) {
    const id = `chart-${Date.now()}`
    const chartName = (name || 'Untitled chart').trim() || 'Untitled chart'
    const newChart = {
      id,
      name: chartName,
      updatedAt: nowIso(),
      cards: [] as Card[],
      relationships: [] as Relationship[],
      nextCardId: 1,
      nextRelId: 1
    }
    const payload = buildWorkspacePayload()
    payload.charts.push(newChart)
    payload.activeChartId = id
    chartList.value = payload.charts as any
    activeChartId.value = id
    applyChartData(newChart)
    resetInteractionState()
    chartSavePending.value = true
    const ok = await useChartPersistence().saveWorkspace(payload)
    chartSavePending.value = false
    if (ok) chartLastSavedAt.value = new Date()
    return id
  }

  async function renameChart(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const payload = buildWorkspacePayload()
    const target = payload.charts.find((c) => c.id === id)
    if (!target) return
    target.name = trimmed
    chartList.value = payload.charts as any
    chartSavePending.value = true
    const ok = await useChartPersistence().saveWorkspace(payload)
    chartSavePending.value = false
    if (ok) chartLastSavedAt.value = new Date()
  }

  async function deleteChart(id: string) {
    const payload = buildWorkspacePayload()
    const idx = payload.charts.findIndex((c) => c.id === id)
    if (idx < 0) return
    payload.charts.splice(idx, 1)
    if (!payload.charts.length) {
      payload.charts.push({
        id: `chart-${Date.now()}`,
        name: 'Untitled chart',
        updatedAt: nowIso(),
        cards: [],
        relationships: [],
        nextCardId: 1,
        nextRelId: 1
      })
    }
    if (!payload.charts.some((c) => c.id === payload.activeChartId)) {
      payload.activeChartId = payload.charts[0].id
    }
    chartList.value = payload.charts as any
    activeChartId.value = payload.activeChartId
    const active = payload.charts.find((c) => c.id === payload.activeChartId)
    if (active) applyChartData(active)
    resetInteractionState()
    chartSavePending.value = true
    const ok = await useChartPersistence().saveWorkspace(payload)
    chartSavePending.value = false
    if (ok) chartLastSavedAt.value = new Date()
  }

  function exportCurrentChartAsPortableJson(): PortableChartData {
    const active = chartList.value.find((c) => c.id === activeChartId.value)
    return {
      app: 'Affylo',
      version: 1,
      name: active?.name || 'Imported chart',
      cards: JSON.parse(JSON.stringify(cards.value)),
      relationships: JSON.parse(JSON.stringify(relationships.value)),
      nextCardId: nextCardId.value,
      nextRelId: nextRelId.value
    }
  }

  async function importPortableChartJson(data: PortableChartData) {
    if (!data || !Array.isArray(data.cards) || !Array.isArray(data.relationships)) {
      throw new Error('Invalid chart file format.')
    }

    const normalizedCards: Card[] = data.cards
      .map((raw: any, idx: number) => ({
        id: Number(raw?.id) || idx + 1,
        x: Number(raw?.x) || 0,
        y: Number(raw?.y) || 0,
        name: String(raw?.name ?? ''),
        jurisdiction: String(raw?.jurisdiction ?? ''),
        details: typeof raw?.details === 'object' && raw?.details ? raw.details : {}
      }))
      .filter((c) => Number.isFinite(c.id))

    for (const c of normalizedCards) clampCardInPlace(c)

    const cardIds = new Set(normalizedCards.map((c) => c.id))
    const normalizedRelationships: Relationship[] = data.relationships
      .map((raw: any, idx: number) => ({
        id: Number(raw?.id) || idx + 1,
        fromId: Number(raw?.fromId),
        toId: Number(raw?.toId),
        label: String(raw?.label ?? '—'),
        labelT: raw?.labelT,
        control1Dx: raw?.control1Dx,
        control1Dy: raw?.control1Dy,
        control2Dx: raw?.control2Dx,
        control2Dy: raw?.control2Dy
      }))
      .filter((r) => Number.isFinite(r.id) && cardIds.has(r.fromId) && cardIds.has(r.toId))

    const maxCardId = normalizedCards.reduce((m, c) => Math.max(m, c.id), 0)
    const maxRelId = normalizedRelationships.reduce((m, r) => Math.max(m, r.id), 0)
    const importedNextCardId =
      typeof data.nextCardId === 'number' ? Math.max(data.nextCardId, maxCardId + 1) : maxCardId + 1
    const importedNextRelId =
      typeof data.nextRelId === 'number' ? Math.max(data.nextRelId, maxRelId + 1) : maxRelId + 1

    const id = `chart-${Date.now()}`
    const name = (data.name || 'Imported chart').trim() || 'Imported chart'
    const payload = buildWorkspacePayload()
    payload.charts.push({
      id,
      name,
      updatedAt: nowIso(),
      cards: normalizedCards,
      relationships: normalizedRelationships,
      nextCardId: importedNextCardId,
      nextRelId: importedNextRelId
    })
    payload.activeChartId = id
    chartList.value = payload.charts as any
    activeChartId.value = id
    applyChartData({
      cards: normalizedCards,
      relationships: normalizedRelationships,
      nextCardId: importedNextCardId,
      nextRelId: importedNextRelId
    })
    resetInteractionState()
    chartSavePending.value = true
    const ok = await useChartPersistence().saveWorkspace(payload)
    chartSavePending.value = false
    if (ok) chartLastSavedAt.value = new Date()
  }

  return {
    cards,
    relationships,
    nextCardId,
    nextRelId,
    linkFromId,
    panX,
    panY,
    zoom,
    lastDraggedCardId,
    pendingLink,
    modalCardOpen,
    modalCardViewMode,
    modalLinkOpen,
    editingCardId,
    linkHint,
    deleteConnectionMode,
    editingRelationshipId,
    selectMode,
    selectedCardIds,
    selectedRelationshipIds,
    marqueeStart,
    marqueeEnd,
    searchQuery,
    chartEditMode,
    cardRenderedHeights,
    getCardHeight,
    setCardHeight,
    chartLoadError,
    chartSavePending,
    chartLastSavedAt,
    firebaseConfigured,
    sidebarOpen,
    chartList,
    activeChartId,
    chartLoading,
    canUndo: computed(() => undoStack.value.length > 0),
    canRedo: computed(() => redoStack.value.length > 0),
    getCard,
    cardBottomCenter,
    cardTopCenter,
    addCard,
    updateCard,
    /** Call after moving one or more cards during drag */
    clampCardGroupInPlace,
    addRelationship,
    deleteCard,
    deleteRelationship,
    getRelationship,
    updateRelationship,
    getCanvasCoords,
    applyCanvasTransform,
    zoomIn,
    zoomOut,
    clampPanToOrigin,
    clearSelection,
    setSelectionFromMarquee,
    createChart,
    switchChart,
    renameChart,
    deleteChart,
    exportCurrentChartAsPortableJson,
    importPortableChartJson,
    resetInteractionState,
    undo,
    redo,
    loadFromFirebase,
    DEFAULT_HINT
  }
}
