import assert from "node:assert/strict"
import test from "node:test"

import { getSessionUsage, getTokenTotal } from "./session-usage"

interface MessageLike {
  role: string
  modelID?: string | null
  providerID?: string | null
  tokens?: {
    input?: number | null
    output?: number | null
    reasoning?: number | null
    cache?: {
      read?: number | null
      write?: number | null
    } | null
  } | null
  cost?: number | null
  time?: {
    created?: number | null
    completed?: number | null
  } | null
}

test("empty session returns no models", () => {
  assert.deepEqual(getSessionUsage([]), {
    models: [],
    totals: { totalCost: 0, totalTokens: 0, totalCachedTokens: 0 },
  })
})

test("assistant message contributes all token counters and cost", () => {
  const usage = getSessionUsage([
    {
      role: "assistant",
      providerID: "openai",
      modelID: "gpt-4.1",
      cost: 0.05,
      tokens: {
        input: 11,
        output: 7,
        reasoning: 5,
        cache: {
          read: 3,
          write: 2,
        },
      },
    },
  ])

  assert.deepEqual(usage, {
    models: [
      {
        label: "openai/gpt-4.1",
        contextTokens: 28,
        sessionTokens: 28,
        sessionCachedTokens: 3,
        cost: 0.05,
        tps: 0,
        messageCount: 1,
        cacheHitRatio: 3 / 28,
      },
    ],
    totals: { totalCost: 0.05, totalTokens: 28, totalCachedTokens: 3 },
  })
})

test("repeated model uses the latest output-bearing message for tokens", () => {
  const messages: MessageLike[] = [
    {
      role: "assistant",
      providerID: "openai",
      modelID: "gpt-4.1",
      cost: 0.01,
      tokens: {
        input: 10,
        output: 5,
      },
      time: { created: 1000, completed: 3000 },
    },
    {
      role: "assistant",
      providerID: "openai",
      modelID: "gpt-4.1",
      cost: 0.02,
      tokens: {
        input: 4,
        output: 6,
        cache: {
          read: 7,
          write: 1,
        },
      },
      time: { created: 4000, completed: 5000 },
    },
  ]

  assert.deepEqual(getSessionUsage(messages), {
    models: [
      {
        label: "openai/gpt-4.1",
        contextTokens: 18,
        sessionTokens: 33,
        sessionCachedTokens: 7,
        cost: 0.03,
        tps: 11 / 3,
        messageCount: 2,
        cacheHitRatio: 7 / 33,
      },
    ],
    totals: { totalCost: 0.03, totalTokens: 33, totalCachedTokens: 7 },
  })
})

test("multiple models preserve first-seen order", () => {
  const usage = getSessionUsage([
    {
      role: "assistant",
      providerID: "anthropic",
      modelID: "claude-sonnet-4",
      tokens: {
        input: 1,
        output: 2,
      },
    },
    {
      role: "assistant",
      providerID: "openai",
      modelID: "gpt-4.1",
      tokens: {
        input: 3,
        output: 4,
      },
    },
  ])

  assert.deepEqual(usage.models.map((m) => m.label), [
    "anthropic/claude-sonnet-4",
    "openai/gpt-4.1",
  ])
  assert.equal(usage.models[0].contextTokens, 3)
  assert.equal(usage.models[0].sessionTokens, 3)
  assert.equal(usage.models[0].sessionCachedTokens, 0)
  assert.equal(usage.models[0].messageCount, 1)
  assert.equal(usage.models[0].cacheHitRatio, 0)
  assert.equal(usage.models[1].contextTokens, 7)
  assert.equal(usage.models[1].sessionTokens, 7)
  assert.equal(usage.models[1].sessionCachedTokens, 0)
  assert.equal(usage.models[1].messageCount, 1)
  assert.equal(usage.models[1].cacheHitRatio, 0)
  assert.deepEqual(usage.totals, { totalCost: 0, totalTokens: 10, totalCachedTokens: 0 })
})

test("non-assistant messages are ignored", () => {
  const usage = getSessionUsage([
    {
      role: "user",
      providerID: "openai",
      modelID: "gpt-4.1",
      cost: 10,
      tokens: {
        input: 999,
        output: 999,
      },
    },
    {
      role: "assistant",
      providerID: "openai",
      modelID: "gpt-4.1",
      cost: 0.1,
      tokens: {
        input: 3,
        output: 2,
      },
    },
  ])

  assert.deepEqual(usage, {
    models: [
      {
        label: "openai/gpt-4.1",
        contextTokens: 5,
        sessionTokens: 5,
        sessionCachedTokens: 0,
        cost: 0.1,
        tps: 0,
        messageCount: 1,
        cacheHitRatio: 0,
      },
    ],
    totals: { totalCost: 0.1, totalTokens: 5, totalCachedTokens: 0 },
  })
})

test("provider catalog names are used when available", () => {
  const providers = [
    {
      id: "openai",
      name: "OpenAI",
      source: "config" as const,
      env: [] as string[],
      key: undefined as string | undefined,
      options: {},
      models: {
        "gpt-4.1": {
          id: "gpt-4.1",
          providerID: "openai",
          name: "GPT-4.1",
          api: { id: "", url: "", npm: "" },
          capabilities: {
            temperature: false,
            reasoning: false,
            attachment: false,
            toolcall: false,
            input: { text: true, audio: false, image: false, video: false, pdf: false },
            output: { text: true, audio: false, image: false, video: false, pdf: false },
            interleaved: false,
          },
          cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
          limit: { context: 0, output: 0 },
          status: "active" as const,
          options: {},
          headers: {},
          release_date: "",
        },
      },
    },
  ]

  const usage = getSessionUsage(
    [
      {
        role: "assistant",
        providerID: "openai",
        modelID: "gpt-4.1",
        tokens: {
          input: 2,
          output: 3,
        },
      },
    ],
    providers,
  )

  assert.deepEqual(usage, {
    models: [
      {
        label: "OpenAI/GPT-4.1",
        contextTokens: 5,
        sessionTokens: 5,
        sessionCachedTokens: 0,
        cost: 0,
        tps: 0,
        messageCount: 1,
        cacheHitRatio: 0,
      },
    ],
    totals: { totalCost: 0, totalTokens: 5, totalCachedTokens: 0 },
  })
})

test("provider catalog also works when providers are stored as an array", () => {
  const providers = [
    {
      id: "anthropic",
      name: "Anthropic",
      source: "config" as const,
      env: [] as string[],
      key: undefined as string | undefined,
      options: {},
      models: {
        "claude-sonnet-4": {
          id: "claude-sonnet-4",
          providerID: "anthropic",
          name: "Claude Sonnet 4",
          api: { id: "", url: "", npm: "" },
          capabilities: {
            temperature: false,
            reasoning: false,
            attachment: false,
            toolcall: false,
            input: { text: true, audio: false, image: false, video: false, pdf: false },
            output: { text: true, audio: false, image: false, video: false, pdf: false },
            interleaved: false,
          },
          cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
          limit: { context: 0, output: 0 },
          status: "active" as const,
          options: {},
          headers: {},
          release_date: "",
        },
      },
    },
  ]

  const usage = getSessionUsage(
    [
      {
        role: "assistant",
        providerID: "anthropic",
        modelID: "claude-sonnet-4",
        tokens: {
          input: 4,
          output: 6,
        },
      },
    ],
    providers,
  )

  assert.deepEqual(usage, {
    models: [
      {
        label: "Anthropic/Claude Sonnet 4",
        contextTokens: 10,
        sessionTokens: 10,
        sessionCachedTokens: 0,
        cost: 0,
        tps: 0,
        messageCount: 1,
        cacheHitRatio: 0,
      },
    ],
    totals: { totalCost: 0, totalTokens: 10, totalCachedTokens: 0 },
  })
})

test("token helper tolerates missing counters", () => {
  assert.equal(
    getTokenTotal({
      input: 1,
      cache: {
        read: 2,
      },
    }),
    3,
  )
})

test("latest output-bearing assistant message determines displayed tokens and cache", () => {
  const usage = getSessionUsage([
    {
      role: "assistant",
      providerID: "openai",
      modelID: "gpt-4",
      tokens: {
        input: 5,
        output: 10,
        cache: {
          read: 20,
          write: 2,
        },
      },
      time: { created: 1000, completed: 2000 },
    },
    {
      role: "assistant",
      providerID: "openai",
      modelID: "gpt-4",
      tokens: {
        input: 100,
        output: 0,
        cache: {
          read: 999,
          write: 999,
        },
      },
      time: { created: 3000, completed: 4000 },
    },
    {
      role: "assistant",
      providerID: "openai",
      modelID: "gpt-4",
      tokens: {
        input: 11,
        output: 7,
        reasoning: 3,
        cache: {
          read: 30,
          write: 4,
        },
      },
      time: { created: 5000, completed: 6000 },
    },
  ])

  assert.deepEqual(usage, {
    models: [
      {
        label: "openai/gpt-4",
        contextTokens: 55,
        sessionTokens: 2190,
        sessionCachedTokens: 1049,
        cost: 0,
        tps: 17 / 2,
        messageCount: 3,
        cacheHitRatio: 1049 / 2190,
      },
    ],
    totals: { totalCost: 0, totalTokens: 2190, totalCachedTokens: 1049 },
  })
})

test("messageCount increments per assistant message", () => {
  const usage = getSessionUsage([
    { role: "assistant", providerID: "openai", modelID: "gpt-4", tokens: { input: 1, output: 1 } },
    { role: "assistant", providerID: "openai", modelID: "gpt-4", tokens: { input: 2, output: 0 } },
    { role: "assistant", providerID: "openai", modelID: "gpt-4", tokens: { input: 3, output: 1 } },
  ])
  assert.equal(usage.models[0].messageCount, 3)
})

test("cacheHitRatio is zero when sessionTokens is zero", () => {
  const usage = getSessionUsage([
    { role: "assistant", providerID: "openai", modelID: "gpt-4", tokens: null },
  ])
  assert.equal(usage.models[0].cacheHitRatio, 0)
})

test("totals aggregate across multiple models", () => {
  const usage = getSessionUsage([
    { role: "assistant", providerID: "a", modelID: "m1", cost: 0.01, tokens: { input: 10, output: 5, cache: { read: 2 } } },
    { role: "assistant", providerID: "b", modelID: "m2", cost: 0.02, tokens: { input: 20, output: 10, cache: { read: 3 } } },
  ])
  assert.deepEqual(usage.totals, {
    totalCost: 0.03,
    totalTokens: 50,
    totalCachedTokens: 5,
  })
})
