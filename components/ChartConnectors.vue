<script setup lang="ts">
import type { Card } from '~/composables/useChartState'
import { CARD_WIDTH } from '~/composables/useChartState'

const props = defineProps<{
  getCanvasCoords: (e: MouseEvent | { clientX: number; clientY: number }) => { x: number; y: number }
}>()

const state = useChartState()

function cardBottomCenter(card: Card) {
  const h = state.getCardHeight(card)
  return { x: card.x + CARD_WIDTH / 2, y: card.y + h }
}
function cardTopCenter(card: Card) {
  return { x: card.x + CARD_WIDTH / 2, y: card.y }
}

/** Cubic Bezier point at t: B(t) = (1-t)³P0 + 3(1-t)²t P1 + 3(1-t)t² P2 + t³ P3 */
function bezierPoint(
  t: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number }
) {
  const u = 1 - t
  const u3 = u * u * u
  const u2 = u * u
  const t3 = t * t * t
  const t2 = t * t
  return {
    x: u3 * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t3 * p3.x,
    y: u3 * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t3 * p3.y
  }
}

/** Find t in [0,1] that minimizes distance from (mx, my) to the Bezier curve */
function projectPointOnBezier(
  mx: number,
  my: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number }
): number {
  let bestT = 0.5
  let bestDist = Infinity
  const steps = 50
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const pt = bezierPoint(t, p0, p1, p2, p3)
    const d = (pt.x - mx) ** 2 + (pt.y - my) ** 2
    if (d < bestDist) {
      bestDist = d
      bestT = t
    }
  }
  return Math.max(0.05, Math.min(0.95, bestT))
}

const selectedRelIds = computed(() => state.selectedRelationshipIds.value)
const isEditMode = computed(() => state.chartEditMode.value)

function getPull(p0: { y: number }, p3: { y: number }) {
  const vertDist = Math.abs(p3.y - p0.y)
  return Math.min(vertDist * 0.4, 80)
}

/** Compute control points for a relationship (p0, p3 from cards; p1, p2 with optional custom offsets) */
function getPointsForRel(rel: { control1Dx?: number; control1Dy?: number; control2Dx?: number; control2Dy?: number }, p0: { x: number; y: number }, p3: { x: number; y: number }) {
  const pull = getPull(p0, p3)
  const defaultP1 = { x: p0.x, y: p0.y + pull }
  const defaultP2 = { x: p3.x, y: p3.y - pull }
  const p1 = {
    x: defaultP1.x + (rel.control1Dx ?? 0),
    y: defaultP1.y + (rel.control1Dy ?? 0)
  }
  const p2 = {
    x: defaultP2.x + (rel.control2Dx ?? 0),
    y: defaultP2.y + (rel.control2Dy ?? 0)
  }
  return { p0, p1, p2, p3, pull }
}

const pathData = computed(() => {
  const paths: {
    id: number
    d: string
    label: string
    labelX: number
    labelY: number
    midX: number
    midY: number
    p0: { x: number; y: number }
    p1: { x: number; y: number }
    p2: { x: number; y: number }
    p3: { x: number; y: number }
    pull: number
  }[] = []
  for (const rel of state.relationships.value) {
    const from = state.getCard(rel.fromId)
    const to = state.getCard(rel.toId)
    if (!from || !to) continue
    const p0 = cardBottomCenter(from)
    const p3 = cardTopCenter(to)
    const { p1, p2, pull } = getPointsForRel(rel, p0, p3)
    const d = `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`
    const t = rel.labelT ?? 0.5
    const pt = bezierPoint(t, p0, p1, p2, p3)
    const mid = bezierPoint(0.5, p0, p1, p2, p3)
    paths.push({
      id: rel.id,
      d,
      label: rel.label,
      labelX: pt.x,
      labelY: pt.y,
      midX: mid.x,
      midY: mid.y,
      p0,
      p1,
      p2,
      p3,
      pull
    })
  }
  return paths
})

function onPathClick(relId: number) {
  if (state.deleteConnectionMode.value) {
    state.deleteRelationship(relId)
  } else {
    state.editingRelationshipId.value = relId
    state.modalLinkOpen.value = true
  }
}

function getControlPoints(relId: number) {
  const rel = state.getRelationship(relId)
  if (!rel) return null
  const from = state.getCard(rel.fromId)
  const to = state.getCard(rel.toId)
  if (!from || !to) return null
  const p0 = cardBottomCenter(from)
  const p3 = cardTopCenter(to)
  return getPointsForRel(rel, p0, p3)
}

function updateLabelPosition(relId: number, clientX: number, clientY: number) {
  const pts = getControlPoints(relId)
  if (!pts) return
  const cur = props.getCanvasCoords({ clientX, clientY })
  const t = projectPointOnBezier(cur.x, cur.y, pts.p0, pts.p1, pts.p2, pts.p3)
  const clamped = Math.max(0.05, Math.min(0.95, Number.isFinite(t) ? t : 0.5))
  state.updateRelationship(relId, { labelT: clamped })
}

function onLabelMouseDown(e: MouseEvent, relId: number) {
  if (e.button !== 0) return
  e.stopPropagation()
  let didDrag = false
  const startX = e.clientX
  const startY = e.clientY
  function move(ev: MouseEvent) {
    if (!didDrag && (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3)) {
      didDrag = true
    }
    if (didDrag) updateLabelPosition(relId, ev.clientX, ev.clientY)
  }
  function up() {
    document.removeEventListener('mousemove', move)
    document.removeEventListener('mouseup', up)
    if (!didDrag) {
      state.editingRelationshipId.value = relId
      state.modalLinkOpen.value = true
    }
  }
  document.addEventListener('mousemove', move)
  document.addEventListener('mouseup', up)
}

function onLabelTouchStart(e: TouchEvent, relId: number) {
  e.stopPropagation()
  const touch = e.touches[0]
  if (!touch) return
  let didDrag = false
  const startX = touch.clientX
  const startY = touch.clientY
  function move(ev: TouchEvent) {
    ev.preventDefault()
    const t = ev.touches[0] ?? ev.changedTouches[0]
    if (!t) return
    if (!didDrag && (Math.abs(t.clientX - startX) > 3 || Math.abs(t.clientY - startY) > 3)) {
      didDrag = true
    }
    if (didDrag) updateLabelPosition(relId, t.clientX, t.clientY)
  }
  function up(ev: TouchEvent) {
    document.removeEventListener('touchmove', move, { capture: true })
    document.removeEventListener('touchend', up, { capture: true })
    if (!didDrag) {
      state.editingRelationshipId.value = relId
      state.modalLinkOpen.value = true
    }
  }
  document.addEventListener('touchmove', move, { passive: false, capture: true })
  document.addEventListener('touchend', up, { capture: true })
}

/** Update curve so its midpoint (t=0.5) passes through M. Uses symmetric control offsets. */
function setCurveMidpoint(relId: number, Mx: number, My: number) {
  const pts = getControlPoints(relId)
  if (!pts) return
  const { p0, p3 } = pts
  const cdx = (8 * Mx - 4 * p0.x - 4 * p3.x) / 6
  const cdy = (8 * My - 4 * p0.y - 4 * p3.y) / 6
  state.updateRelationship(relId, {
    control1Dx: cdx,
    control1Dy: cdy,
    control2Dx: cdx,
    control2Dy: cdy
  })
}

function onCurveHandleMouseDown(e: MouseEvent, relId: number, startMidX: number, startMidY: number) {
  if (e.button !== 0) return
  e.stopPropagation()
  const startCursor = props.getCanvasCoords({ clientX: e.clientX, clientY: e.clientY })
  function move(ev: MouseEvent) {
    const cur = props.getCanvasCoords({ clientX: ev.clientX, clientY: ev.clientY })
    const dx = cur.x - startCursor.x
    const dy = cur.y - startCursor.y
    setCurveMidpoint(relId, startMidX + dx, startMidY + dy)
  }
  function up() {
    document.removeEventListener('mousemove', move)
    document.removeEventListener('mouseup', up)
  }
  document.addEventListener('mousemove', move)
  document.addEventListener('mouseup', up)
}

function onCurveHandleTouchStart(e: TouchEvent, relId: number, startMidX: number, startMidY: number) {
  e.stopPropagation()
  const t0 = e.touches[0]
  if (!t0) return
  const startCursor = props.getCanvasCoords({ clientX: t0.clientX, clientY: t0.clientY })
  function move(ev: TouchEvent) {
    ev.preventDefault()
    const t = ev.touches[0] ?? ev.changedTouches[0]
    if (!t) return
    const cur = props.getCanvasCoords({ clientX: t.clientX, clientY: t.clientY })
    const dx = cur.x - startCursor.x
    const dy = cur.y - startCursor.y
    setCurveMidpoint(relId, startMidX + dx, startMidY + dy)
  }
  function up(ev: TouchEvent) {
    const t = ev.changedTouches[0]
    if (t) {
      const cur = props.getCanvasCoords({ clientX: t.clientX, clientY: t.clientY })
      const dx = cur.x - startCursor.x
      const dy = cur.y - startCursor.y
      setCurveMidpoint(relId, startMidX + dx, startMidY + dy)
    }
    document.removeEventListener('touchmove', move, { capture: true })
    document.removeEventListener('touchend', up, { capture: true })
  }
  document.addEventListener('touchmove', move, { passive: false, capture: true })
  document.addEventListener('touchend', up, { capture: true })
}
</script>

<template>
  <svg
    class="connectors"
    :class="{ 'connectors--edit-mode': isEditMode }"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g>
      <path
        v-for="(p, i) in pathData"
        :key="p.id"
        class="connector-line"
        :class="{
          'connector-line--deletable': state.deleteConnectionMode.value,
          'connector-line--editable': !state.deleteConnectionMode.value,
          'connector-line--selected': selectedRelIds.includes(p.id)
        }"
        :d="p.d"
        @click="onPathClick(p.id)"
      />
      <template v-for="p in pathData" :key="'label-' + p.id">
        <g
          v-if="p.label"
          class="connector-label-group"
          :transform="`translate(${p.labelX}, ${p.labelY})`"
          @mousedown.stop="onLabelMouseDown($event, p.id)"
          @touchstart.stop.prevent="onLabelTouchStart($event, p.id)"
        >
          <rect
            :x="-Math.max(String(p.label).length * 6 + 12, 28) / 2"
            y="-9"
            :width="Math.max(String(p.label).length * 6 + 12, 28)"
            height="18"
            rx="4"
            ry="4"
            class="connector-label-bg"
          />
          <text
            text-anchor="middle"
            dominant-baseline="middle"
            y="1"
            class="connector-label"
          >
            {{ p.label }}
          </text>
        </g>
      </template>
      <!-- Handles on the curve (same SVG so they always render); layer is raised in edit mode -->
      <g
        v-for="p in pathData"
        v-show="isEditMode"
        :key="'curve-' + p.id"
        class="connector-control-handle"
        :transform="`translate(${p.midX}, ${p.midY})`"
        @mousedown.stop="onCurveHandleMouseDown($event, p.id, p.midX, p.midY)"
        @touchstart.stop.prevent="onCurveHandleTouchStart($event, p.id, p.midX, p.midY)"
      >
        <circle r="8" class="connector-control-handle__hit" />
        <circle r="5" class="connector-control-handle__dot" />
      </g>
    </g>
  </svg>
</template>
