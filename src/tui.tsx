/** @jsxImportSource @opentui/solid */

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import type { AssistantMessage, Provider } from "@opencode-ai/sdk/v2"
import type { Accessor } from "solid-js"
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"

import { getSessionUsage, type ModelUsage } from "./session-usage"

type SortMode = "default" | "cost" | "tokens" | "tps"
const SORT_MODES: SortMode[] = ["default", "cost", "tokens", "tps"]

const formatCompactNumber = (n: number): string => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString("en-US")
}

const pluginID = "session-model-usage"

const readPluginVersion = (): string => {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const pkgPath = resolve(here, "..", "package.json")
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: unknown }
    return typeof pkg.version === "string" ? pkg.version : "0.0.0"
  } catch {
    return "0.0.0"
  }
}

const pluginVersion = readPluginVersion()

const mapMessage = (message: AssistantMessage): {
  role: string
  modelID: string | null
  providerID: string | null
  tokens: AssistantMessage["tokens"] | null
  cost: number | null
  time: { created: number | null; completed: number | null } | null
} => ({
  role: message.role,
  modelID: message.modelID,
  providerID: message.providerID,
  tokens: message.tokens,
  cost: message.cost,
  time: message.time
    ? { created: message.time.created, completed: message.time.completed ?? null }
    : null,
})

const mapMessages = (messages: readonly AssistantMessage[]) => messages.map(mapMessage)

const isAssistantMessage = (m: { role: string }): m is AssistantMessage =>
  m.role === "assistant"

const useSessionMessages = (api: TuiPluginApi, rootSessionID: Accessor<string>) => {
  const [rootMessages, setRootMessages] = createSignal<AssistantMessage[]>([])
  const [extraMessages, setExtraMessages] = createSignal<AssistantMessage[]>([])
  const [trackedSessionIDs, setTrackedSessionIDs] = createSignal<ReadonlySet<string>>(
    new Set([rootSessionID()]),
  )

  let reloadVersion = 0

  const fetchRootMessages = (sessionID: string): AssistantMessage[] => {
    return api.state.session.messages(sessionID).filter(isAssistantMessage)
  }

  const fetchChildrenMessages = async (
    sessionID: string,
    visited = new Set<string>(),
  ): Promise<{ messages: AssistantMessage[]; sessionIDs: Set<string> }> => {
    if (visited.has(sessionID)) {
      return { messages: [], sessionIDs: visited }
    }

    visited.add(sessionID)
    const res = await api.client.session.children({ sessionID })
    if (res.error || !res.data) {
      return { messages: [], sessionIDs: visited }
    }

    let msgs: AssistantMessage[] = []
    for (const child of res.data) {
      const childID = child.id
      if (visited.has(childID)) {
        continue
      }

      const childMsgs = api.state.session.messages(childID).filter(isAssistantMessage)
      msgs.push(...childMsgs)
      const nested = await fetchChildrenMessages(childID, visited)
      msgs.push(...nested.messages)
    }
    return { messages: msgs, sessionIDs: visited }
  }

  const reloadExtraMessages = async (sessionID: string) => {
    const version = ++reloadVersion
    const [root, result] = await Promise.all([
      Promise.resolve(fetchRootMessages(sessionID)),
      fetchChildrenMessages(sessionID),
    ])

    if (version !== reloadVersion) {
      return
    }

    setRootMessages(root)
    setExtraMessages(result.messages)
    setTrackedSessionIDs(new Set(result.sessionIDs))
  }

  createEffect(() => {
    const sessionID = rootSessionID()
    setRootMessages([])
    setExtraMessages([])
    setTrackedSessionIDs(new Set([sessionID]))
    void reloadExtraMessages(sessionID)
  })

  onMount(() => {
    const unsubs = [
      api.event.on("message.updated", () => {
        void reloadExtraMessages(rootSessionID())
      }),
      api.event.on("session.status", () => {
        void reloadExtraMessages(rootSessionID())
      }),
    ]

    onCleanup(() => {
      reloadVersion += 1
      unsubs.forEach((unsubscribe) => {
        unsubscribe()
      })
    })
  })

  const usageMessages = createMemo(() => {
    return [...rootMessages(), ...extraMessages()]
  })

  return { usageMessages }
}

const CollapsibleModel = (props: {
  model: ModelUsage
  theme: () => { text: any; textMuted: any }
  collapsed: boolean
  onToggle: () => void
}) => {
  return (
    <box flexDirection="column">
      <box
        onMouseDown={(e) => {
          e.stopPropagation()
          props.onToggle()
        }}
      >
        <text fg={props.theme().text}>
          {props.collapsed ? "▸" : "▾"} {props.model.label}
        </text>
      </box>
      <Show when={!props.collapsed}>
        <box flexDirection="column" paddingLeft={2}>
          <box flexDirection="row">
            <text fg={props.theme().text} width={18} flexShrink={0}>
              ■ Average TPS
            </text>
            <text fg={props.theme().textMuted}>
              {props.model.tps > 0 ? props.model.tps.toFixed(1) : "—"}
            </text>
          </box>
          <box flexDirection="row">
            <text fg={props.theme().text} width={18} flexShrink={0}>
              ■ Messages
            </text>
            <text fg={props.theme().textMuted}>
              {props.model.messageCount.toLocaleString("en-US")}
            </text>
          </box>
          <box flexDirection="row">
            <text fg={props.theme().text} width={18} flexShrink={0}>
              ■ Context Tokens
            </text>
            <text fg={props.theme().textMuted}>
              {props.model.contextTokens.toLocaleString("en-US")}
            </text>
          </box>
          <box flexDirection="row">
            <text fg={props.theme().text} width={18} flexShrink={0}>
              ■ Session Tokens
            </text>
            <text fg={props.theme().textMuted}>
              {props.model.sessionTokens.toLocaleString("en-US")}
            </text>
          </box>
          <box flexDirection="row">
            <text fg={props.theme().text} width={18} flexShrink={0}>
              ■ Session Cached
            </text>
            <text fg={props.theme().textMuted}>
              {props.model.sessionCachedTokens.toLocaleString("en-US")}
              {" ("}{(props.model.cacheHitRatio * 100).toFixed(1)}%)
            </text>
          </box>
          <box flexDirection="row">
            <text fg={props.theme().text} width={18} flexShrink={0}>
              ■ spent
            </text>
            <text fg={props.theme().textMuted}>${Number(props.model.cost.toFixed(4))}</text>
          </box>
        </box>
      </Show>
    </box>
  )
}

const SessionUsagePanel = (props: { api: TuiPluginApi; sessionID: string }) => {
  const activeSessionID = createMemo<string>(() => {
    const route = props.api.route.current
    if (route.name === "session" && typeof route.params?.sessionID === "string") {
      return route.params.sessionID
    }

    return props.sessionID
  })

  const { usageMessages } = useSessionMessages(props.api, activeSessionID)
  const theme = () => props.api.theme.current

  const usage = createMemo(() => getSessionUsage(
    mapMessages(usageMessages() as AssistantMessage[]),
    props.api.state.provider as readonly Provider[] | undefined,
  ))

  const [sortMode, setSortMode] = createSignal<SortMode>("default")

  const sortedModels = createMemo(() => {
    const models = usage().models
    const mode = sortMode()
    if (mode === "default") return models
    return [...models].sort((a, b) => {
      if (mode === "cost") return b.cost - a.cost
      if (mode === "tokens") return b.sessionTokens - a.sessionTokens
      return b.tps - a.tps
    })
  })

  const cycleSortMode = () => {
    setSortMode((prev) => {
      const idx = SORT_MODES.indexOf(prev)
      return SORT_MODES[(idx + 1) % SORT_MODES.length]
    })
  }

  const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set())

  const toggleCollapsed = (label: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(label)) {
        next.delete(label)
      } else {
        next.add(label)
      }
      return next
    })
  }

  return (
    <box flexDirection="column">
      <box flexDirection="row" gap={1}>
        <text fg={theme().text}>Models Usage v{pluginVersion}</text>
        <text fg={theme().textMuted} onMouseDown={() => cycleSortMode()}>
          (sort: {sortMode()})
        </text>
      </box>
      <Show when={usage().models.length > 0}>
        <text fg={theme().textMuted}>
          Total: ${Number(usage().totals.totalCost.toFixed(4))} {" · "}
          {formatCompactNumber(usage().totals.totalTokens)} tokens
        </text>
        <text fg={theme().textMuted}>
          Cache: {formatCompactNumber(usage().totals.totalCachedTokens)}
          {" ("}{(usage().totals.totalTokens > 0
            ? (usage().totals.totalCachedTokens / usage().totals.totalTokens * 100).toFixed(1)
            : "0.0")}%)
        </text>
      </Show>
      {usage().models.length === 0 ? (
        <text>None yet</text>
      ) : (
        <box flexDirection="column" gap={1}>
          <For each={sortedModels()}>
            {(model) => (
              <CollapsibleModel
                model={model}
                theme={theme}
                collapsed={collapsed().has(model.label)}
                onToggle={() => toggleCollapsed(model.label)}
              />
            )}
          </For>
        </box>
      )}
    </box>
  )
}

const globalKey = Symbol.for(`opencode-plugin-${pluginID}`)

const tui: TuiPlugin = async (api, _options, _meta) => {
  const globalStore = globalThis as { [key: symbol]: boolean | undefined }

  if (globalStore[globalKey]) {
    return
  }
  globalStore[globalKey] = true

  api.lifecycle.onDispose(() => {
    globalStore[globalKey] = false
  })

  api.slots.register({
    order: 150,
    slots: {
      sidebar_content(_ctx, props) {
        return (
          <Show when={props.session_id} keyed>
            {(sessionID: string) => <SessionUsagePanel api={api} sessionID={sessionID} />}
          </Show>
        )
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: pluginID,
  tui,
}

export default plugin
