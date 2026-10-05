# Spec Form Studio

原料の規格書・SDS などの原本から、取引先ごとの調査票（様式）を作るまでを
人の確認つきで進めるための Snowflake アプリです。Next.js で書かれ、
[Snowflake App Runtime](https://docs.snowflake.com/) の Application Service として
Snowflake アカウントの中で動きます。データはすべて同じアカウントのテーブルと
ステージに置かれ、操作は利用者自身のロールの権限（caller's rights）で実行されます。

## できること

| 画面 | 内容 |
|---|---|
| 原本確認 | ステージ上の PDF をアプリ内で表示し、抽出された値と並べて確認する |
| マスター確定 | 製品ごとの属性（商品名・INCI名・保管条件など）について、原本から得た候補を比べて値を確定する。確定は版管理され、原本が差し替わると「要再確認」に戻る |
| 様式レビュー＆出力 | 確定したマスター値を取引先様式の項目に対応づけ、空様式の配置を実物と照合したうえで、下書き（テスト値）と提出用の PDF / Word を出力する |
| 原本の追加 | 打ち合わせで受け取った PDF をその場でアップロードし、`AI_PARSE_DOCUMENT` / `AI_EXTRACT` で構造化して候補に加える |

確定していない値は提出用の出力に入りません。押印・署名欄は自動入力しません。

## 構成

```
app/, components/, lib/   Next.js アプリ本体
setup/01-account.sql      ロール・ウェアハウス・権限（ACCOUNTADMIN で実行）
setup/02-objects.sql      ステージ・テーブル・ビュー・プロシージャ
setup/03-sample-data.sql  架空のサンプルデータ（任意）
setup/04-object-access.sql オブジェクト所有権と利用ロールへの権限
scripts/setup.sh          上記を順に適用し、app.yml を生成して snow app deploy まで行う
scripts/build-sample.mjs  サンプル原本 PDF と 03 を生成する
sample/                   サンプル原本 PDF と様式レイアウト
```

## サンプルデータについて

`setup/03-sample-data.sql` と `sample/` に含まれる製品・企業・様式・値は
すべて架空です。実在の製品・企業・様式とは関係ありません。
1 製品（サンプル乳化剤 A-100）・1 原本・1 様式（サンプル化粧品 原料調査票）で、
原本確認から提出用 PDF の出力までを一通り試せます。

## デプロイ

[DEPLOY.md](DEPLOY.md) を参照してください。

## ローカル開発

```bash
npm ci
npm run typecheck
npm test
```

ローカルの `next dev` から Snowflake に接続する場合は、`~/.snowflake/connections.toml`
の接続名を明示的に許可します。許可していない接続では起動しても API が拒否します。

```bash
SFS_LOCAL_DEV=1 SFS_LOCAL_CONNECTIONS=my_connection SNOWFLAKE_CONNECTION_NAME=my_connection \
SFS_DATABASE=SPEC_FORM_STUDIO SFS_SCHEMA=APP SFS_WAREHOUSE=COMPUTE_WH \
npm run dev -- --hostname 127.0.0.1 --port 3100
```

| 環境変数 | 既定値 | 内容 |
|---|---|---|
| `SFS_DATABASE` | `SPEC_FORM_STUDIO` | データベース |
| `SFS_SCHEMA` | `APP` | スキーマ |
| `SFS_WAREHOUSE` | `COMPUTE_WH` | クエリに使うウェアハウス |
| `SFS_ORIGINALS_SCHEMA` | `SFS_SCHEMA` と同じ | 原本ステージ `RAW` を置くスキーマ |
| `SFS_LOCAL_DEV` | 未設定 | `1` のときローカル API の利用を許可 |
| `SFS_LOCAL_CONNECTIONS` | 未設定 | 許可する接続名（カンマ区切り） |
| `SNOWFLAKE_CONNECTION_NAME` | 未設定 | 実際に使う TOML 内の接続名。上の許可リストにも指定する |

`http://127.0.0.1:3100` を開きます。ローカルでも保存操作は接続先の Snowflake に書き込みます。
検証専用の接続と DB を使い、ローカルサーバーは外部に公開しないでください。
接続名の許可リストはアカウント固定やユーザー認証の代わりではありません。

## 接続先と帳票生成の技術詳細

- [接続先の設定方法](DEPLOY.md#接続先はどこで設定するか): ローカル接続、デプロイ先、実行時の認証、設定の優先順位
- [PDF・Word 出力の技術詳細](EXPORT.md): API、Snowflake の検証とスナップショット、座標描画、OOXML、出力履歴、制限事項

## ライセンス

Apache License 2.0。同梱フォント Noto Sans JP は SIL Open Font License 1.1
（`assets/OFL.txt`）です。
