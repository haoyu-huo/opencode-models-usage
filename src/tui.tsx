/** @jsxImportSource @opentui/solid */

import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import type { Accessor } from "solid-js"
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"

import { getSessionUsage, type SessionMessageLike } from "./session-usage"

const pluginID = "session-model-usage"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const mapMessage = (message: unknown): SessionMessageLike => {
  if (!isRecord(message)) {
    return { role: "unknown" }
  }

  return {
    id: typeof message.id === "string" ? message.id : undefined,
    role: typeof message.role === "string" ? message.role : "unknown",
    modelID: typeof message.modelID === "string" ? message.modelID : undefined,
    providerID: typeof message.providerID === "string" ? message.providerID : undefined,
    tokens: isRecord(message.tokens) ? message.tokens : undefined,
    cost: typeof message.cost === "number" ? message.cost : undefined,
    summary: message.summary,
    time: isRecord(message.time)
      ? {
          created:
            typeof message.time.created === "number" ? message.time.created : undefined,
          completed:
            typeof message.time.completed === "number" ? message.time.completed : undefined,
        }
      : undefined,
    finish: typeof message.finish === "string" ? message.finish : undefined,
  }
}

const mapMessages = (messages: readonly unknown[]): SessionMessageLike[] => {
  return messages.map((message) => mapMessage(message))
}

const useSessionMessages = (api: TuiPluginApi, rootSessionID: Accessor<string>) => {
  const [rootMessages, setRootMessages] = createSignal<SessionMessageLike[]>([])
  const [extraMessages, setExtraMessages] = createSignal<SessionMessageLike[]>([])
  const [trackedSessionIDs, setTrackedSessionIDs] = createSignal<ReadonlySet<string>>(
    new Set([rootSessionID()]),
  )

  let reloadVersion = 0

  const fetchRootMessages = async (sessionID: string): Promise<SessionMessageLike[]> => {
    const result = await api.client.session.messages({ sessionID })
    if (result.error || !result.data) {
      return []
    }

    return mapMessages(result.data.map((message) => message.info))
  }

  const fetchChildrenMessages = async (
    sessionID: string,
    visited = new Set<string>(),
  ): Promise<{ messages: SessionMessageLike[]; sessionIDs: Set<string> }> => {
    if (visited.has(sessionID)) {
      return { messages: [], sessionIDs: visited }
    }

    visited.add(sessionID)
    const res = await api.client.session.children({ sessionID })
    if (res.error || !res.data) {
      return { messages: [], sessionIDs: visited }
    }

    let msgs: SessionMessageLike[] = []
    for (const child of res.data) {
      const childID = child.id
      if (visited.has(childID)) {
        continue
      }

      const mRes = await api.client.session.messages({ sessionID: childID })
      if (!mRes.error && mRes.data) {
        msgs.push(...mapMessages(mRes.data.map((message) => message.info)))
      }
      const nested = await fetchChildrenMessages(childID, visited)
      msgs.push(...nested.messages)
    }
    return { messages: msgs, sessionIDs: visited }
  }

  const reloadExtraMessages = async (sessionID: string) => {
    const version = ++reloadVersion
    const [root, result] = await Promise.all([
      fetchRootMessages(sessionID),
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

  const usage = createMemo(() => getSessionUsage(usageMessages(), props.api.state.provider))

  return (
    <box flexDirection="column">
      <text>📊 Models Usage</text>
      {usage().models.length === 0 ? (
        <text>None yet</text>
      ) : (
        <For each={usage().models}>
          {(model) => (
            <box flexDirection="column">
              <text fg={theme().text}>● {model.label}</text>
              <box flexDirection="column" paddingLeft={2}>
                <box flexDirection="row">
                  <text fg={theme().text} width={18} flexShrink={0}>■ Average TPS</text>
                  <text fg={theme().textMuted}>{model.tps > 0 ? model.tps.toFixed(1) : "—"}</text>
                </box>
                <box flexDirection="row">
                  <text fg={theme().text} width={18} flexShrink={0}>■ Context Tokens</text>
                  <text fg={theme().textMuted}>{model.contextTokens.toLocaleString("en-US")}</text>
                </box>
                <box flexDirection="row">
                  <text fg={theme().text} width={18} flexShrink={0}>■ Session Tokens</text>
                  <text fg={theme().textMuted}>{model.sessionTokens.toLocaleString("en-US")}</text>
                </box>
                <box flexDirection="row">
                  <text fg={theme().text} width={18} flexShrink={0}>■ Session Cached</text>
                  <text fg={theme().textMuted}>{model.sessionCachedTokens.toLocaleString("en-US")}</text>
                </box>
                <box flexDirection="row">
                  <text fg={theme().text} width={18} flexShrink={0}>■ spent</text>
                  <text fg={theme().textMuted}>${model.cost.toFixed(4)}</text>
                </box>
              </box>
            </box>
          )}
        </For>
      )}
    </box>
  )
}

const globalKey = Symbol.for(`opencode-plugin-${pluginID}`)

const tui: TuiPlugin = async (api) => {
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
