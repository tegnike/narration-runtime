# narration-runtime

`ai-agent-game-streamer` などの生成側アプリケーションから共通利用する、単体のナレーション実行基盤です。

このリポジトリは WebSocket プロトコル、リレーサーバー、生成側クライアント、ナレーション UI を管理します。生成側アプリケーションは `narration:say` を送信し、UI は VOICEVOX で音声合成と再生を行い、完了状態をリレー経由で返します。

## パッケージ

| パッケージ | 役割 |
|---|---|
| `@narration-runtime/protocol` | 共有 WebSocket メッセージ型 |
| `@narration-runtime/client` | TypeScript 製の生成側クライアント |
| `@narration-runtime/relay` | 生成側/UI/監視クライアント向け WebSocket リレー |
| `@narration-runtime/ui` | 字幕、キャラクター表示、VOICEVOX 再生を行う React UI |

## 必要要件

- Node.js 18 以上
- npm
- 実際に TTS 再生を行う場合は VOICEVOX Engine

リレーとスモークテストは VOICEVOX を必要としません。UI は VOICEVOX がなくても開けますが、エンジンが利用可能になるまで音声合成は失敗します。

## セットアップ

```bash
npm install
npm run build
npm test
```

## 起動

リレーを起動します。

```bash
npm run relay
```

別のターミナルで UI を起動します。

```bash
npm run ui:dev
```

既定のエンドポイントは次の通りです。

| サービス | URL |
|---|---|
| リレー WebSocket | `ws://localhost:3010/ws/narration` |
| リレー状態/機能 API | `http://localhost:3010/api/narration/status` |
| UI 開発サーバー | `http://localhost:5175` |
| VOICEVOX Engine | `/voicevox` プロキシ経由で `http://127.0.0.1:50021` |

## スクリプト

| スクリプト | 説明 |
|---|---|
| `npm run build` | protocol/client/relay と UI の本番ビルドを作成 |
| `npm test` | relay/client の統合テストを実行 |
| `npm run relay` | ポート `3010` でリレーを起動 |
| `npm run ui:dev` | ポート `5175` で UI 開発サーバーを起動 |
| `npm run ui:build` | UI だけをビルド |
| `npm run smoke` | リレー、モック UI、ランタイムクライアントを起動し、完了通知を検証 |
| `npm run smoke:ai-agent-game-streamer` | このリレーを起動し、隣接する `ai-agent-game-streamer` アダプターがナレーションの往復を完了できることを検証 |

## プロトコル

各 WebSocket クライアントは、最初に `narration:hello` を送信します。

```json
{ "type": "narration:hello", "role": "producer", "clientName": "my-app" }
```

ロールは次の通りです。

| ロール | 説明 |
|---|---|
| `producer` | 発話を送信する生成側クライアント |
| `ui` | 発話を受け取り、TTS を再生し、状態を返す UI |
| `observer` | 監視用に状態/ステータスイベントを受信するクライアント |

生成側の発話メッセージ例です。

```json
{
  "type": "narration:say",
  "id": "utt_001",
  "text": "ここは慎重にいきます。",
  "thought": "安全なルートを探している。",
  "speaker": "nike",
  "emotion": "thinking",
  "interrupt": false,
  "pace": "normal",
  "intensity": "normal",
  "priority": 0,
  "queuePolicy": "enqueue",
  "maxQueueMs": 5000,
  "subtitleOnly": false,
  "metadata": {
    "source": "my-app"
  }
}
```

### 感情タイプ

| 入力感情 | UI 表示感情 | 説明 |
|---|---|---|
| `neutral` | `neutral` | 既定の落ち着いた表情 |
| `happy` | `happy` | 肯定的、うれしい表情 |
| `angry` | `angry` | 怒り、不満の表情 |
| `sad` | `sad` | 悲しみ、不安、不利な状況の表情 |
| `thinking` | `thinking` | 思考中、検討中の表情 |
| 未知の文字列 | `neutral` | 未知の値は受け付け、表示は `neutral` にフォールバック |

プロトコル型では `emotion?: NarrationEmotion | string` を公開しています。これにより、生成側は将来のカスタム値を送ってもリレーを壊さずに済みます。同梱 UI は、利用可能なキャラクター素材ディレクトリである `neutral`、`happy`、`angry`、`sad`、`thinking` の5種類へ割り当てます。

`normal`、`joy`、`surprised` のキャラクター素材はありません。古い生成側またはカスタム生成側が `normal` を送った場合、現在の UI は `neutral` として扱います。`joy` と `surprised` は `happy` として扱います。新しい生成側は、上記5種類の公式感情だけを使ってください。

怒り表情には、開口/閉口とまばたきの各画像状態が含まれます。UI は発話中の口パクとまばたきに合わせて `angry` 素材も他の感情と同様に切り替えます。

対応機能は protocol パッケージとリレー状態 API から機械可読で取得できます。

```ts
import {
  NARRATION_SUPPORTED_EMOTIONS,
  NARRATION_SUPPORTED_PACES,
  NARRATION_SUPPORTED_INTENSITIES,
  NARRATION_SUPPORTED_QUEUE_POLICIES,
} from "@narration-runtime/protocol";
```

```bash
curl http://localhost:3010/api/narration/status
```

状態レスポンスには `supportedEmotions`、`supportedPaces`、`supportedIntensities`、`supportedQueuePolicies` が含まれます。

### 話し方の制御

| フィールド | 値 | 説明 |
|---|---|---|
| `pace` | `slow`、`normal`、`fast`、または数値 `0.5..2` | VOICEVOX の話速へ割り当て |
| `intensity` | `low`、`normal`、`high`、または数値 `0..2` | VOICEVOX の抑揚/音量へ割り当て |
| `priority` | 数値、既定値 `0` | UI キュー内で、値が大きい発話ほど先に再生 |
| `subtitleOnly` | 真偽値、既定値 `false` | TTS 合成を行わず、字幕表示だけで完了 |

### 思考ログ

| フィールド | 説明 |
|---|---|
| `thought` | 生成側の思考や推論要約を任意で指定します。TTS では読み上げません。同梱 UI は、対応する `say` エントリーの前に `thought` としてログへ記録し、思考タブに本文を表示します。 |

UI のログ領域には `思考` と `イベント` のタブがあります。`思考` タブには `thought` の本文を時刻付きで表示し、`イベント` タブには接続、発話、抑制、状態などのイベントを表示します。各ログは直近50件を表示し、タブ切り替えや新規ログ追加時に末尾へ自動スクロールします。

### キュー制御

| フィールド | 値 | 説明 |
|---|---|---|
| `interrupt` | 真偽値 | 現在の再生を即時中断し、キュー済み項目をクリア |
| `queuePolicy` | `enqueue` | 既定値。通常通りキューに追加し、高優先度項目から再生 |
| `queuePolicy` | `dropIfBusy` | UI が再生中またはキューを持つ場合、即時スキップ |
| `queuePolicy` | `replaceIfHigherPriority` | 入力項目の優先度が現在/キュー済み項目より高い場合だけ置換 |
| `maxQueueMs` | 数値 | 再生開始前にこの待ち時間を超えた項目をスキップ |

生成側へ返る終端ステータスは次の通りです。

- `narration:completed`
- `narration:failed`
- `narration:skipped`

ステータスメッセージにはログ分析用の `reason` が含まれます。例として、UI クライアントがない場合は `narration:skipped` と `reason: "no_ui_clients"`、キュードロップは `queue_drop_busy`、優先度置換は `queue_replaced_by_priority`、UI 確認タイムアウトは `narration:failed` と `reason: "timeout"` を返します。

UI クライアントが接続されていない場合、リレーは `narration:skipped` を返します。UI がタイムアウトまでに応答しない場合、リレーは `narration:failed` を返します。

生成側が意図的に沈黙する場合は、監視/UI に見えるイベントとして抑制済みナレーションを送信できます。

```ts
await client.suppress({
  text: "Low-value explanation suppressed during combat.",
  reason: "producer_suppressed",
  metadata: { source: "ai-agent-game-streamer" },
});
```

リレーはこれを `narration:suppressed` としてブロードキャストします。TTS キューには入らず、生成側向けの完了ステータスも作成しません。

## UI の表示仕様

同梱 UI は、16:9 のゲーム表示領域、下段の固定字幕枠、右側のステータス/ログ/キャラクターパネルで構成されます。ゲーム表示領域と字幕枠は画面サイズに合わせて比率を保ち、右側パネルには接続状態、VOICEVOX 状態、再生状態、ログ、キャラクターが収まります。

字幕は発話テキストを下段のセリフ枠に表示します。現在の字幕がある間、または TTS が再生/処理中の間は表示を維持し、発話完了後は短い猶予を置いてフェードアウトします。長い字幕は枠内で折り返されます。

キャラクターパネルは中央寄せで表示され、発話中は感情、まばたき、口パク、軽い上下動を反映します。

## 生成側クライアント

```ts
import { NarrationClient } from "@narration-runtime/client";

const client = new NarrationClient({
  url: "ws://localhost:3010/ws/narration",
  clientName: "my-app",
  timeoutMs: 45_000,
});

await client.connect();
const result = await client.say({
  text: "ここは慎重にいきます。",
  thought: "安全なルートを探している。",
  speaker: "nike",
  emotion: "thinking",
  pace: "slow",
  intensity: "low",
  priority: 1,
  queuePolicy: "enqueue",
});
await client.close();
```

既定では、リレー接続を利用できない場合も例外を投げずに `narration:skipped` として解決します。これにより、生成側アプリケーションは実行を継続できます。

## ai-agent-game-streamer 連携

ローカル開発では、`ai-agent-game-streamer` は `file:../narration-runtime/packages/...` を通じて、この隣接ワークスペースの各パッケージに依存します。

典型的な実行手順です。

```bash
cd /Users/user/WorkSpace/narration-runtime
npm run relay
npm run ui:dev
```

```bash
cd /Users/user/WorkSpace/ai-agent-game-streamer
npm run stream:managed -- --narration-url=ws://localhost:3010/ws/narration
```

リポジトリ横断の検証です。

```bash
cd /Users/user/WorkSpace/narration-runtime
npm run smoke:ai-agent-game-streamer
```

このスモークテストは外部リレーを起動し、モック UI を接続し、`ai-agent-game-streamer` の生成側アダプター経由で発話を送信して、`narration:completed` が返ることを検証します。
