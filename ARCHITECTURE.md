# アーキテクチャ：原本から帳票出力まで

Spec Form Studio は、**AI が原本から候補を抽出し、人が値と様式を確認した後に帳票を作る**アプリです。
Snowflake が原本・抽出結果・確認状態・履歴を保持し、Next.js が画面・API・PDF/Word の生成を担当します。
この文書の図は、リポジトリに同梱した実装を表します。将来構想の構成図ではありません。

- まず全体をつかむ: [README の全体図](README.md#アーキテクチャの全体像)
- 接続・構築: [DEPLOY.md](DEPLOY.md)
- 帳票の描画方式・制限: [EXPORT.md](EXPORT.md)

## 1. 配置と責務

デプロイ済み環境では Next.js サーバーを Snowflake App Runtime の Application Service として動かします。
画面は利用者のブラウザで動きます。下図の矢印は要求と応答の境界を表します。

```mermaid
flowchart TB
    browser["利用者のブラウザ<br/>React 画面・PDF.js による原本表示"]
    subgraph account["デプロイ先の Snowflake アカウント"]
        subgraph app["Application Service / Next.js サーバー"]
            api["Route Handlers<br/>入力検証・認証・業務操作の受付"]
            sdk["lib/db.ts / lib/snowflake.ts<br/>Snowflake Node.js SDK"]
            renderer["PDF / DOCX 描画<br/>保存済みの値と座標定義から生成"]
            api --> sdk
            api --> renderer
        end
        subgraph data["データ層 / DB・スキーマ"]
            stages["RAW / UPLOADS<br/>原本・Excel の HTML 変換物"]
            objects["テーブル・ビュー・プロシージャ<br/>抽出候補・確認状態・様式・履歴"]
            ai["Cortex AI 関数<br/>文字起こし・文書種別判定・属性抽出"]
            objects --> stages
            objects --> ai
        end
        sdk <-->|"参照・プロシージャ呼び出し"| objects
        sdk -->|"PUT で原本を保存"| stages
    end
    browser <-->|"HTTPS / API"| api
    renderer -->|"HTTP 応答でファイルを返す"| browser
```

### 実行権限の境界

- デプロイ済みアプリの DB 呼び出しは、サービス用トークンと利用者トークンを使う caller's rights 接続です。
- **その接続から呼ぶプロシージャの実行権限は別です。** `PARSE_UPLOAD` と `STRUCTURE_UPLOAD` は `EXECUTE AS OWNER` です。AI 処理が読む原本と書く抽出結果は、これらの所有者ロールの権限で処理します。呼び出しにはプロシージャの利用権限が必要です。
- 登録、Excel 変換、確認・採用、出力準備・記録のプロシージャは `EXECUTE AS CALLER` です。`RESTRUCTURE_UPLOAD` も CALLER ですが、内部で OWNER の `STRUCTURE_UPLOAD` を呼びます。
- ローカル開発ではサーバー部分だけを手元で動かし、接続先 Snowflake の実データを読み書きします。ブラウザ利用者ごとの認証ではなく、設定した接続ユーザーの資格情報を使います。

## 2. データ取り込みと AI 処理

**画面操作で開始するオンデマンド処理**です。同梱 SQL は、この流れを自動実行する Snowpipe、Stream、Task、Dynamic Table を作成しません。
アップロードしただけでは AI による文字起こし・属性抽出は始まりません。

```mermaid
flowchart TB
    file["追加する原本<br/>PDF / Excel"] --> upload["POST /api/upload<br/>形式・サイズ検証、PUT、REGISTER_UPLOAD"]
    upload --> original["UPLOADS ステージ<br/>原本を保存"]
    upload --> registry["DOC_REGISTRY / DOC_VERSION<br/>商品・文書・取り込み時の版を登録"]
    original --> kind{"ファイル形式"}
    kind -->|"PDF"| input["AI が読むファイル"]
    kind -->|"Excel"| convert["RENDER_UPLOAD → RENDER_SHEET_HTML<br/>Snowpark Python / openpyxl・xlrd"]
    convert --> html["UPLOADS 内の HTML<br/>DOC_RENDITION に対応を記録"]
    html --> input
    input -->|"文字起こし操作 /api/parse"| parse["PARSE_UPLOAD / AI_PARSE_DOCUMENT<br/>PDF: OCR、HTML: LAYOUT"]
    parse --> transcript["DOC_PARSE<br/>ページ別テキスト・処理情報"]
    transcript --> inspect["画面で AI の読み取り内容を確認"]
    input -->|"構造化操作 /api/structure"| structure["STRUCTURE_UPLOAD / AI_EXTRACT<br/>文書種別を判定し、種別ごとに属性を抽出"]
    structure --> extracted["DOC_CLASSIFIED<br/>DOC_EXTRACT / DOC_EXTRACT_GAP"]
    extracted --> candidates["候補値を組み立てるビューへ"]
```

**文字起こしと構造化は別経路です。** `DOC_PARSE` のテキストを `AI_EXTRACT` に渡す直列パイプラインではありません。
両方とも原本 PDF または Excel の HTML 変換物を読みます。文書種別判定にも `AI_EXTRACT` を使用し、`AI_CLASSIFY` は使用していません。

- PDF/Excel は 1 ファイルずつ、最大 20 MB。拡張子とファイルシグネチャを検査します。
- Excel の HTML 変換はアップロード後に実行します。変換に失敗しても、登録済みの原本は保持します。
- 文字起こしは保存済み結果があれば再利用します。構造化の再実行は `RESTRUCTURE_UPLOAD` の別操作で、前回結果の破棄と既存確認への影響について同意が必要です。
- 各処理の成功は、値の正しさや正式な確認完了を意味しません。次のレビュー工程が必要です。

### 初期サンプルは別の入り口

`scripts/setup.sh` はサンプル PDF を `RAW` に PUT し、`setup/03-sample-data.sql` で
架空の抽出済みデータ・商品・様式・座標定義などを投入します。**サンプル投入時に AI を実行して抽出するわけではありません。**
初期データも追加アップロードも、後段の候補・レビュー・出力の仕組みを使います。
アプリの追加アップロード先は `UPLOADS` で、既存原本を置く `RAW` には書き込みません。

## 3. 抽出候補から、人が確認した値へ

以下は主なデータ依存と確認操作を示します。矢印の先が自動的に「確定」することを意味しません。

```mermaid
flowchart TB
    docs["RAW / UPLOADS の DIRECTORY<br/>DOC_REGISTRY / DOC_VERSION / DOC_CLASSIFIED"] --> docview["DOCUMENT_ALL_V<br/>文書種別・原本の現在版を照合"]
    extract["DOC_EXTRACT / DOC_EXTRACT_GAP<br/>抽出された JSON"] --> candidate["CANDIDATE_V<br/>属性ごとの候補値・根拠・版"]
    docview --> candidate
    maps["ATTR_SOURCE_MAP<br/>抽出キー → 業務属性の対応"] --> candidate
    supply["PRODUCT_SUPPLY<br/>仕入先などの業務データ"] --> candidate
    candidate --> evidence["EVIDENCE_V / MASTER_REVIEW_V<br/>候補比較・根拠変更の検出"]
    evidence --> masterreview["人が原本と照合<br/>DECIDE_MASTER / CONFIRM_MASTER_BATCH"]
    masterreview --> master["MASTER_DECISION<br/>確定値・根拠・版"]
    master --> formreview["FORM_REVIEW_V<br/>様式の欄とマスター値の対応を確認"]
    templates["FORM_TEMPLATE / FORM_ATTR_MAP<br/>FORM_FIELD_V の欄定義"] --> formreview
    formreview --> formconfirm["人が欄ごとに確認<br/>DECIDE_FORM / CONFIRM_FORM_BATCH"]
    formconfirm --> formdecision["FORM_DECISION<br/>欄ごとの確認結果"]
    masterreview --> history["DECISION_HISTORY<br/>操作履歴"]
    formconfirm --> history
    formdecision --> prepare["出力準備の検証へ"]
```

- 文書由来の候補は入力原本 (`doc_role='input'`) で、取り込み時の MD5・更新日時と現在のステージ情報が一致するものを使います。出力用の様式を、そのまま入力原本の候補にはしません。
- `CANDIDATE_V` は `DOCUMENT_ALL_V` を参照するため、試験用アップロードも含み得ます。一方、`DOCUMENT_V` は `upload_purpose='production'` に限定します。試験用アップロードが全レビュー経路から完全隔離される構成とは説明できません。
- AI の抽出結果は候補です。マスターの確認と様式の欄の確認は、別々の操作・別々の記録です。
- 根拠の集合、マスターの版、様式の欄定義、原本の版が変わると、ビューが署名・版の不一致から `changed`（要再確認）を判定します。定期ジョブが確認済みレコードを一括削除する方式ではありません。

## 4. 帳票定義と出力の流れ

値の確認とは別に、帳票の座標 JSON を用意します。任意の様式ファイルをアップロードするだけで、この定義が自動作成される機能ではありません。

```mermaid
flowchart TB
    layout["FORM_LAYOUT.definition<br/>罫線・見出し・差込欄の座標 JSON"] --> blank["GET /api/layout<br/>空様式 PDF を生成"]
    blank --> review["人が実物と照合<br/>REVIEW_LAYOUT"]
    review --> reviewed["FORM_LAYOUT を reviewed_draft に更新<br/>FORM_LAYOUT_REVIEW に照合履歴"]
    reviewed --> draft["PREPARE_LAYOUT_EXPORT<br/>下書き・テスト出力の準備"]
    reviewed --> adopt["人が適用範囲・理由を確認<br/>ADOPT_LAYOUT / FORM_LAYOUT_APPROVAL"]
    adopt --> submission["PREPARE_SUBMISSION_EXPORT<br/>採用・欄の確認・根拠の鮮度などを検証"]
    values["FORM_REVIEW_V<br/>欄の値と確認状態"] --> draft
    values --> submission
    rules["FORM_FIELD_RULE / SUBMISSION_BLOCKER_V<br/>空欄・手押印の規則、提出できない理由"] --> submission
    draft --> snapshots["EXPORT_HISTORY<br/>値・レイアウトのスナップショット"]
    submission --> snapshots
    snapshots --> draftapi["GET /api/export<br/>下書き・テスト用"]
    snapshots --> submitapi["GET /api/submission<br/>提出用・本人の prepared 記録のみ"]
    draftapi --> render["Next.js で PDF / DOCX を生成<br/>pdf-lib + 日本語フォント / OOXML + ZIP"]
    submitapi --> render
    render -->|"下書き・テスト用"| download["ブラウザへダウンロード応答"]
    render -->|"提出用"| record["RECORD_SUBMISSION_RENDER<br/>ハッシュ・サイズ・描画版・結果を記録"]
    record -->|"記録成功後"| download
```

提出用では、条件未達なら準備を拒否します。描画例外時は `failed` の記録を試み、成功時は `rendered` を記録してからファイルを返します。
PDF と Word の両方を作る場合は、それぞれ別の出力記録を用意します。

出力時に AI は呼びません。**生成するのは保存済みの値とレイアウトから再構成した文書**です。
PDF と Word の表示差、欄の収まり検証、準備後の変更に関する限界は [EXPORT.md](EXPORT.md) を参照してください。
生成ファイル本体はステージへ自動保存しません。DB に保存するのはスナップショットと履歴で、ファイル本体は HTTP 応答で渡します。

## 5. 実装を読む順序

| 確認したいこと | 主なファイル・識別子 |
|---|---|
| 構築と配置 | [scripts/setup.sh](scripts/setup.sh)、[DEPLOY.md](DEPLOY.md) |
| 接続・認証・DB 呼び出し | [lib/db.ts](lib/db.ts)、[lib/snowflake.ts](lib/snowflake.ts) |
| 原本の登録と Excel 変換呼び出し | [app/api/upload/route.ts](app/api/upload/route.ts) |
| 文字起こし・構造化の受付 | [app/api/parse/route.ts](app/api/parse/route.ts)、[app/api/structure/route.ts](app/api/structure/route.ts) |
| ステージ、テーブル、ビュー、プロシージャ | [setup/02-objects.sql](setup/02-objects.sql) の各識別子を検索。複数回定義されるオブジェクトは最後の定義を参照 |
| 画面へ渡すデータ | [app/api/data/route.ts](app/api/data/route.ts) |
| 人による確認・帳票採用・下書き準備 | [app/api/decision/[operation]/route.ts](app/api/decision/%5Boperation%5D/route.ts) |
| 下書きと提出用の描画 API | [app/api/export/route.ts](app/api/export/route.ts)、[app/api/submission/route.ts](app/api/submission/route.ts) |
| PDF / Word の生成 | [lib/form-layout.ts](lib/form-layout.ts)、[lib/form-layout-docx.ts](lib/form-layout-docx.ts)、[lib/exports-docx.ts](lib/exports-docx.ts) |

Mermaid 対応の Markdown ビューアーでは図として表示できます。図が表示されない場合も、各節の説明とノード名から処理を追える構成にしています。
