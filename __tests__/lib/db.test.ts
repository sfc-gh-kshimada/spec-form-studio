import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { call, query, requireIdentity } from '@/lib/db';
import { getServiceToken, querySnowflake, querySnowflakeLongRunning } from '@/lib/snowflake';
vi.mock('@/lib/snowflake', () => ({ getServiceToken: vi.fn(), querySnowflake: vi.fn(), querySnowflakeLongRunning: vi.fn() }));
const context = vi.hoisted(() => ({ token: null as string | null }));
vi.mock('next/headers', () => ({ headers: async () => ({ get: () => context.token }) }));
describe('Caller identity', () => {
  beforeEach(() => { vi.clearAllMocks(); context.token = null; vi.stubEnv('NODE_ENV', 'production'); vi.mocked(getServiceToken).mockReturnValue('service-test'); });
  afterEach(() => vi.unstubAllEnvs());
  it('fails closed without caller token', async () => { await expect(query('SELECT 1')).rejects.toThrow('ログイン'); expect(querySnowflake).not.toHaveBeenCalled(); });
  it('does not downgrade hosted development to owner', async () => { vi.stubEnv('NODE_ENV', 'development'); context.token = 'caller-test'; await expect(requireIdentity()).rejects.toThrow('ログイン'); });
  it('uses caller rights and converts timestamps', async () => {
    context.token = 'caller-test';
    vi.mocked(querySnowflake).mockResolvedValue([{ WHEN: new Date('2026-09-16T00:00:00Z'), VALUE: null }]);
    expect(await query('SELECT ?', ['value'])).toEqual([{ when: '2026-09-16T00:00:00.000Z', value: null }]);
    expect(querySnowflake).toHaveBeenCalledWith('SELECT ?', { binds: ['value'], callersRights: true, warehouse: 'COMPUTE_WH' });
  });
  it('rejects unspecified local connection', async () => { vi.mocked(getServiceToken).mockReturnValue(''); vi.stubEnv('SFS_LOCAL_DEV', '1'); vi.stubEnv('SNOWFLAKE_CONNECTION_NAME', 'other_account'); await expect(requireIdentity()).rejects.toThrow('接続'); });
  it('accepts listed local connections and nothing else', async () => {
    vi.mocked(getServiceToken).mockReturnValue('');
    vi.stubEnv('SFS_LOCAL_DEV', '1');
    vi.stubEnv('SFS_LOCAL_CONNECTIONS', 'dev_account, qa_account_2');
    for (const name of ['dev_account', 'qa_account_2']) {
      vi.stubEnv('SNOWFLAKE_CONNECTION_NAME', name);
      await expect(requireIdentity()).resolves.toBeUndefined();
    }
    // A prefix of an allowed name must not pass: the check is membership, not
    // a substring match.
    vi.stubEnv('SNOWFLAKE_CONNECTION_NAME', 'qa_account');
    await expect(requireIdentity()).rejects.toThrow('接続');
  });
  it('allows no local connection when the list is unset', async () => {
    vi.mocked(getServiceToken).mockReturnValue('');
    vi.stubEnv('SFS_LOCAL_DEV', '1');
    vi.stubEnv('SNOWFLAKE_CONNECTION_NAME', '');
    await expect(requireIdentity()).rejects.toThrow('接続');
  });
  it('still requires the local flag even on an allowed connection', async () => {
    vi.mocked(getServiceToken).mockReturnValue('');
    vi.stubEnv('SFS_LOCAL_CONNECTIONS', 'dev_account');
    vi.stubEnv('SNOWFLAKE_CONNECTION_NAME', 'dev_account');
    vi.stubEnv('SFS_LOCAL_DEV', '');
    await expect(requireIdentity()).rejects.toThrow('接続');
  });
  it('preserves the committed receipt without another database read', async () => {
    context.token = 'caller-test';
    const receipt = { committed: true, event_id: 'qa-event', revision: 12, value: null, evidence_signature: 'qa-signature' };
    vi.mocked(querySnowflakeLongRunning).mockResolvedValue([{ DECIDE_MASTER: JSON.stringify(receipt) }]);
    expect(await call('DECIDE_MASTER', ['qa_product', 'qa_attr', 11, 'qa-signature', 'reopen', null, null, 'QA'])).toEqual(receipt);
    expect(querySnowflakeLongRunning).toHaveBeenCalledTimes(1);
    expect(querySnowflake).not.toHaveBeenCalled();
  });
  it('submits a long-running write once without retry on uncertain outcome', async () => {
    context.token = 'caller-test';
    vi.mocked(querySnowflakeLongRunning).mockRejectedValue(new Error('Connection lost'));
    await expect(call('PREPARE_EXPORT', ['qa_product', 'qa_form'])).rejects.toThrow('Connection lost');
    expect(querySnowflakeLongRunning).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('PREPARE_EXPORT(?,?)'),
      { binds: ['qa_product', 'qa_form'], callersRights: true, warehouse: 'COMPUTE_WH', maxWaitMs: 240000, pollIntervalMs: 200, maxPollIntervalMs: 1000 });
    expect(querySnowflake).not.toHaveBeenCalled();
  });
});

// The originals stage defaults to the app schema, where setup/02 creates it, so a
// deployment is one portable schema. SFS_ORIGINALS_SCHEMA points it elsewhere.
describe('Originals stage', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());
  const load = () => import('@/lib/db');

  it('defaults to the app schema of the default database', async () => {
    const { stage, uploadStage, prefix } = await load();
    expect(stage).toBe('@SPEC_FORM_STUDIO.APP.RAW');
    expect(uploadStage).toBe('@SPEC_FORM_STUDIO.APP.UPLOADS');
    expect(prefix).toBe('SPEC_FORM_STUDIO.APP');
  });

  it('follows the database and schema pinned in the manifest', async () => {
    vi.stubEnv('SFS_DATABASE', 'OTHER_DB');
    vi.stubEnv('SFS_SCHEMA', 'REVIEW_2026');
    const { stage, uploadStage } = await load();
    expect(stage).toBe('@OTHER_DB.REVIEW_2026.RAW');
    expect(uploadStage).toBe('@OTHER_DB.REVIEW_2026.UPLOADS');
  });

  it('rejects a schema that is not a bare identifier', async () => {
    vi.stubEnv('SFS_SCHEMA', 'APP; DROP');
    await expect(load()).rejects.toThrow('Invalid SFS schema');
  });

  it('points at another schema when one is pinned', async () => {
    vi.stubEnv('SFS_ORIGINALS_SCHEMA', 'DOCS');
    const { stage, uploadStage } = await load();
    expect(stage).toBe('@SPEC_FORM_STUDIO.DOCS.RAW');
    expect(stage).not.toBe(uploadStage);
  });

  it('rejects an originals schema that is not a bare identifier', async () => {
    vi.stubEnv('SFS_ORIGINALS_SCHEMA', 'DOCS.RAW; DROP');
    await expect(load()).rejects.toThrow('Invalid SFS originals schema');
  });

  it('routes raw and upload paths to their own stage', async () => {
    vi.stubEnv('SFS_ORIGINALS_SCHEMA', 'APP');
    const { stageFor, stage, uploadStage } = await load();
    expect(stageFor('raw')).toBe(stage);
    expect(stageFor('upload')).toBe(uploadStage);
  });
});