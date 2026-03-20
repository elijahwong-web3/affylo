import type { ChartData } from './useFirestoreChart'

type StorageMode = 'auto' | 'firebase' | 'local'

function getStorageMode(): StorageMode {
  const config = useRuntimeConfig().public as Record<string, string | undefined>
  const mode = String(config.chartStorageMode || 'auto').toLowerCase()
  if (mode === 'firebase') return 'firebase'
  if (mode === 'local') return 'local'
  return 'auto'
}

export function useChartPersistence() {
  const mode = getStorageMode()
  const firestore = useFirestoreChart()
  const local = useLocalChart()

  function shouldUseFirebase() {
    if (mode === 'firebase') return true
    if (mode === 'local') return false
    return firestore.isConfigured()
  }

  async function loadChart(): Promise<ChartData | null> {
    if (shouldUseFirebase()) return firestore.loadChart()
    return local.loadChart()
  }

  async function saveChart(data: ChartData): Promise<boolean> {
    if (shouldUseFirebase()) return firestore.saveChart(data)
    return local.saveChart(data)
  }

  async function loadWorkspace() {
    if (shouldUseFirebase()) {
      const chart = await firestore.loadChart()
      const chartId = 'default'
      return {
        charts: [
          {
            id: chartId,
            name: 'Default chart',
            updatedAt: new Date().toISOString(),
            cards: chart?.cards ?? [],
            relationships: chart?.relationships ?? [],
            nextCardId: chart?.nextCardId ?? 1,
            nextRelId: chart?.nextRelId ?? 1
          }
        ],
        activeChartId: chartId
      }
    }
    return local.loadWorkspace()
  }

  async function saveWorkspace(data: {
    charts: Array<{
      id: string
      name: string
      updatedAt: string
      cards: ChartData['cards']
      relationships: ChartData['relationships']
      nextCardId: number
      nextRelId: number
    }>
    activeChartId: string | null
  }): Promise<boolean> {
    if (shouldUseFirebase()) {
      const active = data.charts.find((c) => c.id === data.activeChartId) ?? data.charts[0]
      if (!active) return false
      return firestore.saveChart({
        cards: active.cards,
        relationships: active.relationships,
        nextCardId: active.nextCardId,
        nextRelId: active.nextRelId
      })
    }
    return local.saveWorkspace(data)
  }

  function isConfigured(): boolean {
    return shouldUseFirebase() ? firestore.isConfigured() : local.isConfigured()
  }

  return {
    loadChart,
    saveChart,
    loadWorkspace,
    saveWorkspace,
    isConfigured,
    storageMode: mode
  }
}
