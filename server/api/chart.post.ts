import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

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

function resolveChartPath(event: any) {
  const config = useRuntimeConfig(event)
  return config.chartDataFile as string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Partial<StoredChartData & StoredWorkspaceData>>(event)
  const payload: StoredChartData | StoredWorkspaceData = Array.isArray(body.charts)
    ? {
        charts: body.charts
          .map((c) => ({
            id: typeof c.id === 'string' ? c.id : '',
            name: typeof c.name === 'string' && c.name.trim() ? c.name.trim() : 'Untitled chart',
            updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : new Date().toISOString(),
            cards: Array.isArray(c.cards) ? c.cards : [],
            relationships: Array.isArray(c.relationships) ? c.relationships : [],
            nextCardId: typeof c.nextCardId === 'number' ? c.nextCardId : 1,
            nextRelId: typeof c.nextRelId === 'number' ? c.nextRelId : 1
          }))
          .filter((c) => c.id),
        activeChartId: typeof body.activeChartId === 'string' ? body.activeChartId : null
      }
    : {
        cards: Array.isArray(body.cards) ? body.cards : [],
        relationships: Array.isArray(body.relationships) ? body.relationships : [],
        nextCardId: typeof body.nextCardId === 'number' ? body.nextCardId : 1,
        nextRelId: typeof body.nextRelId === 'number' ? body.nextRelId : 1
      }

  const chartPath = resolveChartPath(event)
  await mkdir(dirname(chartPath), { recursive: true })
  await writeFile(chartPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  return { ok: true, updatedAt: new Date().toISOString() }
})
