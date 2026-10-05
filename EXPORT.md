# PDF・Word 出力の技術詳細

## 1. 設計の要点

PDF と Word は、Snowflake の `FORM_LAYOUT.definition` に保存した共通の座標付き JSON と、
出力時点の値のスナップショットから、Next.js のサーバー側で生成します。
元の PDF に文字を重ねる方式でも、元の Word の差し込み印刷でも、HTML のブラウザ印刷でもありません。
罫線・見出し・値を再構成する実装です。出力時に AI が文章やレイアウトを生成する処理はありません。

- Snowflake: レビュー状態、根拠・様式の版、レイアウトの照合・採用、出力スナップショット、履歴を管理
- Next.js: API の入力検証、認証、保存済み定義の整合性検証、PDF/DOCX のバイト列生成と HTTP 応答
- ブラウザ: 空様式の確認、確認操作、ダウンロード。PDF.js は表示用であり生成用ではない

## 2. レイアウト定義

形式は [lib/layout-model.ts](lib/layout-model.ts)、実例は
[sample/sample-layout.json](sample/sample-layout.json) を参照してください。

| 要素 | 内容 |
|---|---|
| `id` / `form` / `version` | 帳票 ID、対象様式、帳票版 |
| `products` / `applicability` | 適用する商品 ID と適用範囲の説明 |
| `pages` | ページ寸法、固定見出し `labels`、罫線矩形 `rules` |
| `fields` | 差込キー、欄名、ページ番号、座標・寸法・文字サイズ、欄定義の署名 |
| `unsupported` | 手押印など自動差し込みに対応しない内容の説明 |
| `renderer` / `source_sha256` | 描画方式の版、出典を識別するハッシュ |

座標は左上基準のポイント（1 pt = 1/72 inch）、ページ番号は 0 始まりです。
`fields[].key` で値を対応付けます。`signature` は様式 ID・欄キー・表示名・案内文・属性対応を
配列にした JSON の SHA-256 で、Snowflake の `FORM_FIELD_V.template_signature` と比較します。

`mapping_hash` は `layoutHash()` がオブジェクトのキーを再帰的にソートした JSON の SHA-256 です。
配列の順序は保持します。`validateLayout()` は Zod のスキーマ、ハッシュ、対象商品・様式、
欄キーの重複、ページ範囲、欄のページ存在を確認します。
`source_sha256` は定義に含まれる識別情報であり、描画時に元ファイルを取得して再ハッシュする処理ではありません。
ハッシュは整合性の照合用であり、電子署名や改ざん不能な監査証跡を提供するものではありません。

## 3. 空様式の確認と採用

1. `GET /api/layout?product=...&form=...` で対象レイアウトの一覧を取得します。
2. ID と版を指定した `GET /api/layout` は定義を検証し、値なしで `renderLayout()` を呼びます。
   PDF を `Content-Disposition: inline` で返し、画面で実物と照合できます。
3. `POST /api/decision/layout_review` が `REVIEW_LAYOUT` を呼びます。
   同意・照合メモ・定義ハッシュを検証し、`FORM_LAYOUT_REVIEW` に記録します。
   `review_status` は `pending` から `reviewed_draft` に変わり、下書き出力が可能になります。
4. 提出用に使う場合は、別途 `POST /api/decision/layout_adopt` から `ADOPT_LAYOUT` を呼び、
   適用範囲・採用理由・同意を `FORM_LAYOUT_APPROVAL` に記録します。
   採用は同じ定義ハッシュに紐づくため、定義を変えた版へ自動で引き継がれません。

見た目の照合と提出用の採用は別の操作です。採用しても、欄の確認や根拠の鮮度などの提出条件は別途必要です。

## 4. 下書き・テスト出力の API フロー

1. 画面から `POST /api/decision/export` に商品・様式・出力区分・レイアウト ID/版/ハッシュを送ります。
2. レイアウトありの場合、`PREPARE_LAYOUT_EXPORT` が照合済みの版、対象商品、欄定義の一致を確認します。
3. `FORM_REVIEW_V` から値と確認状態を読み、`EXPORT_HISTORY` に `rows_snapshot` と
   `layout_snapshot` を保存して `export_id` を返します。
4. ブラウザから `GET /api/export?id=...&product=...&form=...&format=pdf` または `format=docx` を呼びます。
5. API は `created_by=CURRENT_USER()` の記録だけを取得し、保存済みレイアウトを再検証して描画します。
6. バイト列を PDF/DOCX の MIME type と `Content-Disposition: attachment` で返します。

`review_only` は確認済み値だけ、`test_only` は確認済み値とテスト確定値を使います。
テスト省略は「テスト用・値未提供」と表示し、それ以外の未確認値は空欄です。
いずれにも正式提出不可の表示が入り、ファイル名は `DRAFT_...` または `TEST_ONLY_...` になります。

レイアウトなしの場合は `PREPARE_EXPORT` / `PREPARE_TEST_EXPORT` を使う転記用レビュー票です。
この経路の Word は `exportDocx()` による項目一覧表で、座標付きの指定様式とは異なります。
`/api/export` は HTML、CSV、未対応欄の確認 (`format=issues`) にも対応します。

## 5. 提出用出力の API フロー

1. `POST /api/submission` が `PREPARE_SUBMISSION_EXPORT` を実行します。
2. 定義ハッシュに対応する採用記録と `SUBMISSION_BLOCKER_V` を確認します。
   未照合・未採用、欄定義の不一致、根拠変更、テスト値、未確認欄、必要な空欄規則の不足、
   未対応の必須欄などを検査します。問題があると HTTP 409 と欄ごとの理由を返します。
3. 確認済みの値だけをスナップショット化し、採用 ID とともに
   `EXPORT_HISTORY` に `export_kind='submission'`, `render_state='prepared'` で保存します。
4. `GET /api/submission?id=...&product=...&form=...&format=pdf` または `format=docx` が
   本人の prepared 記録を読み、PDF または Word を生成します。
5. 実バイト列の SHA-256 とバイト数を計算し、`RECORD_SUBMISSION_RENDER` で `rendered` に更新します。
   更新できなければファイルを返しません。描画例外では `failed` の記録を試みます。
6. `SUBMISSION_...pdf` / `SUBMISSION_...docx` として返し、`X-SFS-Output-Sha256` ヘッダーにもハッシュを含めます。

成功時の描画版は PDF がレイアウトの `renderer`、Word が `docx-ooxml-1` です。
PDF はフォントの SHA-256 も記録します。Word はフォントを埋め込まないため、成功記録のフォントハッシュは NULL です。

1 記録は 1 成果物です。同じ ID の再出力は拒否し、PDF と Word の両方を作る場合は記録を別々に準備します。
`rendered` はサーバー側の生成と記録の完了を意味し、ブラウザへの保存完了や取引先への提出を証明しません。
応答中の通信失敗で保存できなかった場合も、提出前確認から新しく作り直します。

## 6. PDF の描画処理

実装: [lib/form-layout.ts](lib/form-layout.ts) の `renderLayout()`。

1. `layoutIssues()` でスナップショットと欄定義を照合します。
2. `pdf-lib` の `PDFDocument.create()` で新規文書を作り、`@pdf-lib/fontkit` を登録します。
3. `assets/NotoSansJP-Regular.ttf` の SHA-256 を定数と照合し、`subset: false` で全体を埋め込みます。
   この構成で発生した日本語グリフ欠落への対策で、PDF サイズが数 MB 増えるトレードオフがあります。
4. ページごとに罫線を `drawRectangle()`、固定見出しと値を `drawText()` で描きます。
   左上基準の Y 座標を PDF の左下基準へ変換します。
5. 文字を 1 文字ずつ追加し、`widthOfTextAtSize()` で欄幅を超えると折り返します。
   行高は文字サイズの 1.4 倍です。未対応文字、1 文字でも幅に収まらない場合、
   折り返し後の総行高が欄の高さを超える場合は HTTP 422 で止めます。自動縮小や切り捨てはしません。
6. 注意書き、帳票 ID/版/ページ番号、出力記録 ID を描き、`pdf.save()` でバイト列にします。

押印・署名欄は `signatureFieldPattern` で除外します。空欄の枠はレイアウトの罫線として描きます。
PDF メタデータの作成・更新日時は現在の実装では固定値です。実際の出力日時には DB の履歴を使ってください。

## 7. Word（DOCX）の生成処理

実装: [lib/form-layout-docx.ts](lib/form-layout-docx.ts) の `renderLayoutDocx()` と
[lib/exports-docx.ts](lib/exports-docx.ts) の `zip()` / `escapeXml()`。

- `layoutIssues()` は PDF と共通です。元の Word テンプレートや Office/LibreOffice の変換サーバーは使いません。
- WordprocessingML / DrawingML の XML を組み立てます。見出しと値はページ基準の
  `wp:anchor` テキストボックス、罫線は塗りなしの矩形図形です。各文字は Word 上で編集できます。
- 位置とサイズを 1 pt = 12,700 EMU、ページ寸法を 1 pt = 20 twips、文字サイズを半ポイント単位に変換します。
- `escapeXml()` で特殊文字をエスケープし、XML 1.0 で使えない制御文字を除去します。
- `[Content_Types].xml`、`_rels/.rels`、`word/document.xml` の 3 パートを作ります。
- Node.js 標準の `node:zlib` による Deflate と自前の CRC32/ZIP ヘッダー作成処理で DOCX にまとめます。
  DOCX 専用の外部生成ライブラリは使っていません。

### PDF と同一表示にはならない点

共通なのは様式本体の座標と値です。**PDF と Word の見た目の完全一致は保証していません。**

- PDF は埋め込み Noto Sans JP、Word は `Yu Gothic` 指定でフォントを埋め込みません。
  閲覧端末のフォントや Word の版、互換ソフトによって文字幅・折り返しが変わります。
- Word の描画経路には PDF 同等の文字幅・行高による拒否処理がありません。
  `overflow: reject` が定義にあっても、Word 側の収まり検証は実装されていません。生成後に実物で確認してください。
- 注意書きと版/記録 ID の配置は異なります。PDF は上部に注意書き、下部に版/記録 ID、Word はその逆です。
- Word のページ設定は先頭ページの寸法を全体に適用します。ページごとに異なる用紙サイズを持つ様式は未対応です。
- Word を手編集すると出力時のファイルハッシュとは一致しなくなります。編集後の内容の正しさは別途確認が必要です。

## 8. 保存範囲と限界

この出力経路では、DB に値・レイアウトのスナップショットと履歴を保存しますが、
生成した PDF/DOCX 本体をステージへ自動保存しません。バイト列はアプリのメモリで作り、HTTP 応答で渡します。
ローカル実行なら生成はローカルの Node.js、デプロイ済みなら Snowflake 上のアプリ内で行われます。

描画時は保存済みスナップショットを読みます。準備後に原本やマスターが変更されても、
描画 API が最新の全業務条件を再チェックするわけではありません。
準備からダウンロードまでの間に変更があった場合は、新しい出力記録を作ってください。

`layoutIssues()` には「例外で停止する不整合」と「配列で返す警告」の両方があります。
未対応欄や未確認値の警告があるだけで、下書きが一律に禁止されるわけではありません。
提出条件の業務チェックは Snowflake のビュー・プロシージャも含めた実装で行います。

任意の PDF/Word をアップロードするだけで座標付きレイアウトが自動作成される仕組みではありません。
新様式は JSON、欄定義、属性対応、適用商品、空欄・手押印の規則を用意し、照合・採用を行う必要があります。
サンプル定義の生成例は [scripts/build-sample.mjs](scripts/build-sample.mjs) にあります。

## 9. 検証

```bash
npm run typecheck
npm test
```

`__tests__/lib/form-layout.test.ts` / `form-layout-docx.test.ts` は描画、
`__tests__/api/layout.test.ts` / `submission.test.ts` は API の検証を含みます。
自動テストやハッシュの一致だけでは実物の帳票の正しさは証明できません。
公開先の環境でも PDF の日本語表示・改ページ・欄の収まりと、実際の Word での配置・編集を確認してください。
