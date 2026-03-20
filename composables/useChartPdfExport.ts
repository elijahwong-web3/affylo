import { nextTick } from 'vue'
import { CARD_WIDTH } from './useChartState'
const EXPORT_PADDING = 96
const PDF_MARGIN_PX = 36

function sanitizeFilePart(name: string) {
  return name.replace(/[^\w\- ]+/g, '').trim() || 'chart'
}

async function captureChartSnapshot() {
  const state = useChartState()
  const canvasEl = document.querySelector('.canvas') as HTMLElement | null
  if (!canvasEl) {
    window.alert('Could not find the chart canvas.')
    return null
  }

  const cards = state.cards.value
  if (!cards.length) {
    window.alert('Add at least one company to export.')
    return null
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const c of cards) {
    const h = state.getCardHeight(c)
    minX = Math.min(minX, c.x)
    minY = Math.min(minY, c.y)
    maxX = Math.max(maxX, c.x + CARD_WIDTH)
    maxY = Math.max(maxY, c.y + h)
  }
  // Padding also leaves room for connector curves outside card boxes

  minX = Math.max(0, minX - EXPORT_PADDING)
  minY = Math.max(0, minY - EXPORT_PADDING)
  maxX += EXPORT_PADDING
  maxY += EXPORT_PADDING

  const w = Math.ceil(Math.max(1, maxX - minX))
  const h = Math.ceil(Math.max(1, maxY - minY))

  const savedPanX = state.panX.value
  const savedPanY = state.panY.value
  const savedZoom = state.zoom.value

  state.panX.value = 0
  state.panY.value = 0
  state.zoom.value = 1
  await nextTick()
  // Allow layout/paint after transform reset
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

  try {
    const { default: html2canvas } = await import('html2canvas')
    const snapshot = await html2canvas(canvasEl, {
      x: minX,
      y: minY,
      width: w,
      height: h,
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-canvas').trim() || '#f4f8ff',
      logging: false
    })
    return { snapshot, state }
  } finally {
    state.panX.value = savedPanX
    state.panY.value = savedPanY
    state.zoom.value = savedZoom
  }
}

/**
 * Rasterizes the chart canvas and downloads a PDF.
 */
export async function exportGroupChartToPdf() {
  const captured = await captureChartSnapshot()
  if (!captured) return
  try {
    const { jsPDF } = await import('jspdf')
    const { snapshot, state } = captured
    const imgData = snapshot.toDataURL('image/png', 1.0)
    const imgW = snapshot.width
    const imgH = snapshot.height

    const pdf = new jsPDF({
      unit: 'px',
      format: 'a4',
      orientation: imgW >= imgH ? 'l' : 'p'
    })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const maxW = Math.max(1, pageW - PDF_MARGIN_PX * 2)
    const maxH = Math.max(1, pageH - PDF_MARGIN_PX * 2)
    const scale = Math.min(maxW / imgW, maxH / imgH)
    const renderW = imgW * scale
    const renderH = imgH * scale
    const offsetX = (pageW - renderW) / 2
    const offsetY = (pageH - renderH) / 2

    pdf.addImage(imgData, 'PNG', offsetX, offsetY, renderW, renderH, undefined, 'FAST')

    const chartName =
      state.chartList.value.find((c) => c.id === state.activeChartId.value)?.name ?? 'chart'
    pdf.save(`Affylo - ${sanitizeFilePart(chartName)}.pdf`)
  } catch (e) {
    console.error(e)
    window.alert(
      e instanceof Error ? `Export failed: ${e.message}` : 'Export failed. Try again or use Print to PDF.'
    )
  }
}

/**
 * Rasterizes the chart canvas and downloads an image (PNG/JPEG).
 */
export async function exportGroupChartToImage(format: 'png' | 'jpeg' = 'png') {
  const captured = await captureChartSnapshot()
  if (!captured) return
  try {
    const { snapshot, state } = captured
    const chartName =
      state.chartList.value.find((c) => c.id === state.activeChartId.value)?.name ?? 'chart'
    const quality = format === 'jpeg' ? 0.95 : 1
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png'
    const a = document.createElement('a')
    a.href = snapshot.toDataURL(mime, quality)
    a.download = `Affylo - ${sanitizeFilePart(chartName)}.${format}`
    document.body.appendChild(a)
    a.click()
    a.remove()
  } catch (e) {
    console.error(e)
    window.alert(e instanceof Error ? `Export failed: ${e.message}` : 'Export failed. Try again.')
  }
}
