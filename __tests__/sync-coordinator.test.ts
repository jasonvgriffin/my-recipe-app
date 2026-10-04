import { setIdentity } from '@/storage/identity';
import { createCollection, type KeyValueStore, type StoredRecord } from '@/storage/kv';
import { withoutSyncNotify } from '@/storage/writes';
import { createSyncCoordinator, SYNC_TABLES, type RemoteAdapter, type SyncCollections } from '@/sync';

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

function collections(kv: KeyValueStore): SyncCollections {
  const col = (key: string) => createCollection<StoredRecord>(kv, key, (v) => (v && typeof v === 'object' ? (v as StoredRecord) : undefined));
  return {
    recipes: col('recipes'),
    categories: col('categories'),
    pantry_items: col('pantry'),
    meal_plan_entries: col('meals'),
    shopping_items: col('shopping'),
    barcode_items: col('barcodes'),
  };
}

function scheduler() {
  const items: { fn: () => void; ms: number; cancelled: boolean }[] = [];
  return {
    items,
    schedule(fn: () => void, ms: number) {
      const item = { fn, ms, cancelled: false };
      items.push(item);
      return { cancel: () => void (item.cancelled = true) };
    },
    pending() {
      return items.filter((item) => !item.cancelled);
    },
    flush() {
      const batch = items.splice(0, items.length);
      for (const item of batch) if (!item.cancelled) item.fn();
    },
  };
}

const HH = '11111111-1111-4111-8111-111111111111';

afterEach(() => setIdentity({}));

describe('sync coordinator triggers and offline queue', () => {
  function setup(remote: RemoteAdapter = { pull: jest.fn(async () => []), push: jest.fn(async () => {}) }) {
    const kv = memoryStore();
    const clock = scheduler();
    const identity = { userId: 'ada', householdId: HH };
    const engine = createSyncCoordinator({
      collections: collections(kv),
      getRemote: () => remote,
      getIdentity: () => identity,
      kv,
      schedule: clock.schedule,
      isolate: withoutSyncNotify,
      debounceMs: 1500,
      realtimeDebounceMs: 400,
      retryBaseMs: 1000,
      now: () => new Date('2026-10-03T12:00:00.000Z'),
    });
    return { kv, clock, remote, engine };
  }

  it('debounces local writes and runs foreground, pull and sign-in immediately', async () => {
    const remote = { pull: jest.fn(async () => []), push: jest.fn(async () => {}) };
    const { clock, engine } = setup(remote);
    engine.requestSync('write');
    engine.requestSync('write');
    engine.requestSync('write');
    expect(clock.pending()).toHaveLength(1);
    expect(clock.pending()[0].ms).toBe(1500);
    expect(remote.pull).not.toHaveBeenCalled();
    clock.flush();
    await flushMicrotasks();
    expect(remote.pull).toHaveBeenCalledTimes(SYNC_TABLES.length);

    remote.pull.mockClear();
    engine.requestSync('foreground');
    await flushMicrotasks();
    expect(remote.pull).toHaveBeenCalledTimes(SYNC_TABLES.length);

    remote.pull.mockClear();
    await engine.syncNow('pull');
    expect(remote.pull).toHaveBeenCalledTimes(SYNC_TABLES.length);
    expect(engine.getStatus().phase).toBe('synced');
  });

  it('queues a failed sync and retries when the network returns', async () => {
    const remote: RemoteAdapter & { pull: jest.Mock; push: jest.Mock } = {
      pull: jest.fn(async () => {
        throw new Error('Network request failed');
      }),
      push: jest.fn(async () => {}),
    };
    const { kv, clock, engine } = setup(remote);
    const cols = collections(kv);
    // The coordinator has its own collections; write through those by reaching the same kv keys.
    await cols.recipes.save(
      {
        id: 'r1',
        householdId: HH,
        createdBy: 'ada',
        updatedAt: '2026-10-03T11:00:00.000Z',
      } satisfies StoredRecord,
      new Date('2026-10-03T11:00:00.000Z'),
    );

    await engine.syncNow('join');
    expect(engine.getStatus().phase).toBe('offline');
    expect(engine.getStatus().lastError).toMatch(/offline/i);
    const queued = JSON.parse((await kv.getItem('my-recipe-app/sync-queue/v1')) ?? '{}') as { dirty: boolean };
    expect(queued.dirty).toBe(true);
    expect(clock.pending().some((item) => item.ms === 1000)).toBe(true);

    remote.pull.mockResolvedValue([]);
    clock.flush();
    await flushMicrotasks();
    expect(engine.getStatus().phase).toBe('synced');
    expect(remote.push).toHaveBeenCalled();
    const pushed = (remote.push.mock.calls as [string, { id: string }[]][]).flatMap((call) => call[1]);
    expect(pushed.some((row) => row.id === 'r1')).toBe(true);
  });

  it('syncs a signed-in user without a household (personal space, cloudSync gate only)', async () => {
    const remote = { pull: jest.fn(async () => []), push: jest.fn(async () => {}) };
    const kv = memoryStore();
    const personal = createSyncCoordinator({
      collections: collections(kv),
      getRemote: () => remote,
      getIdentity: () => ({ userId: 'ada' }),
      kv,
      canUse: (id) => id !== 'householdSync',
      isolate: withoutSyncNotify,
    });
    await personal.syncNow('signin');
    expect(personal.getStatus().phase).toBe('synced');
    expect(remote.pull).toHaveBeenCalledWith('recipes', null, undefined);

    remote.pull.mockClear();
    const noCloud = createSyncCoordinator({
      collections: collections(kv),
      getRemote: () => remote,
      getIdentity: () => ({ userId: 'ada' }),
      kv,
      canUse: (id) => id !== 'cloudSync',
    });
    await noCloud.syncNow('signin');
    expect(noCloud.getStatus().phase).toBe('solo');
    expect(remote.pull).not.toHaveBeenCalled();
  });

  it('is a no-op when signed out, and when the feature is locked', async () => {
    const remote = { pull: jest.fn(async () => []), push: jest.fn() };
    const kv = memoryStore();
    const locked = createSyncCoordinator({
      collections: collections(kv),
      getRemote: () => remote,
      getIdentity: () => ({ userId: 'ada', householdId: HH }),
      kv,
      canUse: () => false,
    });
    await locked.syncNow('pull');
    expect(locked.getStatus().phase).toBe('solo');
    expect(remote.pull).not.toHaveBeenCalled();

    const solo = createSyncCoordinator({
      collections: collections(kv),
      getRemote: () => remote,
      getIdentity: () => ({}),
      kv,
    });
    solo.requestSync('foreground');
    await flushMicrotasks();
    expect(solo.getStatus().phase).toBe('solo');
    expect(remote.pull).not.toHaveBeenCalled();
  });

  it('debounces optional realtime events into one sync', async () => {
    const remote = { pull: jest.fn(async () => []), push: jest.fn(async () => {}) };
    const { clock, engine } = setup(remote);
    let fire = () => {};
    engine.setRealtime((onChange) => {
      fire = onChange;
      return () => undefined;
    });
    expect(engine.getStatus().realtime).toBe(true);
    fire();
    fire();
    expect(clock.pending()).toHaveLength(1);
    expect(clock.pending()[0].ms).toBe(400);
    clock.flush();
    await flushMicrotasks();
    expect(remote.pull).toHaveBeenCalled();
  });
});

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}
