# opencode-models-usage-plugin

**Languages:** English | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md)

**Finally, you can see exactly what your AI model team is doing — right in the OpenCode sidebar.**

When you're coding with multiple models and multi-layer agents, including OMO sub-sessions, do you ever worry about things like:

- Which model is actively generating right now? Is it fast or slow?
- How many tokens have already been consumed? Are sub-agents quietly calling other models?
- How effective is cache reuse? How long can this coding plan keep going?
- Is the bill about to spike?

**Those anxieties can now be a thing of the past.**

`opencode-models-usage-plugin` gives you clear visibility into model usage across the entire session tree. You can see what is happening, stay in control, and drive your AI team with much more confidence.

![Models Usage sidebar screenshot](./src/assets/img.png)

## What It Displays

In the OpenCode sidebar, the plugin aggregates real-time usage for every model used in the current session tree, including all recursive sub-sessions, grouped by **provider/model**:

- **Average TPS**: the average tokens per second across all completed responses for that model, calculated from real API timing data
- **Context Tokens**: the token total for that model's most recent reply, used as the current context footprint
- **Session Tokens**: the cumulative token total consumed by that model in the current session
- **Session Cached**: the cumulative cache-hit tokens for that model in the current session, so you can see how much cache reuse is helping
- **Total Cost**: the amount spent so far, shown as `spent $x.xxxx`

## Real Sidebar Example

```text
📊 Models Usage
● OpenAI/GPT-5.4 Fast
  ■ Average TPS 23.1
  ■ Context Tokens 12,345
  ■ Session Tokens 84,163
  ■ Session Cached 81,792
  ■ spent $0.0000

● Google/Gemini-2.5-Pro
  ■ Average TPS —
  ■ Context Tokens 8,942
  ■ Session Tokens 45,672
  ■ Session Cached 32,100
  ■ spent $0.0123

● MiniMax/MiniMax-Text-01 (sub-session)
  ■ Average TPS 41.7
  ■ Context Tokens ...
  ■ Session Tokens ...
  ■ Session Cached ...
  ■ spent ...
```

## Why It Matters

- **Total Transparency**: usage from OMO sub-agents and recursive calls is automatically aggregated, so there are no more hidden costs
- **Performance Insight**: see average TPS, cache hits, and cumulative costs per model at a glance
- **Smarter Decisions**: quickly spot slow models or strong cache performers and adjust your strategy on the fly
- **Lower-Stress Coding**: stop worrying about surprise bills or token drain, and focus on building

Whether you are heavily using model routing, complex agent orchestration, or simply want better visibility into token usage, this plugin can make the experience far more transparent and reassuring.

## Requirements

- OpenCode `>= 1.17.0`

## Installation

### Method 1: Manually update the global TUI config (recommended for first-time setup)

Open or create the global config file:

```text
~/.config/opencode/tui.json
```

Add the following:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "@jou_hhy/opencode-models-usage-plugin"
  ],
  "plugin_enabled": {
    "session-model-usage": true
  }
}
```

Save the file and restart OpenCode. The plugin will be installed automatically via npm.

### Method 2: One-click install via CLI

```bash
opencode plugin @jou_hhy/opencode-models-usage-plugin --global
```

This command installs the plugin and updates your global config automatically.

## Technical Notes

- Data is grouped strictly by provider/model label
- Fully supports OMO sub-agents and all recursive sub-sessions, including Gemini, MiniMax, and others
- Average TPS is calculated from real API timing data, using total output tokens divided by total duration for that model
- Context Tokens reflect the token total of the most recent reply
- Session Tokens and Session Cached reflect cumulative values across the current session tree

## Package Info

- npm: `@jou_hhy/opencode-models-usage-plugin`
- current version: `2.0.0`

## License

`Apache-2.0`

Try it right after installing — the first time you see all your model activity laid out clearly in the sidebar, you may realize that AI coding can finally feel much calmer and far more under control.

Issues, PRs, and feedback are always welcome.

Let’s make the OpenCode model ecosystem more transparent and more usable together. 🚀
