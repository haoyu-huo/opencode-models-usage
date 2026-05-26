export interface TokenUsageLike {
  input?: number | null
  output?: number | null
  reasoning?: number | null
  cache?: {
    read?: number | null
    write?: number | null
  } | null
}

export interface SessionMessageLike {
  id?: string
  role: string
  modelID?: string | null
  providerID?: string | null
  tokens?: TokenUsageLike | null
  cost?: number | null
  summary?: unknown
  time?: {
    created?: number | null
    completed?: number | null
  } | null
  finish?: string | null
}

export interface ModelUsage {
  label: string
  tps: number
  contextTokens: number
  sessionTokens: number
  sessionCachedTokens: number
  cost: number
}

export interface SessionUsage {
  models: ModelUsage[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const toNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0

const getStringProp = (value: unknown, key: string): string | undefined => {
  if (!isRecord(value)) {
    return undefined
  }

  const prop = value[key]
  return typeof prop === "string" ? prop : undefined
}

const getObjectProp = (value: unknown, key: string): unknown => {
  if (!isRecord(value)) {
    return undefined
  }

  return value[key]
}

const findProvider = (providers: unknown, providerID: string): unknown => {
  if (Array.isArray(providers)) {
    return providers.find((provider) => getStringProp(provider, "id") === providerID)
  }

  return getObjectProp(providers, providerID)
}

const findModel = (models: unknown, modelID: string): unknown => {
  if (Array.isArray(models)) {
    return models.find((model) => getStringProp(model, "id") === modelID)
  }

  return getObjectProp(models, modelID)
}

export const resolveModelLabel = (
  modelID: string,
  providerID: string | undefined,
  providers: unknown,
): string => {
  if (!providerID) {
    return modelID
  }

  const provider = findProvider(providers, providerID)
  const providerName = getStringProp(provider, "name") ?? providerID
  const model = findModel(getObjectProp(provider, "models"), modelID)
  const modelName = getStringProp(model, "name") ?? modelID

  return `${providerName}/${modelName}`
}

export const getTokenTotal = (tokens?: TokenUsageLike | null): number =>
  toNumber(tokens?.input) +
  toNumber(tokens?.output) +
  toNumber(tokens?.reasoning) +
  toNumber(tokens?.cache?.read) +
  toNumber(tokens?.cache?.write)

const getMessageTimestamp = (message: SessionMessageLike, index: number): number => {
  const completed = toNumber(message.time?.completed)
  if (completed > 0) {
    return completed
  }

  const created = toNumber(message.time?.created)
  if (created > 0) {
    return created
  }

  return index
}

export const getSessionUsage = (
  messages: ReadonlyArray<SessionMessageLike>,
  providers?: unknown,
): SessionUsage => {
  const modelStats = new Map<string, {
    label: string
    contextTokens: number
    sessionTokens: number
    sessionCachedTokens: number
    cost: number
    totalOutputTokens: number
    totalDurationMs: number
    latestTimestamp: number
  }>()
  const modelsUsed: string[] = []

  for (const [index, message] of messages.entries()) {
    if (message.role !== "assistant") {
      continue
    }

    const modelID = typeof message.modelID === "string" ? message.modelID : undefined
    if (!modelID) {
      continue
    }

    const providerID =
      typeof message.providerID === "string" ? message.providerID : undefined
    const modelKey = providerID ? `${providerID}:${modelID}` : modelID

    if (!modelStats.has(modelKey)) {
      modelStats.set(modelKey, {
        label: resolveModelLabel(modelID, providerID, providers),
        contextTokens: 0,
        sessionTokens: 0,
        sessionCachedTokens: 0,
        cost: 0,
        totalOutputTokens: 0,
        totalDurationMs: 0,
        latestTimestamp: Number.NEGATIVE_INFINITY,
      })
      modelsUsed.push(modelKey)
    }

    const stats = modelStats.get(modelKey)!
    stats.cost += toNumber(message.cost)
    stats.sessionTokens += getTokenTotal(message.tokens)
    stats.sessionCachedTokens += toNumber(message.tokens?.cache?.read)

    const outputTokens = toNumber(message.tokens?.output)
    if (outputTokens <= 0) {
      continue
    }

    const completed = toNumber(message.time?.completed)
    const created = toNumber(message.time?.created)
    if (completed > created) {
      stats.totalOutputTokens += outputTokens
      stats.totalDurationMs += completed - created
    }

    const timestamp = getMessageTimestamp(message, index)
    if (timestamp < stats.latestTimestamp) {
      continue
    }

    stats.latestTimestamp = timestamp
    stats.contextTokens = getTokenTotal(message.tokens)
  }

  const models = modelsUsed.map((key) => {
    const stats = modelStats.get(key)!
    const tps = stats.totalDurationMs > 0
      ? stats.totalOutputTokens / (stats.totalDurationMs / 1000)
      : 0

    return {
      label: stats.label,
      contextTokens: stats.contextTokens,
      sessionTokens: stats.sessionTokens,
      sessionCachedTokens: stats.sessionCachedTokens,
      cost: stats.cost,
      tps,
    }
  })

  return { models }
}
