import { initializeApp } from 'firebase/app'
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore'
import type { Card } from './useChartState'
import type { Relationship } from './useChartState'

const CHART_DOC_PATH = 'charts/default'

export interface ChartData {
  cards: Card[]
  relationships: Relationship[]
  nextCardId: number
  nextRelId: number
}

function ensureDetails(val: unknown): Record<string, unknown> {
  if (val != null && typeof val === 'object' && !Array.isArray(val)) return val as Record<string, unknown>
  return {}
}

function ensureStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map((v) => String(v ?? '').trim()).filter(Boolean)
  if (val != null && val !== '') return [String(val).trim()]
  return []
}

/** Normalize a card from Firestore so details and nested fields are in the shape the app expects */
function normalizeCard(raw: unknown): Card | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const id = typeof o.id === 'number' ? o.id : Number(o.id)
  if (Number.isNaN(id)) return null
  const details = ensureDetails(o.details)
  return {
    id,
    x: typeof o.x === 'number' ? o.x : Number(o.x) || 0,
    y: typeof o.y === 'number' ? o.y : Number(o.y) || 0,
    name: typeof o.name === 'string' ? o.name : String(o.name ?? ''),
    jurisdiction: typeof o.jurisdiction === 'string' ? o.jurisdiction : String(o.jurisdiction ?? ''),
    details: {
      ...details,
      Director: ensureStringArray(details.Director ?? details.director),
      Shareholder: ensureStringArray(details.Shareholder ?? details.shareholder),
      RegistrationAddress: details.RegistrationAddress ?? details.registrationAddress ?? '',
      IncorporationDate: details.IncorporationDate ?? details.incorporationDate ?? '',
      ShareCapital: details.ShareCapital ?? details.shareCapital ?? '',
      Remark: details.Remark ?? details.remark ?? ''
    }
  }
}

/** Normalize a relationship from Firestore */
function normalizeRelationship(raw: unknown): Relationship | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const id = typeof o.id === 'number' ? o.id : Number(o.id)
  if (Number.isNaN(id)) return null
  return {
    id,
    fromId: typeof o.fromId === 'number' ? o.fromId : Number(o.fromId) || 0,
    toId: typeof o.toId === 'number' ? o.toId : Number(o.toId) || 0,
    label: typeof o.label === 'string' ? o.label : String(o.label ?? '—'),
    labelT: typeof o.labelT === 'number' ? o.labelT : undefined,
    control1Dx: typeof o.control1Dx === 'number' ? o.control1Dx : undefined,
    control1Dy: typeof o.control1Dy === 'number' ? o.control1Dy : undefined,
    control2Dx: typeof o.control2Dx === 'number' ? o.control2Dx : undefined,
    control2Dy: typeof o.control2Dy === 'number' ? o.control2Dy : undefined
  }
}

let firestoreDb: ReturnType<typeof getFirestore> | null = null

function getDb() {
  if (firestoreDb) return firestoreDb
  if (import.meta.server) return null
  const config = useRuntimeConfig().public
  const apiKey = (config as Record<string, string>).firebaseApiKey
  if (!apiKey) return null
  const app = initializeApp({
    apiKey,
    authDomain: (config as Record<string, string>).firebaseAuthDomain || undefined,
    projectId: (config as Record<string, string>).firebaseProjectId,
    storageBucket: (config as Record<string, string>).firebaseStorageBucket || undefined,
    messagingSenderId: (config as Record<string, string>).firebaseMessagingSenderId || undefined,
    appId: (config as Record<string, string>).firebaseAppId || undefined
  })
  firestoreDb = getFirestore(app)
  return firestoreDb
}

export function useFirestoreChart() {
  async function loadChart(): Promise<ChartData | null> {
    const db = getDb()
    if (!db) return null
    const ref = doc(db, CHART_DOC_PATH)
    const snap = await getDoc(ref)
    if (!snap.exists()) return null
    const data = snap.data()
    const rawCards = Array.isArray(data.cards) ? data.cards : []
    const rawRels = Array.isArray(data.relationships) ? data.relationships : []
    const cards = rawCards.map(normalizeCard).filter((c): c is Card => c != null)
    const relationships = rawRels.map(normalizeRelationship).filter((r): r is Relationship => r != null)
    return {
      cards,
      relationships,
      nextCardId: typeof data.nextCardId === 'number' ? data.nextCardId : 1,
      nextRelId: typeof data.nextRelId === 'number' ? data.nextRelId : 1
    }
  }

  async function saveChart(data: ChartData): Promise<boolean> {
    const db = getDb()
    if (!db) return false
    try {
      const ref = doc(db, CHART_DOC_PATH)
      const plain = JSON.parse(JSON.stringify({
        cards: data.cards,
        relationships: data.relationships,
        nextCardId: data.nextCardId,
        nextRelId: data.nextRelId
      }))
      await setDoc(ref, {
        ...plain,
        updatedAt: new Date().toISOString()
      })
      return true
    } catch (e) {
      console.error('Firestore save error:', e)
      return false
    }
  }

  function isConfigured(): boolean {
    return !!getDb()
  }

  return { loadChart, saveChart, isConfigured }
}
