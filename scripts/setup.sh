#!/usr/bin/env bash
# Builds Spec Form Studio in a Snowflake account from setup/01..04 plus
# `snow app deploy`.
#
#   ./scripts/setup.sh <connection> [database] [schema] [warehouse]
#
# Defaults: database SPEC_FORM_STUDIO, schema APP, warehouse COMPUTE_WH.
# Role, EAI and app names come from the environment:
#   SFS_PUBLISHER_ROLE (SFS_PUBLISHER)   owns the objects and the app service
#   SFS_REVIEWER_ROLE  (SFS_REVIEWER)    uses the app
#   SFS_BUILD_EAI      (empty)           external access integration for npm;
#                                        leave empty unless your account blocks
#                                        npm downloads during remote builds
#   SFS_APP_NAME       (SPEC_FORM_STUDIO)
#   SFS_SEED_SAMPLE    (yes)             load the fictional sample (setup/03)
#   SFS_SKIP_DEPLOY    (empty)           set to 1 to stop after the SQL
#   SNOW               (snow)            Snowflake CLI command, 3.26.0 or later
#
# The connection must exist in ~/.snowflake/connections.toml and its user must
# be able to USE ROLE ACCOUNTADMIN: 01 and 04 create roles and grants.
#
# Re-running is safe: every statement is IF NOT EXISTS, OR REPLACE, or guarded
# by NOT EXISTS. It does not delete documents or confirmations.
set -euo pipefail

connection="${1:?usage: setup.sh <connection> [database] [schema] [warehouse]}"
database="${2:-SPEC_FORM_STUDIO}"
schema="${3:-APP}"
warehouse="${4:-COMPUTE_WH}"
publisher="${SFS_PUBLISHER_ROLE:-SFS_PUBLISHER}"
reviewer="${SFS_REVIEWER_ROLE:-SFS_REVIEWER}"
build_eai="${SFS_BUILD_EAI:-}"
app_name="${SFS_APP_NAME:-SPEC_FORM_STUDIO}"
seed="${SFS_SEED_SAMPLE:-yes}"
for name in "$database" "$schema" "$warehouse" "$publisher" "$reviewer" "$app_name" ${build_eai:+"$build_eai"}; do
  [[ "$name" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "invalid identifier: $name (use upper-case letters, digits and _)"; exit 2; }
done

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
read -r -a snow <<< "${SNOW:-snow}"

owner="$("${snow[@]}" sql -c "$connection" --format JSON -q 'SELECT CURRENT_USER() AS U' 2>"${work}/connect.err" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["U"])' 2>/dev/null)" \
  || { echo "cannot connect with '${connection}':"; cat "${work}/connect.err"; exit 1; }
echo "target : ${database}.${schema} on connection ${connection} as ${owner}"
echo "roles  : ${publisher} / ${reviewer}, build EAI ${build_eai:-<none>}, warehouse ${warehouse}"

substitute() {
  sed -e "s/__DB__/${database}/g" -e "s/__SCHEMA__/${schema}/g" \
      -e "s/__WAREHOUSE__/${warehouse}/g" -e "s/__PUBLISHER_ROLE__/${publisher}/g" \
      -e "s/__REVIEWER_ROLE__/${reviewer}/g" -e "s/__BUILD_EAI__/${build_eai}/g" \
      -e "s/__OWNER_USER__/${owner}/g" "$1" \
    | if [[ -z "$build_eai" ]]; then sed '/^-- >>> BUILD_EAI$/,/^-- <<< BUILD_EAI$/d'; else cat; fi
}
run_sql() {
  "${snow[@]}" sql -c "$connection" --role ACCOUNTADMIN --warehouse "$warehouse" \
    --database "$database" --format CSV "$@"
}
apply() {
  echo "--- applying $1"
  substitute "${root}/setup/$1" > "${work}/$1"
  run_sql -f "${work}/$1" > "${work}/$1.out" 2>&1 || { echo "FAILED: $1"; tail -30 "${work}/$1.out"; exit 1; }
}

apply 01-account.sql
apply 02-objects.sql
if [[ "$seed" == "yes" ]]; then
  echo "--- uploading sample/sample-spec_A-100.pdf"
  run_sql -q "PUT 'file://${root}/sample/sample-spec_A-100.pdf' '@${database}.${schema}.RAW/sample_emulsifier/' AUTO_COMPRESS=FALSE OVERWRITE=FALSE" > "${work}/put.out" 2>&1 \
    || { echo "FAILED: PUT"; cat "${work}/put.out"; exit 1; }
  apply 03-sample-data.sql
fi
apply 04-object-access.sql

# The manifest is generated so the deployed app and the SQL above always name the
# same database and schema. The app reads its data from these (lib/db.ts).
cat > "${root}/app.yml" <<YAML
version: 2

name: ${app_name}
database: ${database}
schema: ${schema}
query_warehouse: ${warehouse}
${build_eai:+build_eai: ${build_eai}}
label: "Spec Form Studio"
description: "原本確認・マスター確定・様式レビュー。"
icon: public/icon.svg
# No auto_suspend_secs on purpose: browser ingress does not count as activity,
# so a suspended service would not come back for a reviewer using the app.
# The service therefore runs until it is suspended or dropped, and costs accrue.
auto_resume: true

environment_variables:
  - name: NEXT_TELEMETRY_DISABLED
    value: "1"
  - name: SNOWFLAKE_SDK_QUIET
    value: "true"
  - name: SFS_DATABASE
    value: "${database}"
  - name: SFS_SCHEMA
    value: "${schema}"
  - name: SFS_WAREHOUSE
    value: "${warehouse}"

install:
  commands:
    - ["npm", "ci", "--include=dev", "--no-audit", "--no-fund"]
build:
  commands:
    - ["env", "NEXT_TELEMETRY_DISABLED=1", "npm", "run", "build"]
    - ["cp", "-r", ".next/static", ".next/standalone/.next/static"]
    - ["cp", "-r", "public", ".next/standalone/public"]
    - ["rm", "-rf", "node_modules"]
run:
  command: ["node", ".next/standalone/server.js"]

ignore:
  - node_modules
  - .env*
  - .next
  - .git
  - sample
  - setup
  - scripts
  - __tests__
  - "*.tsbuildinfo"
  - "*.log"
  - README.md
  - DEPLOY.md
  - AGENTS.md
  - LICENSE
  - .DS_Store
  - .node-version
  - vitest.config.ts
YAML

echo "--- wrote app.yml"
if [[ "${SFS_SKIP_DEPLOY:-}" == "1" ]]; then
  echo "SFS_SKIP_DEPLOY=1 — stopping after SQL. Deploy later with:"
  echo "  ${snow[*]} app deploy --connection ${connection} --role ${publisher} --warehouse ${warehouse}"
  exit 0
fi

start="$(date +%s)"
(cd "$root" && "${snow[@]}" app deploy --connection "$connection" --role "$publisher" --warehouse "$warehouse")
echo "deploy took $(( $(date +%s) - start ))s"

as_publisher() {
  "${snow[@]}" sql -c "$connection" --role "$publisher" --warehouse "$warehouse" --database "$database" --format CSV -q "$1"
}
as_publisher "ALTER APPLICATION SERVICE ${database}.${schema}.${app_name} RESUME"
# 04 cannot grant this: the application service does not exist until the deploy
# above creates it. Without USAGE a reviewer signs in and then gets no access to
# the app's URL. OPERATE and MONITOR let a reviewer resume a suspended service.
as_publisher "GRANT USAGE, OPERATE, MONITOR ON APPLICATION SERVICE ${database}.${schema}.${app_name} TO ROLE ${reviewer}"
as_publisher "DESCRIBE APPLICATION SERVICE ${database}.${schema}.${app_name}"
