# opencode-models-usage-plugin

**语言：** [English](./README.md) | 简体中文 | [日本語](./README.ja.md) | [한국어](./README.ko.md)

**终于，你可以在 OpenCode 侧边栏里实时看到「你的 AI 模型团队」到底在干什么了。**

当你同时使用多个模型、多层 Agent（包括 OMO 子会话）全力 Coding 时，是否经常产生这些焦虑：

- 这个模型现在到底在不在输出？速度快不快？
- 已经悄悄消耗了多少 tokens？子 Agent 有没有偷偷调用其他模型？
- 缓存命中情况怎么样？这次 coding plan 还能撑多久？
- 账单会不会突然暴涨？

**现在，这些担心可以彻底告别了。**

`opencode-models-usage-plugin` 让你对整个会话树中的所有模型使用情况**一目了然**、**心中有数**。你可以更放心地驱动 AI 团队为你工作，而不必再畏手畏脚、时刻提心吊胆。

![Models Usage sidebar screenshot](./src/assets/img.png)


## 它能显示什么？

在 OpenCode 的侧边栏中，插件会按 **provider/model** 聚合展示当前会话树（含所有递归子会话）中每个模型的实时数据：

- **平均 TPS**：基于真实的 API 耗时数据，计算该模型所有已完成回复的平均 tokens per second
- **Context Tokens**：该模型最近一次回复对应的 token 总数，用来表示这一轮上下文占用
- **Session Tokens**：当前会话中该模型累计消耗的 token 总数
- **Session Cached**：当前会话中该模型累计缓存命中的 token 数，能直观看到缓存节省了多少
- **Total Cost**：当前已产生的费用（显示为 `spent $x.xxxx`）

## 侧边栏实际显示示例

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

● MiniMax/MiniMax-Text-01（子会话）
  ■ Average TPS 41.7
  ■ Context Tokens ...
  ■ Session Tokens ...
  ■ Session Cached ...
  ■ spent ...
```

## 核心价值

- **完全透明**：OMO 子 Agent、递归调用产生的消耗都会自动聚合，不再有“黑箱烧钱”
- **性能直观**：随时看到平均 TPS、缓存命中和累计成本，对模型性能心里有数
- **高效决策**：快速判断哪个模型响应慢、哪个缓存效果好，随时优化策略
- **低焦虑 Coding**：告别对账单暴涨、token 耗尽的恐惧，把注意力放回创作本身

无论你是重度使用多模型路由、复杂 Agent 编排，还是只是想对 token 消耗更有掌控感，这个插件都能显著提升你的使用体验和安心感。

## 运行要求

- OpenCode `>= 1.4.3`

## 安装方式

### 方式一：手动修改全局 TUI 配置（推荐第一次使用）

打开或新建全局配置文件：

```text
~/.config/opencode/tui.json
```

添加以下内容：

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "opencode-models-usage-plugin/tui"
  ],
  "plugin_enabled": {
    "session-model-usage": true
  }
}
```

保存后重启 OpenCode，插件会自动通过 npm 安装。

### 方式二：CLI 一键安装（最便捷）

```bash
opencode plugin opencode-models-usage-plugin --global
```

这条命令会自动安装插件，并更新全局配置。

## 技术说明

- 数据按 provider/model label 严格聚合
- 完整支持 OMO 子 Agent 及所有递归子会话，Gemini、MiniMax 等子模型调用也会被统计
- 平均 TPS 基于真实的 API 耗时数据计算，使用该模型的总 output tokens 除以总耗时
- Context Tokens 反映最近一次回复对应的 token 总数
- Session Tokens 与 Session Cached 反映当前整个会话树中的累计值

## 包信息

- npm：`opencode-models-usage-plugin`
- 当前版本：`0.1.0`

## License

`Apache-2.0`

安装后立刻试试看——当你第一次在侧边栏看到所有模型数据清晰、安静地排列在那里时，你会真切感受到：用 AI Coding，从此可以更放松、更可控。

欢迎提交 Issue、PR，或分享你的使用感受。

让我们一起让 OpenCode 的模型世界更加透明、更好用。🚀
