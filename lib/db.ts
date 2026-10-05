import { headers } from 'next/headers';
import { getServiceToken, querySnowflake, querySnowflakeLongRunning } from './snowflake';
import { AppError } from './validation';

export const schema = process.env.SFS_SCHEMA || 'APP';
if (!/^[A-Z][A-Z0-9_]{0,254}$/.test(schema)) throw new Error('Invalid SFS schema');
// The database is a deployment choice, not a constant. Both names are pinned in
// the manifest's environment_variables so a deploy can never drift from the SQL.
export const database = process.env.SFS_DATABASE || 'SPEC_FORM_STUDIO';
if (!/^[A-Z][A-Z0-9_]{0,254}$/.test(database)) throw new Error('Invalid SFS database');
export const prefix = `${database}.${schema}`;
// Where the originals live. setup/02 creates the RAW stage inside the app schema
// so the whole thing is one portable schema; point this elsewhere only if your
// originals already sit on a stage in another schema of the same database.
const originalsSchema = process.env.SFS_ORIGINALS_SCHEMA || schema;
if (!/^[A-Z][A-Z0-9_]{0,254}$/.test(originalsSchema)) throw new Error('Invalid SFS originals schema');
export const stage = `@${database}.${originalsSchema}.RAW`;
// Received-during-meeting PDFs go to a stage inside the app schema so the whole
// schema stays portable to another account. The original RAW stage is read-only
// for this app and is never written to.
export const uploadStage = `@${database}.${schema}.UPLOADS`;

export const stageFor = (kind: string) => (kind === 'upload' ? uploadStage : stage);

// Connections the local server may use. Deployed runs never reach this: they
// carry a service token and are checked against the caller token instead. The
// list is explicit (comma-separated SFS_LOCAL_CONNECTIONS) so a stray
// SNOWFLAKE_CONNECTION_NAME cannot point a local server at an unrelated account.
const localConnections = () => (process.env.SFS_LOCAL_CONNECTIONS ?? '').split(',').map(name => name.trim()).filter(Boolean);
const warehouse = process.env.SFS_WAREHOUSE || 'COMPUTE_WH';

export async function requireIdentity() {
  if (getServiceToken()) {
    if (process.env.NODE_ENV !== 'production' || !(await headers()).get('sf-context-current-user-token')) {
      throw new AppError(401, 'Snowflakeにログインしてアプリを開いてください。');
    }
  } else if (process.env.SFS_LOCAL_DEV !== '1'
    || !localConnections().includes(process.env.SNOWFLAKE_CONNECTION_NAME ?? '')) {
    throw new AppError(401, '許可されたSnowflake接続がありません。');
  }
}
export type Bind = string | number | boolean | null;
export async function query<T = Record<string, unknown>>(sql: string, binds: Bind[] = [], longRunning = false): Promise<T[]> {
  await requireIdentity();
  const options = { binds, callersRights: true, warehouse };
  const rows = longRunning ? await querySnowflakeLongRunning(sql, { ...options, maxWaitMs: 240000, pollIntervalMs: 200, maxPollIntervalMs: 1000 }) : await querySnowflake(sql, options);
  return rows.map(row => Object.fromEntries(Object.entries(row).map(([name, value]) =>
    [name.toLowerCase(), value instanceof Date ? value.toISOString() : value]))) as T[];
}
export async function call(procedure: string, binds: Bind[], keepError = false) {
  const arity: Record<string, number> = { DECIDE_MASTER: 8, DECIDE_FORM: 12, APPLY_TEST_BATCH: 4, CONFIRM_MASTER_BATCH: 4, CONFIRM_FORM_BATCH: 5, REVIEW_LAYOUT: 6, ADOPT_LAYOUT: 7, PREPARE_EXPORT: 2, PREPARE_TEST_EXPORT: 2, PREPARE_LAYOUT_EXPORT: 6,
    PREPARE_SUBMISSION_EXPORT: 5, RECORD_SUBMISSION_RENDER: 6,
    REGISTER_UPLOAD: 9, STRUCTURE_UPLOAD: 2, RESTRUCTURE_UPLOAD: 2, RENDER_UPLOAD: 1, PARSE_UPLOAD: 1 };
  if (arity[procedure] !== binds.length) throw new AppError(400, '操作が一致しません。');
  const result = await query(`CALL ${prefix}.${procedure}(${binds.map(() => '?').join(',')})`, binds, true);
  let payload = Object.values(result[0] ?? {})[0];
  if (typeof payload === 'string' && payload.trim().startsWith('{')) payload = JSON.parse(payload);
  if (typeof payload === 'string' && payload.startsWith('エラー')) throw new AppError(409, payload);
  // keepError is used by the submission path: its refusal carries the per-field
  // blocker list, which the caller needs to display rather than a single message.
  if (payload && typeof payload === 'object' && 'error' in payload && !keepError) throw new AppError(409, String(payload.error));
  return payload;
}