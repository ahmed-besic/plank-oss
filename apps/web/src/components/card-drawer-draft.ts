const STORAGE_PREFIX = 'plank:card-drawer-draft:'
export const DRAFT_VERSION = 1
export const DRAFT_DEBOUNCE_MS = 400

export type FingerprintSnapshot = {
  title: string
  body: string
  properties: string
  tags: string
  status: string
}

export type CardDraftPayload = {
  version: number
  cardId: string
  title: string
  body: Array<Record<string, unknown>>
  propertyValues: Record<string, unknown>
  tagIds: string[]
  statusKey?: string
  baseUpdatedAt: number
  draftSavedAt: number
  baseFingerprint: FingerprintSnapshot
}

export type SectionKey = 'title' | 'body' | 'properties' | 'tags' | 'status'

export const SECTION_LABELS: Record<SectionKey, string> = {
  title: 'Title',
  body: 'Description',
  properties: 'Properties',
  tags: 'Tags',
  status: 'Status',
}

function stableStringify(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    )
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function hashString(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0).toString(36)
}

function fingerprintValue(value: unknown) {
  return hashString(stableStringify(value))
}

function getStorageKey(cardId: string) {
  return `${STORAGE_PREFIX}${cardId}`
}

function getStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function sectionFingerprints({
  title,
  body,
  properties,
  tagIds,
  statusKey,
}: {
  title: string
  body: Array<Record<string, unknown>>
  properties: Record<string, unknown>
  tagIds: string[]
  statusKey?: string
}): FingerprintSnapshot {
  return {
    title: fingerprintValue(title),
    body: fingerprintValue(body),
    properties: fingerprintValue(properties),
    tags: fingerprintValue([...tagIds].sort()),
    status: fingerprintValue(statusKey ?? null),
  }
}

export function getChangedSections(params: {
  currentServer: FingerprintSnapshot
  draftBase: FingerprintSnapshot
}): SectionKey[] {
  const changed: SectionKey[] = []
  if (params.currentServer.title !== params.draftBase.title) {
    changed.push('title')
  }
  if (params.currentServer.body !== params.draftBase.body) {
    changed.push('body')
  }
  if (params.currentServer.properties !== params.draftBase.properties) {
    changed.push('properties')
  }
  if (params.currentServer.tags !== params.draftBase.tags) {
    changed.push('tags')
  }
  if (params.currentServer.status !== params.draftBase.status) {
    changed.push('status')
  }
  return changed
}

export function readCardDraft(cardId: string): CardDraftPayload | null {
  try {
    const raw = getStorage()?.getItem(getStorageKey(cardId))
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as Partial<CardDraftPayload>
    if (
      parsed.version !== DRAFT_VERSION ||
      parsed.cardId !== cardId ||
      typeof parsed.title !== 'string' ||
      !parsed.body ||
      !Array.isArray(parsed.body) ||
      !parsed.propertyValues ||
      typeof parsed.propertyValues !== 'object' ||
      !Array.isArray(parsed.tagIds) ||
      ('statusKey' in parsed &&
        parsed.statusKey !== undefined &&
        typeof parsed.statusKey !== 'string') ||
      typeof parsed.baseUpdatedAt !== 'number' ||
      typeof parsed.draftSavedAt !== 'number' ||
      !parsed.baseFingerprint ||
      typeof parsed.baseFingerprint.title !== 'string' ||
      typeof parsed.baseFingerprint.body !== 'string' ||
      typeof parsed.baseFingerprint.properties !== 'string' ||
      typeof parsed.baseFingerprint.tags !== 'string' ||
      typeof parsed.baseFingerprint.status !== 'string'
    ) {
      return null
    }
    return {
      version: parsed.version,
      cardId: parsed.cardId,
      title: parsed.title,
      body: parsed.body,
      propertyValues: parsed.propertyValues,
      tagIds: parsed.tagIds,
      statusKey: parsed.statusKey,
      baseUpdatedAt: parsed.baseUpdatedAt,
      draftSavedAt: parsed.draftSavedAt,
      baseFingerprint: parsed.baseFingerprint,
    }
  } catch {
    return null
  }
}

export function writeCardDraft(payload: CardDraftPayload) {
  try {
    getStorage()?.setItem(
      getStorageKey(payload.cardId),
      JSON.stringify(payload),
    )
  } catch {
    // ignore local storage write errors
  }
}

export function clearCardDraft(cardId: string) {
  try {
    getStorage()?.removeItem(getStorageKey(cardId))
  } catch {
    // ignore local storage delete errors
  }
}
