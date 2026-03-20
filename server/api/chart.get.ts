import { access, readFile } from 'node:fs/promises'

interface StoredChartData {
  cards: unknown[]
  relationships: unknown[]
  nextCardId: number
  nextRelId: number
}

interface StoredWorkspaceData {
  charts: Array<{
    id: string
    name: string
    updatedAt: string
    cards: unknown[]
    relationships: unknown[]
    nextCardId: number
    nextRelId: number
  }>
  activeChartId: string | null
}

function defaultData(): StoredChartData {
  return {
    cards: [],
    relationships: [],
    nextCardId: 1,
    nextRelId: 1
  }
}

function defaultWorkspace(): StoredWorkspaceData {
  const defaultId = 'chart-default'
  return {
    charts: [
      {
        id: defaultId,
        name: 'Sample Group Structure',
        updatedAt: new Date().toISOString(),
        cards: [],
        relationships: [],
        nextCardId: 1,
        nextRelId: 1
      }
    ],
    activeChartId: defaultId
  }
}

function resolveChartPath(event: any) {
  const config = useRuntimeConfig(event)
  return config.chartDataFile as string
}

export default defineEventHandler(async (event) => {
  const chartPath = resolveChartPath(event)
  try {
    await access(chartPath)
  } catch {
    return defaultData()
  }

  try {
    const raw = await readFile(chartPath, 'utf8')
    if (!raw.trim()) return defaultData()
    const parsed = JSON.parse(raw) as Partial<StoredChartData & StoredWorkspaceData>
    if (Array.isArray(parsed.charts)) {
      const charts = parsed.charts
        .map((c) => ({
          id: typeof c.id === 'string' ? c.id : '',
          name: typeof c.name === 'string' && c.name.trim() ? c.name.trim() : 'Untitled chart',
          updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : new Date().toISOString(),
          cards: Array.isArray(c.cards) ? c.cards : [],
          relationships: Array.isArray(c.relationships) ? c.relationships : [],
          nextCardId: typeof c.nextCardId === 'number' ? c.nextCardId : 1,
          nextRelId: typeof c.nextRelId === 'number' ? c.nextRelId : 1
        }))
        .filter((c) => c.id)
      if (!charts.length) return defaultWorkspace()
      const activeChartId =
        typeof parsed.activeChartId === 'string' && charts.some((c) => c.id === parsed.activeChartId)
          ? parsed.activeChartId
          : charts[0].id
      return { charts, activeChartId }
    }
    return {
      cards: Array.isArray(parsed.cards) ? parsed.cards : [],
      relationships: Array.isArray(parsed.relationships) ? parsed.relationships : [],
      nextCardId: typeof parsed.nextCardId === 'number' ? parsed.nextCardId : 1,
      nextRelId: typeof parsed.nextRelId === 'number' ? parsed.nextRelId : 1
    }
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Failed to read chart data file' })
  }
})
