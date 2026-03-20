<script setup lang="ts">
import type { Card } from '~/composables/useChartState'

const props = defineProps<{
  card: Card
  getCanvasCoords: (e: MouseEvent | { clientX: number; clientY: number }) => { x: number; y: number }
}>()
const state = useChartState()
const cardEl = ref<HTMLElement | null>(null)
const isEditMode = computed(() => state.chartEditMode.value)
const isMultiSelected = computed(() => state.selectedCardIds.value.includes(props.card.id))

function reportHeight() {
  const el = cardEl.value
  if (el && typeof state.setCardHeight === 'function') {
    state.setCardHeight(props.card.id, el.offsetHeight)
  }
}

onMounted(() => {
  reportHeight()
  const el = cardEl.value
  if (!el) return
  const ro = new ResizeObserver(() => reportHeight())
  ro.observe(el)
  onUnmounted(() => ro.disconnect())
})
onUpdated(reportHeight)

function cardSearchText(c: typeof props.card): string {
  const parts = [c.name ?? '', c.jurisdiction ?? '']
  const d = c.details
  if (d && typeof d === 'object') {
    for (const key of Object.keys(d)) {
      const v = d[key]
      if (Array.isArray(v)) parts.push(v.join(' '))
      else if (v != null && String(v)) parts.push(String(v))
    }
  }
  return parts.join(' ').toLowerCase()
}

const searchQuery = computed(() => (state.searchQuery.value || '').trim().toLowerCase())
const matchesSearch = computed(() => {
  if (!searchQuery.value) return true
  return cardSearchText(props.card).includes(searchQuery.value)
})
const searchActive = computed(() => searchQuery.value.length > 0)
const dimmedBySearch = computed(() => searchActive.value && !matchesSearch.value)

function getCanvasCoords(e: MouseEvent | { clientX: number; clientY: number }) {
  return props.getCanvasCoords(e)
}

function touchPoint(ev: TouchEvent): { clientX: number; clientY: number } | null {
  const t = ev.touches[0] ?? ev.changedTouches[0]
  return t ? { clientX: t.clientX, clientY: t.clientY } : null
}

const DRAG_THRESHOLD = 5

function onHandleMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  e.stopPropagation()
  const fromCardId = props.card.id
  const from = { x: props.card.x + 200 - 8, y: props.card.y + 10 }
  const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  tempPath.setAttribute('class', 'connector-line')
  tempPath.setAttribute('stroke-dasharray', '6 4')
  const connectorsEl = document.querySelector('.connectors')
  const g = connectorsEl?.querySelector('g') || document.createElementNS('http://www.w3.org/2000/svg', 'g')
  if (!connectorsEl?.querySelector('g')) connectorsEl?.appendChild(g)
  g.appendChild(tempPath)

  function move(ev: MouseEvent) {
    const to = getCanvasCoords(ev)
    const c1x = from.x + (to.x - from.x) * 0.5
    const c2x = to.x - (to.x - from.x) * 0.5
    tempPath.setAttribute('d', `M ${from.x} ${from.y} C ${c1x} ${from.y}, ${c2x} ${to.y}, ${to.x} ${to.y}`)
  }
  function up(ev: MouseEvent) {
    document.removeEventListener('mousemove', move)
    document.removeEventListener('mouseup', up)
    tempPath.remove()
    const target = ev.target as HTMLElement
    const cardEl = target.closest?.('.card')
    const toCardId = cardEl ? parseInt(cardEl.getAttribute('data-card-id') || '', 10) : null
    if (toCardId != null && toCardId !== fromCardId) {
      state.pendingLink.value = { fromId: fromCardId, toId: toCardId }
      state.modalLinkOpen.value = true
    }
  }
  document.addEventListener('mousemove', move)
  document.addEventListener('mouseup', up)
}

function onHandleTouchStart(e: TouchEvent) {
  e.stopPropagation()
  const pt = touchPoint(e)
  if (!pt) return
  const fromCardId = props.card.id
  const from = { x: props.card.x + 200 - 8, y: props.card.y + 10 }
  const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  tempPath.setAttribute('class', 'connector-line')
  tempPath.setAttribute('stroke-dasharray', '6 4')
  const connectorsEl = document.querySelector('.connectors')
  const g = connectorsEl?.querySelector('g') || document.createElementNS('http://www.w3.org/2000/svg', 'g')
  if (!connectorsEl?.querySelector('g')) connectorsEl?.appendChild(g)
  g.appendChild(tempPath)

  function move(ev: TouchEvent) {
    ev.preventDefault()
    const p = touchPoint(ev)
    if (p) {
      const to = getCanvasCoords(p)
      const c1x = from.x + (to.x - from.x) * 0.5
      const c2x = to.x - (to.x - from.x) * 0.5
      tempPath.setAttribute('d', `M ${from.x} ${from.y} C ${c1x} ${from.y}, ${c2x} ${to.y}, ${to.x} ${to.y}`)
    }
  }
  function up(ev: TouchEvent) {
    document.removeEventListener('touchmove', move, { capture: true })
    document.removeEventListener('touchend', up, { capture: true })
    tempPath.remove()
    const p = touchPoint(ev)
    if (p) {
      const el = document.elementFromPoint(p.clientX, p.clientY)
      const cardEl = el?.closest?.('.card')
      const toCardId = cardEl ? parseInt(cardEl.getAttribute('data-card-id') || '', 10) : null
      if (toCardId != null && toCardId !== fromCardId) {
        state.pendingLink.value = { fromId: fromCardId, toId: toCardId }
        state.modalLinkOpen.value = true
      }
    }
  }
  document.addEventListener('touchmove', move, { passive: false, capture: true })
  document.addEventListener('touchend', up, { capture: true })
}

function onCardMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  if ((e.target as HTMLElement).closest?.('.card-handle')) return
  const id = props.card.id
  const card = state.getCard(id)
  if (!card) return

  if (state.linkFromId.value === 'waiting') return

  if (state.linkFromId.value !== null && state.linkFromId.value !== 'waiting') {
    if (state.linkFromId.value === id) {
      state.linkFromId.value = null
      state.linkHint.value = state.DEFAULT_HINT
      return
    }
    state.pendingLink.value = { fromId: state.linkFromId.value as number, toId: id }
    state.linkFromId.value = null
    state.linkHint.value = state.DEFAULT_HINT
    state.modalLinkOpen.value = true
    return
  }

  const el = e.currentTarget as HTMLElement
  const ids = state.selectedCardIds.value
  const isGroupDrag = ids.includes(id)
  const selectedCards = isGroupDrag
    ? ids.map((cid) => state.getCard(cid)).filter(Boolean) as Card[]
    : [card]
  const startCanvas = getCanvasCoords(e)
  const startPositions = new Map(selectedCards.map((c) => [c.id, { x: c.x, y: c.y }]))
  let didDrag = false

  function addDraggingToSelected() {
    document.querySelectorAll('.card').forEach((node) => {
      const el = node as HTMLElement
      const cardId = parseInt(el.getAttribute('data-card-id') || '', 10)
      if (ids.includes(cardId)) el.classList.add('dragging')
    })
  }
  function removeDraggingFromSelected() {
    document.querySelectorAll('.card').forEach((node) => {
      const el = node as HTMLElement
      const cardId = parseInt(el.getAttribute('data-card-id') || '', 10)
      if (ids.includes(cardId)) el.classList.remove('dragging')
    })
  }

  addDraggingToSelected()

  function move(ev: MouseEvent) {
    const cur = getCanvasCoords(ev)
    const dx = cur.x - startCanvas.x
    const dy = cur.y - startCanvas.y
    if (!didDrag && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) didDrag = true
    for (const c of selectedCards) {
      const start = startPositions.get(c.id)
      if (start) {
        c.x = start.x + dx
        c.y = start.y + dy
      }
    }
    state.clampCardGroupInPlace(selectedCards)
    if (selectedCards.length === 1) {
      el.style.left = card.x + 'px'
      el.style.top = card.y + 'px'
    }
  }
  function up() {
    if (didDrag) state.lastDraggedCardId.value = id
    removeDraggingFromSelected()
    document.removeEventListener('mousemove', move)
    document.removeEventListener('mouseup', up)
  }
  document.addEventListener('mousemove', move)
  document.addEventListener('mouseup', up)
}

function onCardClick() {
  if (state.linkFromId.value === 'waiting') {
    state.linkFromId.value = props.card.id
    state.linkHint.value = 'Now click the second company'
    return
  }
  if (state.linkFromId.value !== null) return
  const card = state.getCard(props.card.id)
  if (!card) return
  const hasDetails = card.name || card.jurisdiction || (card.details && Object.keys(card.details).length)
  state.editingCardId.value = props.card.id
  state.modalCardViewMode.value = hasDetails
  state.modalCardOpen.value = true
}

const touchHandledTap = ref(false)

function onClick(e: MouseEvent) {
  if (touchHandledTap.value) {
    touchHandledTap.value = false
    return
  }
  if ((e as MouseEvent & { detail: number }).detail !== 1) return
  if (state.lastDraggedCardId.value === props.card.id) {
    state.lastDraggedCardId.value = null
    return
  }
  const el = (e.currentTarget as HTMLElement)
  if (!el.classList.contains('dragging')) {
    setTimeout(() => {
      if (state.lastDraggedCardId.value === props.card.id) {
        state.lastDraggedCardId.value = null
        return
      }
      if (!el.classList.contains('dragging'))
        onCardClick()
    }, 0)
  }
}

function onCardTouchStart(e: TouchEvent) {
  if ((e.target as HTMLElement).closest?.('.card-handle')) return
  const pt = touchPoint(e)
  if (!pt) return
  const id = props.card.id
  const card = state.getCard(id)
  if (!card) return

  if (state.linkFromId.value === 'waiting') return
  if (state.linkFromId.value !== null && state.linkFromId.value !== 'waiting') {
    if (state.linkFromId.value === id) {
      state.linkFromId.value = null
      state.linkHint.value = state.DEFAULT_HINT
      return
    }
    state.pendingLink.value = { fromId: state.linkFromId.value as number, toId: id }
    state.linkFromId.value = null
    state.linkHint.value = state.DEFAULT_HINT
    state.modalLinkOpen.value = true
    return
  }

  e.preventDefault()
  const el = e.currentTarget as HTMLElement
  const ids = state.selectedCardIds.value
  const isGroupDrag = ids.includes(id)
  const selectedCards = isGroupDrag
    ? ids.map((cid) => state.getCard(cid)).filter(Boolean) as Card[]
    : [card]
  const startCanvas = getCanvasCoords(pt)
  const startPositions = new Map(selectedCards.map((c) => [c.id, { x: c.x, y: c.y }]))
  let didDrag = false

  function addDraggingToSelected() {
    document.querySelectorAll('.card').forEach((node) => {
      const el = node as HTMLElement
      const cardId = parseInt(el.getAttribute('data-card-id') || '', 10)
      if (ids.includes(cardId)) el.classList.add('dragging')
    })
  }
  function removeDraggingFromSelected() {
    document.querySelectorAll('.card').forEach((node) => {
      const el = node as HTMLElement
      const cardId = parseInt(el.getAttribute('data-card-id') || '', 10)
      if (ids.includes(cardId)) el.classList.remove('dragging')
    })
  }
  addDraggingToSelected()

  function move(ev: TouchEvent) {
    ev.preventDefault()
    const p = touchPoint(ev)
    if (p) {
      const cur = getCanvasCoords(p)
      const dx = cur.x - startCanvas.x
      const dy = cur.y - startCanvas.y
      if (!didDrag && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) didDrag = true
      for (const c of selectedCards) {
        const start = startPositions.get(c.id)
        if (start) {
          c.x = start.x + dx
          c.y = start.y + dy
        }
      }
      state.clampCardGroupInPlace(selectedCards)
      if (selectedCards.length === 1) {
        el.style.left = card.x + 'px'
        el.style.top = card.y + 'px'
      }
    }
  }
  function up(ev: TouchEvent) {
    const p = touchPoint(ev)
    if (p && !didDrag) {
      touchHandledTap.value = true
      onCardClick()
    }
    if (didDrag) state.lastDraggedCardId.value = id
    removeDraggingFromSelected()
    document.removeEventListener('touchmove', move, { capture: true })
    document.removeEventListener('touchend', up, { capture: true })
  }
  document.addEventListener('touchmove', move, { passive: false, capture: true })
  document.addEventListener('touchend', up, { capture: true })
}
</script>

<template>
  <div
    ref="cardEl"
    class="card"
    :class="{
      selected: state.linkFromId === card.id,
      'card--edit-mode': isEditMode,
      'card--multi-selected': isMultiSelected,
      'card--search-highlight': searchActive && matchesSearch,
      'card--search-dim': dimmedBySearch
    }"
    :data-card-id="card.id"
    :style="{ left: card.x + 'px', top: card.y + 'px' }"
    @mousedown="onCardMouseDown"
    @touchstart="onCardTouchStart"
    @click="onClick"
  >
    <div class="card-inner">
      <div class="card-title">{{ card.name || 'Unnamed company' }}</div>
      <div class="card-jurisdiction">{{ card.jurisdiction || '—' }}</div>
      <div
        class="card-handle"
        title="Drag to another card to connect"
        @mousedown.stop="onHandleMouseDown"
        @touchstart.stop.prevent="onHandleTouchStart"
      />
    </div>
  </div>
</template>
