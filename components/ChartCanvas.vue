<script setup lang="ts">
import { CARD_WIDTH } from '~/composables/useChartState'

const state = useChartState()
const canvasWrapRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLElement | null>(null)
const hasAutoFramed = ref(false)

const canvasStyle = computed(() => ({
  transform: `translate(${state.panX.value}px, ${state.panY.value}px) scale(${state.zoom.value})`
}))

const cards = computed(() => state.cards.value)

function fitChartToViewport() {
  const wrap = canvasWrapRef.value
  if (!wrap) return
  const list = cards.value
  if (!list.length) {
    state.panX.value = 0
    state.panY.value = 0
    state.zoom.value = 1
    return
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const c of list) {
    const h = state.getCardHeight(c)
    minX = Math.min(minX, c.x)
    minY = Math.min(minY, c.y)
    maxX = Math.max(maxX, c.x + CARD_WIDTH)
    maxY = Math.max(maxY, c.y + h)
  }

  const PADDING = 80
  minX -= PADDING
  minY -= PADDING
  maxX += PADDING
  maxY += PADDING

  const boundsW = Math.max(1, maxX - minX)
  const boundsH = Math.max(1, maxY - minY)
  const wrapRect = wrap.getBoundingClientRect()
  const targetZoom = Math.min(4, Math.max(0.25, Math.min(wrapRect.width / boundsW, wrapRect.height / boundsH)))

  state.zoom.value = targetZoom
  const renderW = boundsW * targetZoom
  const renderH = boundsH * targetZoom
  state.panX.value = (wrapRect.width - renderW) / 2 - minX * targetZoom
  state.panY.value = (wrapRect.height - renderH) / 2 - minY * targetZoom
}

function onKeyDown(ev: KeyboardEvent) {
  if (!(ev.metaKey || ev.ctrlKey)) return
  if (ev.key.toLowerCase() !== 'h') return
  ev.preventDefault()
  fitChartToViewport()
}

function onMenuAction(ev: Event) {
  const custom = ev as CustomEvent<string>
  if (custom.detail === 'center-chart') fitChartToViewport()
}

function getCanvasCoords(e: MouseEvent | { clientX: number; clientY: number }) {
  // Use the transformed .canvas element's rect so client→content coords match the actual rendered position
  const canvas = canvasRef.value
  if (canvas) {
    const r = canvas.getBoundingClientRect()
    return state.getCanvasCoords(e, r, 0, 0, state.zoom.value)
  }
  const wrap = canvasWrapRef.value
  if (!wrap) return { x: 0, y: 0 }
  const r = wrap.getBoundingClientRect()
  return state.getCanvasCoords(e, r, state.panX.value, state.panY.value, state.zoom.value)
}

function touchPoint(ev: TouchEvent): { clientX: number; clientY: number } | null {
  const t = ev.touches[0] ?? ev.changedTouches[0]
  return t ? { clientX: t.clientX, clientY: t.clientY } : null
}

function onWrapTouchStart(e: TouchEvent) {
  const pt = touchPoint(e)
  if (!pt) return
  if ((e.target as HTMLElement).closest?.('.card')) return
  if ((e.target as HTMLElement).closest?.('.modal-overlay')) return
  if ((e.target as HTMLElement).closest?.('.canvas-zoom-buttons')) return
  if ((e.target as HTMLElement).closest?.('.connector-control-handle')) return
  e.preventDefault()

  if (state.selectMode.value) {
    const start = getCanvasCoords(pt)
    state.marqueeStart.value = { x: start.x, y: start.y }
    state.marqueeEnd.value = { x: start.x, y: start.y }
    function move(ev: TouchEvent) {
      ev.preventDefault()
      const p = touchPoint(ev)
      if (p) {
        const cur = getCanvasCoords(p)
        state.marqueeEnd.value = { x: cur.x, y: cur.y }
      }
    }
    function up(ev: TouchEvent) {
      document.removeEventListener('touchmove', move, { capture: true })
      document.removeEventListener('touchend', up, { capture: true })
      const p = touchPoint(ev)
      if (p) {
        const cur = getCanvasCoords(p)
        state.marqueeEnd.value = { x: cur.x, y: cur.y }
      }
      const s = state.marqueeStart.value
      const end = state.marqueeEnd.value
      state.marqueeStart.value = null
      state.marqueeEnd.value = null
      if (s && end) {
        const dx = Math.abs(end.x - s.x)
        const dy = Math.abs(end.y - s.y)
        if (dx < MARQUEE_THRESHOLD && dy < MARQUEE_THRESHOLD) {
          state.clearSelection()
        } else {
          const x = Math.min(s.x, end.x)
          const y = Math.min(s.y, end.y)
          const w = Math.abs(end.x - s.x)
          const h = Math.abs(end.y - s.y)
          state.setSelectionFromMarquee({ x, y, w, h })
        }
      }
    }
    document.addEventListener('touchmove', move, { passive: false, capture: true })
    document.addEventListener('touchend', up, { capture: true })
    return
  }

  const startX = pt.clientX - state.panX.value
  const startY = pt.clientY - state.panY.value
  canvasWrapRef.value?.classList.add('panning')
  function move(ev: TouchEvent) {
    ev.preventDefault()
    const p = touchPoint(ev)
    if (p) {
      state.panX.value = p.clientX - startX
      state.panY.value = p.clientY - startY
      state.clampPanToOrigin()
    }
  }
  function up(ev: TouchEvent) {
    const p = touchPoint(ev)
    if (p) {
      state.panX.value = p.clientX - startX
      state.panY.value = p.clientY - startY
      state.clampPanToOrigin()
    }
    canvasWrapRef.value?.classList.remove('panning')
    document.removeEventListener('touchmove', move, { capture: true })
    document.removeEventListener('touchend', up, { capture: true })
  }
  document.addEventListener('touchmove', move, { passive: false, capture: true })
  document.addEventListener('touchend', up, { capture: true })
}

const MARQUEE_THRESHOLD = 5

function onWrapMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  if ((e.target as HTMLElement).closest?.('.card')) return
  if ((e.target as HTMLElement).closest?.('.modal-overlay')) return
  if ((e.target as HTMLElement).closest?.('.canvas-zoom-buttons')) return
  if ((e.target as HTMLElement).closest?.('.connector-control-handle')) return

  if (state.selectMode.value) {
    const start = getCanvasCoords(e)
    state.marqueeStart.value = { x: start.x, y: start.y }
    state.marqueeEnd.value = { x: start.x, y: start.y }
    function move(ev: MouseEvent) {
      const cur = getCanvasCoords(ev)
      state.marqueeEnd.value = { x: cur.x, y: cur.y }
    }
    function up() {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      const s = state.marqueeStart.value
      const end = state.marqueeEnd.value
      state.marqueeStart.value = null
      state.marqueeEnd.value = null
      if (s && end) {
        const dx = Math.abs(end.x - s.x)
        const dy = Math.abs(end.y - s.y)
        if (dx < MARQUEE_THRESHOLD && dy < MARQUEE_THRESHOLD) {
          state.clearSelection()
        } else {
          const x = Math.min(s.x, end.x)
          const y = Math.min(s.y, end.y)
          const w = Math.abs(end.x - s.x)
          const h = Math.abs(end.y - s.y)
          state.setSelectionFromMarquee({ x, y, w, h })
        }
      }
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
    return
  }

  const startX = e.clientX - state.panX.value
  const startY = e.clientY - state.panY.value
  canvasWrapRef.value?.classList.add('panning')
  function move(ev: MouseEvent) {
    state.panX.value = ev.clientX - startX
    state.panY.value = ev.clientY - startY
    state.clampPanToOrigin()
  }
  function up() {
    canvasWrapRef.value?.classList.remove('panning')
    document.removeEventListener('mousemove', move)
    document.removeEventListener('mouseup', up)
  }
  document.addEventListener('mousemove', move)
  document.addEventListener('mouseup', up)
}

function zoomIn() {
  const r = canvasWrapRef.value?.getBoundingClientRect() ?? null
  state.zoomIn(r)
}

function zoomOut() {
  const r = canvasWrapRef.value?.getBoundingClientRect() ?? null
  state.zoomOut(r)
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const wrap = canvasWrapRef.value
  if (!wrap) return
  const r = wrap.getBoundingClientRect()
  const wx = e.clientX - r.left
  const wy = e.clientY - r.top
  const cx = (wx - state.panX.value) / state.zoom.value
  const cy = (wy - state.panY.value) / state.zoom.value
  const factor = e.deltaY > 0 ? 0.9 : 1.1
  const newZoom = Math.min(4, Math.max(0.25, state.zoom.value * factor))
  state.panX.value = wx - cx * newZoom
  state.panY.value = wy - cy * newZoom
  state.zoom.value = newZoom
  state.clampPanToOrigin()
}

const marqueeRect = computed(() => {
  const s = state.marqueeStart.value
  const e = state.marqueeEnd.value
  if (!s || !e) return null
  const x = Math.min(s.x, e.x)
  const y = Math.min(s.y, e.y)
  const w = Math.abs(e.x - s.x)
  const h = Math.abs(e.y - s.y)
  return { x, y, w, h }
})

watch(
  () => [state.chartLoading.value, cards.value.length],
  async ([loading]) => {
    if (loading || hasAutoFramed.value) return
    await nextTick()
    fitChartToViewport()
    hasAutoFramed.value = true
  },
  { immediate: true }
)

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('affylo-menu-action', onMenuAction as EventListener)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('affylo-menu-action', onMenuAction as EventListener)
})
</script>

<template>
  <div
    ref="canvasWrapRef"
    class="canvas-wrap"
    :class="{
      'canvas-wrap--select-mode': state.selectMode.value,
      'canvas-wrap--sidebar-open': state.sidebarOpen.value
    }"
    @mousedown="onWrapMouseDown"
    @touchstart="onWrapTouchStart"
    @wheel.prevent="onWheel"
  >
    <div ref="canvasRef" class="canvas" :style="canvasStyle">
      <ChartConnectors :get-canvas-coords="getCanvasCoords" />
      <ChartCard
        v-for="card in cards"
        :key="card.id"
        :card="card"
        :get-canvas-coords="getCanvasCoords"
      />
      <div
        v-if="marqueeRect"
        class="marquee-selection"
        :style="{
          left: marqueeRect.x + 'px',
          top: marqueeRect.y + 'px',
          width: marqueeRect.w + 'px',
          height: marqueeRect.h + 'px'
        }"
      />
    </div>
    <div class="canvas-zoom-buttons">
      <button
        type="button"
        class="canvas-zoom-btn"
        aria-label="Zoom in"
        @click="zoomIn"
        @touchend.prevent.stop="zoomIn"
      >
        +
      </button>
      <button
        type="button"
        class="canvas-zoom-btn"
        aria-label="Zoom out"
        @click="zoomOut"
        @touchend.prevent.stop="zoomOut"
      >
        −
      </button>
    </div>
  </div>
</template>
