import type { Card, Relationship } from './useChartState'

export interface LocalChartData {
  cards: Card[]
  relationships: Relationship[]
  nextCardId: number
  nextRelId: number
}

export interface LocalWorkspaceChart extends LocalChartData {
  id: string
  name: string
  updatedAt: string
}

export interface LocalWorkspaceData {
  charts: LocalWorkspaceChart[]
  activeChartId: string | null
}

export function useLocalChart() {
  async function loadChart(): Promise<LocalChartData | null> {
    try {
      return await $fetch<LocalChartData | null>('/api/chart')
    } catch (e) {
      console.error('Local chart load error:', e)
      return null
    }
  }

  async function saveChart(data: LocalChartData): Promise<boolean> {
    try {
      await $fetch('/api/chart', {
        method: 'POST',
        body: data
      })
      return true
    } catch (e) {
      console.error('Local chart save error:', e)
      return false
    }
  }

  function isConfigured(): boolean {
    return true
  }

  async function loadWorkspace(): Promise<LocalWorkspaceData> {
    const data = await loadChart()
    if (data && Array.isArray((data as unknown as { charts?: unknown }).charts)) {
      const workspace = data as unknown as LocalWorkspaceData
      return {
        charts: workspace.charts,
        activeChartId: workspace.activeChartId
      }
    }
    const defaultId = 'chart-default'
    return {
      charts: [
        {
          id: defaultId,
          name: 'Sample Group Structure',
          updatedAt: new Date().toISOString(),
          cards: data?.cards ?? [],
          relationships: data?.relationships ?? [],
          nextCardId: data?.nextCardId ?? 1,
          nextRelId: data?.nextRelId ?? 1
        }
      ],
      activeChartId: defaultId
    }
  }

  async function saveWorkspace(data: LocalWorkspaceData): Promise<boolean> {
    try {
      await $fetch('/api/chart', {
        method: 'POST',
        body: data
      })
      return true
    } catch (e) {
      console.error('Local workspace save error:', e)
      return false
    }
  }

  return { loadChart, saveChart, loadWorkspace, saveWorkspace, isConfigured }
}
