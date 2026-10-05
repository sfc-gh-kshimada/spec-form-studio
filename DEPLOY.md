# デプロイ手順

Spec Form Studio を Snowflake アカウントに構築し、Application Service として公開するまでの手順です。
所要時間はおおよそ 15〜25 分（うちリモートビルドが 5〜10 分）です。

## 1. 前提

| 項目 | 内容 |
|---|---|
| Snowflake アカウント | Snowflake App Runtime（Application Service）が利用できること |
| 実行ユーザー | `ACCOUNTADMIN` を使えること（ロール・権限・ウェアハウスを作成するため） |
| Snowflake CLI | 3.26.0 以上（`app.yml` の `version: 2` に対応した版）。`snow --version` で確認 |
| ローカル環境 | bash、python3、sed。リポジトリを clone できること |
| Cortex AI | 原本アップロード時の構造化で `AI_PARSE_DOCUMENT` / `AI_EXTRACT` を使います。リージョンによってはクロスリージョン推論の有効化（`ALTER ACCOUNT SET CORTEX_ENABLED_CROSS_REGION = 'ANY_REGION'`）が必要です。サンプルデータだけで試す場合は不要です |

リモートビルドは `npm ci` で registry.npmjs.org に接続します。既定では許可されていますが、
管理者が `ALLOW_NPM_PACKAGE_DOWNLOAD = FALSE` にしているアカウントでは外部アクセス統合が必要です（4 を参照）。

## 2. 接続の準備

```bash
git clone https://github.com/sfc-gh-kshimada/spec-form-studio.git
cd spec-form-studio
snow connection add            # 対話形式で接続を作成（例: 接続名 my_account）
snow connection test -c my_account
```

### 接続先はどこで設定するか

**接続するアカウント・ユーザー**と、**そのアカウント内で参照する DB・スキーマ**は別の設定です。

| 実行場所 | アカウント・認証の設定 | DB・スキーマ・ウェアハウスの設定 |
|---|---|---|
| ローカル (`next dev`) | `~/.snowflake/connections.toml` の接続を `SNOWFLAKE_CONNECTION_NAME` で選ぶ | `SFS_DATABASE` / `SFS_SCHEMA` / `SFS_WAREHOUSE` |
| 構築・デプロイ時 | `./scripts/setup.sh` の第 1 引数（CLI の接続名） | 第 2〜4 引数。SQL と生成する `app.yml` の両方に反映 |
| Snowflake 上で実行 | デプロイ先の実行環境が提供するサービス用トークンと、ログイン利用者のトークン | 生成された `app.yml` の `environment_variables` 内の `SFS_*` |

#### ローカルから接続する場合

`snow connection add` で自分の接続を作成し、接続設定の `account`・`user`・`role` と
組織で許可された認証方式を設定します。接続ファイルや秘密鍵、トークンはリポジトリに入れないでください。
CLI と Node.js SDK の対応する認証方式には差があり、CLI の接続テスト成功だけではアプリ側の接続成功は保証されません。

```bash
# リポジトリのルートで実行。my_account は自分で作った接続名に置き換える。
SFS_LOCAL_DEV=1 \
SFS_LOCAL_CONNECTIONS=my_account \
SNOWFLAKE_CONNECTION_NAME=my_account \
SFS_DATABASE=SPEC_FORM_STUDIO \
SFS_SCHEMA=APP \
SFS_WAREHOUSE=COMPUTE_WH \
npm run dev -- --hostname 127.0.0.1 --port 3100
```

- `SFS_LOCAL_DEV=1` と許可リストへの登録がない場合、API は接続を拒否します。
- DB とスキーマは英大文字で指定します。`SFS_DATABASE` を変えても接続先アカウントは変わりません。
- `SFS_WAREHOUSE` はアプリのクエリ実行時に明示されます。TOML の既定 warehouse だけを変えても、この値が優先されます。
- 原本 `RAW` ステージだけ別スキーマの場合は `SFS_ORIGINALS_SCHEMA` も指定できます。既定は `SFS_SCHEMA` と同じです。
- ローカルではブラウザ利用者ごとの caller's rights ではなく、ローカル接続のユーザー・ロールで実行されます。保存は実際の DB を更新するため、検証専用 DB と必要最小限のロールを使います。
- 認証設定と接続プールはプロセス内でキャッシュされます。接続設定を変更したら開発サーバーを再起動してください。

実装は [lib/db.ts](lib/db.ts) と [lib/snowflake.ts](lib/snowflake.ts) です。
`SNOWFLAKE_HOME` があれば、そのディレクトリを `~/.snowflake` の代わりに参照します。
`connections.toml` に接続定義がなければ `config.toml` の `[connections.*]` を参照します。
ヘルパーには既定接続へのフォールバックもありますが、このアプリの API は
`SNOWFLAKE_CONNECTION_NAME` が許可リストに含まれることを要求するため、接続名を明示してください。

**設定の競合に注意:** サービス用トークンがある場合はそれが優先され、ローカルでは
`SNOWFLAKE_USER` と `SNOWFLAKE_PASSWORD` が両方存在すると TOML より優先されます。
また、`SNOWFLAKE_ACCOUNT`・`SNOWFLAKE_HOST`・`SNOWFLAKE_ACCOUNT_URL`・`SNOWFLAKE_ROLE`
などの環境変数が TOML の設定に上書きされる経路があります。
別アプリから引き継いだ `SNOWFLAKE_*` の接続設定が残っていないことを確認してください。
`SFS_LOCAL_CONNECTIONS` は接続名の許可リストであり、この上書きを防ぐ機能ではありません。
秘密情報をターミナル出力やドキュメントに貼り付けて確認しないでください。

#### Snowflake 上で動かす場合

`./scripts/setup.sh my_account SPEC_FORM_STUDIO APP COMPUTE_WH` と指定すると、
`my_account` のアカウント内に作成し、同じ DB・スキーマを参照する `app.yml` を生成します。
第 1 引数の接続名はデプロイ用であり、公開後のアプリにローカル TOML をコピーするわけではありません。

実行時は `/snowflake/session/token` と `sf-context-current-user-token` を使い、
アプリの DB ラッパーが caller's rights を要求します。サービス用トークンがあるのに
production モードでない、または利用者トークンがない場合、このアプリの API は拒否します。
デプロイ時の所有ロールと、アクセスする利用者のロールは別です。

`app.yml` は環境別の生成ファイルとして Git 管理対象外です。
設定を変えて再デプロイする場合、manifest の配置先だけでなく `environment_variables` の
`SFS_DATABASE` / `SFS_SCHEMA` / `SFS_WAREHOUSE` も一致させてください。
ローカル確認だけであれば、セットアップや再デプロイは不要です。

## 3. 構築とデプロイ

```bash
./scripts/setup.sh my_account
```

既定では次の名前で作成します。引数と環境変数で変更できます。

| 対象 | 既定値 | 変更方法 |
|---|---|---|
| データベース | `SPEC_FORM_STUDIO` | 第 2 引数 |
| スキーマ | `APP` | 第 3 引数 |
| ウェアハウス | `COMPUTE_WH`（無ければ XSMALL で作成） | 第 4 引数 |
| 公開・所有ロール | `SFS_PUBLISHER` | `SFS_PUBLISHER_ROLE` |
| 利用ロール | `SFS_REVIEWER` | `SFS_REVIEWER_ROLE` |
| アプリ名 | `SPEC_FORM_STUDIO` | `SFS_APP_NAME` |
| サンプルデータ | 投入する | `SFS_SEED_SAMPLE=no` で投入しない |
| Snowflake CLI | `snow` | `SNOW="..."`（例: `SNOW="uvx --from snowflake-cli snow"`） |

例: 名前を変えて、SQL だけ先に適用する場合

```bash
SFS_SKIP_DEPLOY=1 SFS_PUBLISHER_ROLE=SPEC_OWNER SFS_REVIEWER_ROLE=SPEC_USER \
  ./scripts/setup.sh my_account SPEC_DB REVIEW MY_WH
```

スクリプトは次を順に行います。サンプル投入は `NOT EXISTS` 等で重複を抑えますが、
ビュー・プロシージャは再作成し、権限や所有権も設定し直します。既存環境の更新時はバックアップと差分確認を行ってください。

1. `setup/01-account.sql` — データベース・スキーマ・ウェアハウス・2 つのロールと権限。実行ユーザーに両ロールを付与
2. `setup/02-objects.sql` — ステージ `RAW` / `UPLOADS`、テーブル、ビュー、プロシージャ
3. サンプル原本 PDF を `@RAW/sample_emulsifier/` に PUT し、`setup/03-sample-data.sql` を適用
4. `setup/04-object-access.sql` — オブジェクトの所有権を公開ロールへ、利用ロールへ参照・実行権限
5. `app.yml` を生成し、公開ロールで `snow app deploy`
6. `ALTER APPLICATION SERVICE ... RESUME` と、利用ロールへの `USAGE, OPERATE, MONITOR` 付与

最後に表示される `DESCRIBE APPLICATION SERVICE` の結果に、アプリの URL が含まれます。
`snow app open -c my_account` でも開けます。

## 4. npm への外部アクセスが必要な場合

アカウントで npm のダウンロードが禁止されている場合だけ、外部アクセス統合の名前を渡します。
`setup/01-account.sql` がネットワークルールと統合を作成し、`app.yml` に `build_eai` を書き込みます。

```bash
SFS_BUILD_EAI=SFS_BUILD_EAI ./scripts/setup.sh my_account
```

トライアルアカウントでは外部アクセス統合を作成できません（既定のままで構いません）。

## 5. 利用者の追加

利用者には利用ロールを付与します。

```sql
GRANT ROLE SFS_REVIEWER TO USER some_user;
```

利用者は Snowsight にログインし、アプリの URL を開きます。アプリ内の操作はその利用者の
ロール権限で実行され、確定・出力の履歴には利用者名が記録されます。

## 6. サンプルで動作確認する

1. 左の一覧で「サンプル乳化剤 A-100」を選び、「原本確認」で PDF が表示されることを確認
2. 「マスター確定」で候補を確認し、値を確定する
3. 「様式レビュー＆出力」で「サンプル化粧品 原料調査票」を選び、①〜⑤の手順に沿って進める
   - ② 空様式を実物と照合: サンプルの配置は `pending` で入っているため、確認を記録すると下書き出力ができるようになります
   - ④ 下書き（テスト値）を出力 → ⑤ 提出前確認・提出用を出力

## 7. 自社データへの置き換え

サンプルを使わない場合は `SFS_SEED_SAMPLE=no` で構築し、次のテーブルに自社のモデルを投入します。

| テーブル | 内容 |
|---|---|
| `ATTR_DEF` | 管理する属性の定義（キー・表示名・区分・並び順） |
| `ATTR_SOURCE_MAP` | 抽出結果のキーと属性キーの対応 |
| `PRODUCT` / `PRODUCT_SUPPLY` | 製品と、仕入先・提出先 |
| `FORM_TEMPLATE` / `FORM_ATTR_MAP` | 取引先様式の項目と、属性との対応。案内文に `【必須】` を含む項目は必須扱い |
| `CUSTOMER_FORM_MAP` | 提出先と様式の対応 |
| `FORM_LAYOUT` | 様式の配置定義（`sample/sample-layout.json` が形式の例） |

`setup/03-sample-data.sql` の末尾にある `MASTER_DECISION` / `FORM_DECISION` の INSERT を、
投入後に同じように実行してください（確定対象の行を作ります）。
原本はアプリの「原本の追加」からアップロードすると構造化されて候補になります。

## 8. 更新

コードを更新したら、同じ接続で `snow app deploy` を再実行します（`app.yml` は 3 で生成済み）。
SQL を更新した場合は `./scripts/setup.sh` をもう一度実行します。

## 9. 費用と停止

Application Service はコンピュートプール上で常時稼働し、停止するまで費用が発生します。
`app.yml` で自動停止を設定していないのは、ブラウザからのアクセスでは自動再開されないためです。

```sql
ALTER APPLICATION SERVICE SPEC_FORM_STUDIO.APP.SPEC_FORM_STUDIO SUSPEND;  -- 一時停止
ALTER APPLICATION SERVICE SPEC_FORM_STUDIO.APP.SPEC_FORM_STUDIO RESUME;   -- 再開
```

## 10. 削除

```sql
USE ROLE ACCOUNTADMIN;
DROP APPLICATION SERVICE IF EXISTS SPEC_FORM_STUDIO.APP.SPEC_FORM_STUDIO;
DROP DATABASE IF EXISTS SPEC_FORM_STUDIO;
DROP ROLE IF EXISTS SFS_REVIEWER;
DROP ROLE IF EXISTS SFS_PUBLISHER;
-- 4 で作成した場合のみ
DROP INTEGRATION IF EXISTS SFS_BUILD_EAI;
```

## トラブルシューティング

| 症状 | 確認すること |
|---|---|
| アプリを開くと権限エラー | 利用者に `SFS_REVIEWER` が付与されているか。`GRANT USAGE ON APPLICATION SERVICE` が実行されたか |
| デプロイのビルドで npm に接続できない | 4 の外部アクセス統合が必要か |
| サービスが止まっている | `DESCRIBE APPLICATION SERVICE` の状態を確認し `RESUME` |
| ログを見たい | `CALL SYSTEM$GET_APPLICATION_SERVICE_LOGS('SPEC_FORM_STUDIO.APP.SPEC_FORM_STUDIO');` または `snow app events` |
| 原本アップロードの構造化が失敗する | `AI_PARSE_DOCUMENT` / `AI_EXTRACT` がリージョンで使えるか（1 のクロスリージョン推論） |
