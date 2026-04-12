/** @jsxImportSource @opentui/solid */

import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import type { Accessor } from "solid-js"
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"

import { getSessionUsage, type SessionMessageLike, type LiveTpsState } from "./session-usage"

const pluginID = "local:session-model-usage"

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
  
  const [liveInfo, setLiveInfo] = createSignal<{
    messageID: string;
    modelID: string;
    providerID?: string;
    startTime: number;
    chars: number;
  } | null>(null)

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
    setLiveInfo(null)
    void reloadExtraMessages(sessionID)
  })

  onMount(() => {
    const unsubs = [
      api.event.on("message.part.delta", (ev) => {
        const { sessionID, messageID, field, delta } = ev.properties
        if (!sessionID || !messageID || typeof delta !== "string") return
        if (!trackedSessionIDs().has(sessionID)) return
        if (field !== "text" && field !== "reasoning") return

        setLiveInfo(prev => {
          if (prev?.messageID === messageID) {
            return { ...prev, chars: prev.chars + delta.length }
          }

          // Try to find the message
          const rootMsgs = mapMessages(api.state.session.messages(rootSessionID()))
          const historicalRootMessages = rootMessages()
          const extra = extraMessages()
          let found = rootMsgs.find(m => m.id === messageID)
          if (!found) {
            found = historicalRootMessages.find(m => m.id === messageID)
          }
          if (!found) {
            found = extra.find(m => m.id === messageID)
          }

          if (!found || found.role !== "assistant" || !found.modelID) {
            return prev
          }

          const modelID = found.modelID
          if (typeof modelID !== "string") {
            return prev
          }

          return {
            messageID,
            modelID,
            providerID: typeof found.providerID === "string" ? found.providerID : undefined,
            startTime: Date.now(),
            chars: delta.length
          }
        })
      }),
      api.event.on("message.updated", () => {
        void reloadExtraMessages(rootSessionID())
      }),
      api.event.on("session.status", () => {
        void reloadExtraMessages(rootSessionID())
      }),
      api.event.on("session.idle", (ev) => {
        if (!trackedSessionIDs().has(ev.properties.sessionID)) {
          return
        }

        setLiveInfo(null)
      })
    ]

    onCleanup(() => {
      reloadVersion += 1
      unsubs.forEach((unsubscribe) => {
        unsubscribe()
      })
    })
  })

  // Derive liveTps from liveInfo
  const [now, setNow] = createSignal(Date.now())
  
  onMount(() => {
    const timer = setInterval(() => setNow(Date.now()), 500)
    onCleanup(() => clearInterval(timer))
  })

  const liveTps = createMemo<LiveTpsState | null>(() => {
    const info = liveInfo()
    if (!info) return null

    const durationMs = now() - info.startTime
    // Estimate 1 token = 4 chars approx during streaming
    const tpsTokens = Math.ceil(info.chars / 4)

    return {
      modelID: info.modelID,
      providerID: info.providerID,
      tpsTokens,
      tpsDurationMs: Math.max(durationMs, 1)
    }
  })

  const usageMessages = createMemo(() => {
    return [...rootMessages(), ...extraMessages()]
  })

  return { usageMessages, liveTps }
}

const SessionUsagePanel = (props: { api: TuiPluginApi; sessionID: string }) => {
  const activeSessionID = createMemo<string>(() => {
    const route = props.api.route.current
    if (route.name === "session" && typeof route.params?.sessionID === "string") {
      return route.params.sessionID
    }

    return props.sessionID
  })

  const { usageMessages, liveTps } = useSessionMessages(props.api, activeSessionID)
  
  const usage = createMemo(() => getSessionUsage(usageMessages(), props.api.state.provider, liveTps()))

  return (
    <box flexDirection="column">
      <text>📊 Models Usage</text>
      {usage().models.length === 0 ? (
        <text>None yet</text>
      ) : (
        <For each={usage().models}>
          {(model) => (
            <box flexDirection="column">
              <text fg={model.isLiveTps ? "yellow" : undefined}>● {model.label}</text>
              <box flexDirection="column" paddingLeft={2}>
                <box flexDirection="row">
                  <text>■ TPS </text>
                  <text fg="gray">{model.isLiveTps && model.tps > 0 ? model.tps.toFixed(1) : "—"}</text>
                </box>
                <box flexDirection="row">
                  <text>■ Context Tokens </text>
                  <text fg="gray">{model.contextTokens.toLocaleString("en-US")}</text>
                </box>
                <box flexDirection="row">
                  <text>■ Session Tokens </text>
                  <text fg="gray">{model.sessionTokens.toLocaleString("en-US")}</text>
                </box>
                <box flexDirection="row">
                  <text>■ Session Cached </text>
                  <text fg="gray">{model.sessionCachedTokens.toLocaleString("en-US")}</text>
                </box>
                <box flexDirection="row">
                  <text>■ spent </text>
                  <text fg="gray">${model.cost.toFixed(4)}</text>
                </box>
              </box>
            </box>
          )}
        </For>
      )}
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
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
