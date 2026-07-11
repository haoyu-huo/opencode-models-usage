# opencode-models-usage-plugin

**言語:** [English](./README.md) | [简体中文](./README.zh-CN.md) | 日本語 | [한국어](./README.ko.md)

**ついに、OpenCode のサイドバーで「AI モデルチームが今何をしているか」をリアルタイムで見られるようになりました。**

複数モデルや多段 Agent、さらに OMO のサブセッションまで使って本格的に Coding していると、こんな不安を感じることはありませんか？

- 今どのモデルが出力中なのか？速度は速いのか遅いのか？
- すでにどれだけ tokens を消費したのか？サブ Agent が別のモデルを勝手に呼んでいないか？
- キャッシュのヒット状況はどうか？この coding plan はまだ持ちそうか？
- コストが急に跳ね上がらないか？

**もう、そうした不安に振り回される必要はありません。**

`opencode-models-usage-plugin` は、現在のセッションツリー全体におけるモデル使用状況を見える化します。何が起きているかを把握しながら、より安心して AI チームを動かせるようになります。

![Models Usage sidebar screenshot](./src/assets/img.png)

## 何が表示されるのか

OpenCode のサイドバーで、現在のセッションツリー（再帰的な子セッションを含む）に登場した各モデルの使用状況を **provider/model** 単位で集約表示します。

- **Average TPS**: 実際の API タイミングデータに基づいて計算された、そのモデルの全完了応答の平均 tokens per second
- **Messages**: そのモデルが現在のセッションで処理した assistant メッセージ数
- **Context Tokens**: そのモデルの直近の返信に対応する token 総数
- **Session Tokens**: 現在のセッション内でそのモデルが累積消費した token 総数
- **Session Cached**: 現在のセッション内でそのモデルが累積でキャッシュヒットした token 数（キャッシュヒット率付き）
- **Total Cost**: 現時点までの累積コスト（`spent $x.xxxx` 形式）

上部に**セッション集計行**が表示され、全モデルの合計コスト、総 token 数、キャッシュヒット率を確認できます。ソートインジケーターをクリックすると、コスト・tokens・TPS で並び替えられます。

## サイドバー表示例

```text
Models Usage v2.1.3 (sort: default)
Total: $0 · 84.2K tokens
Cache: 81.8K (97.1%)
▾ OpenAI/GPT-5.4 Fast
  ■ Average TPS 23.1
  ■ Messages 5
  ■ Context Tokens 12,345
  ■ Session Tokens 84,163
  ■ Session Cached 81,792 (97.2%)
  ■ spent $0.0000

▸ Google/Gemini-2.5-Pro
  ■ Average TPS —
  ■ Messages 2
  ■ Context Tokens 8,942
  ■ Session Tokens 45,672
  ■ Session Cached 32,100 (70.3%)
  ■ spent $0.0123
```

## これが重要な理由

- **完全な透明性**: OMO サブ Agent や再帰呼び出しによる使用量も自動で集約され、見えないコストがなくなります
- **パフォーマンス把握**: 平均 TPS、キャッシュヒット、累積コストをその場で確認できます
- **判断しやすい**: 遅いモデルやキャッシュ効率の良いモデルを素早く見分け、戦略を調整できます
- **安心して Coding**: 突然の高額請求や token 枯渇を気にしすぎず、開発そのものに集中できます

## 動作要件

- OpenCode `>= 1.17.0`

## インストール

### 方法 1: グローバル TUI 設定を手動で更新する（初回におすすめ）

以下のグローバル設定ファイルを開くか、新規作成します。

```text
~/.config/opencode/tui.json
```

次の内容を追加してください。

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

保存して OpenCode を再起動すると、npm 経由で自動インストールされます。

### 方法 2: CLI でワンコマンドインストール

```bash
opencode plugin @jou_hhy/opencode-models-usage-plugin --global
```

このコマンドでプラグインのインストールとグローバル設定の更新を自動で行えます。

## 技術メモ

- データは provider/model label 単位で厳密に集約されます
- OMO サブ Agent や再帰的な子セッションも完全にサポートします
- TPS は実際の API タイミングデータに基づいて計算され、総 output tokens を総所要時間で割った平均値です
- Context Tokens は直近の返信に対応します
- Session Tokens と Session Cached は現在のセッションツリー全体での累積値です
- Messages は出力 token が 0 のメッセージも含むすべての assistant メッセージをカウントします
- キャッシュヒット率 = `sessionCachedTokens / sessionTokens`
- ヘッダーのソートインジケーターをクリックすると、コスト・session tokens・TPS で並び替えられます

## パッケージ情報

- npm: `@jou_hhy/opencode-models-usage-plugin`
- 現在のバージョン: `2.1.3`

## License

`Apache-2.0`

インストール後、ぜひすぐに試してみてください。サイドバーにモデルの状態が整然と並ぶのを見た瞬間、AI Coding がもっと落ち着いて、もっと扱いやすく感じられるはずです。
