import { createRecipe } from '@/lib/recipe-utils';
import { getIdentity, setIdentity } from '@/storage/identity';
import type { KeyValueStore } from '@/storage/kv';
import { recipeStore } from '@/storage/recipes';
import {
  authorLabel,
  createAccountController,
  isEmail,
  normalizeOtp,
  readMagicLink,
  type AccountState,
} from '@/sync';
import { createFakeAccountBackend } from '../test-helpers/fake-account';

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

const recipeInput = (title: string) => ({
  title,
  ingredients: [{ text: '2 eggs' }],
  steps: [{ text: 'Cook 5 minutes' }],
  tags: ['low-carb'],
  servings: 2,
  nutrition: { netCarbsG: 1, source: 'manual' as const },
});

afterEach(async () => {
  setIdentity({});
  await require('@react-native-async-storage/async-storage').clear();
});

describe('magic link + email helpers', () => {
  it('reads tokens from the hash and ignores other deep links', () => {
    expect(readMagicLink('myrecipeapp://cook/abc')).toBeNull();
    expect(readMagicLink('myrecipeapp://auth')).toBeNull();
    expect(readMagicLink('myrecipeapp://auth#access_token=aaa&refresh_token=bbb&type=magiclink')).toEqual({
      accessToken: 'aaa',
      refreshToken: 'bbb',
      code: undefined,
      token: undefined,
      email: undefined,
    });
    expect(readMagicLink('myrecipeapp://auth?code=pkce-code')?.code).toBe('pkce-code');
  });

  it('validates email and keeps a 6-digit code', () => {
    expect(isEmail('ada@example.com')).toBe(true);
    expect(isEmail('not-an-email')).toBe(false);
    expect(normalizeOtp('12 34-56 extra')).toBe('123456');
    expect(normalizeOtp('123')).toBe('123');
  });
});

describe('household account controller', () => {
  it('signs in with a code, creates and joins, rotates, renames, removes, leaves and signs out', async () => {
    const kv = memoryStore();
    const fake = createFakeAccountBackend();
    const account = createAccountController({ kv, backend: fake.api, setIdentity });

    expect((await account.sendCode('nope')).ok).toBe(false);
    expect((await account.sendCode('ada@example.com')).ok).toBe(true);
    expect(fake.sent).toEqual(['ada@example.com']);
    expect((await account.verifyCode('ada@example.com', '000000')).ok).toBe(false);
    expect((await account.verifyCode('ada@example.com', '123456')).ok).toBe(true);
    expect(getIdentity().userId).toBe(account.getState().user?.id);
    expect(getIdentity().householdId).toBeUndefined();

    expect((await account.createHousehold('')).ok).toBe(false);
    expect((await account.createHousehold('Griffins')).ok).toBe(true);
    const created = account.getState();
    expect(created.role).toBe('owner');
    expect(created.household?.name).toBe('Griffins');
    expect(created.household?.inviteCode).toMatch(/^CODE/);
    expect(getIdentity().householdId).toBe(created.household?.id);

    expect((await account.setDisplayName('Ada')).ok).toBe(true);
    expect(account.getState().members.find((m) => m.userId === created.user?.id)?.displayName).toBe('Ada');
    expect(authorLabel(created.user?.id, account.getState())).toBe('Ada');
    expect(authorLabel('someone-else', account.getState())).toBeNull();

    fake.addMember({
      householdId: created.household!.id,
      userId: 'user-bob',
      role: 'member',
      displayName: 'Bob',
      joinedAt: '2026-10-03T02:00:00.000Z',
    });
    await account.refresh();
    expect(account.getState().members.map((m) => m.displayName).sort()).toEqual(['Ada', 'Bob']);
    expect((await account.removeMember('user-bob')).ok).toBe(true);
    expect(account.getState().members.map((m) => m.userId)).toEqual([created.user?.id]);

    fake.setRotateCode('NEWCODE1');
    expect((await account.rotateInvite()).ok).toBe(true);
    expect(account.getState().household?.inviteCode).toBe('NEWCODE1');

    const bobBackend = createFakeAccountBackend();
    // Share the same maps by signing Bob into a controller over the original fake after switching session.
    // Join as a second user on the same backend:
    fake.sent.length = 0;
    const bob = createAccountController({ kv: memoryStore(), backend: fake.api, setIdentity });
    await fake.api.signOut();
    await bob.sendCode('bob@example.com');
    await bob.verifyCode('bob@example.com', '123456');
    expect((await bob.rotateInvite()).ok).toBe(false);
    expect((await bob.joinWithCode('nope')).ok).toBe(false);
    expect((await bob.joinWithCode('newcode1')).ok).toBe(true);
    expect(bob.getState().role).toBe('member');
    expect(bob.getState().members.some((m) => m.displayName === 'Ada')).toBe(true);
    expect((await bob.rotateInvite()).ok).toBe(false);

    expect((await bob.leave()).ok).toBe(true);
    expect(bob.getState().household).toBeNull();
    expect(getIdentity().householdId).toBeUndefined();
    expect(getIdentity().userId).toBe(bob.getState().user?.id);

    expect((await bob.signOut()).ok).toBe(true);
    expect(bob.getState().user).toBeNull();
    expect(getIdentity()).toEqual({});
  });

  it('keeps on-device recipes when signing out, and new solo recipes are not stamped', async () => {
    const fake = createFakeAccountBackend();
    const account = createAccountController({ kv: memoryStore(), backend: fake.api, setIdentity });
    await account.sendCode('ada@example.com');
    await account.verifyCode('ada@example.com', '123456');
    await account.createHousehold('Griffins');
    const saved = await recipeStore.save(createRecipe(recipeInput('Eggs')));
    expect(saved.householdId).toBe(account.getState().household?.id);
    expect(saved.createdBy).toBe(account.getState().user?.id);

    await account.signOut();
    expect(await recipeStore.get(saved.id)).toMatchObject({ title: 'Eggs' });
    const solo = await recipeStore.save(createRecipe(recipeInput('Solo plate')));
    expect(solo.householdId).toBeUndefined();
    expect(solo.createdBy).toBeUndefined();
  });

  it('does not call the backend when householdSync is locked', async () => {
    const fake = createFakeAccountBackend();
    const account = createAccountController({
      kv: memoryStore(),
      backend: fake.api,
      setIdentity,
      canUse: () => false,
    });
    const result = await account.sendCode('ada@example.com');
    expect(result).toEqual({ ok: false, error: 'Household sharing is not available.' });
    expect(fake.sent).toEqual([]);
    await account.restore();
    expect(getIdentity()).toEqual({});
  });

  it('keeps the cached household when the session check fails offline', async () => {
    const kv = memoryStore();
    const fake = createFakeAccountBackend();
    const account = createAccountController({ kv, backend: fake.api, setIdentity });
    await account.sendCode('ada@example.com');
    await account.verifyCode('ada@example.com', '123456');
    await account.createHousehold('Griffins');
    const householdId = account.getState().household?.id;

    fake.setSessionError(new Error('Network request failed'));
    const offline = createAccountController({ kv, backend: fake.api, setIdentity });
    await offline.restore();
    const state: AccountState = offline.getState();
    expect(state.household?.id).toBe(householdId);
    expect(state.error).toMatch(/network/i);
    expect(getIdentity().householdId).toBe(householdId);
  });

  it('applies a magic link and ignores other URLs', async () => {
    const fake = createFakeAccountBackend();
    const account = createAccountController({ kv: memoryStore(), backend: fake.api, setIdentity });
    expect((await account.completeMagicLink('myrecipeapp://cook/abc')).ok).toBe(true);
    expect(account.getState().user).toBeNull();
    expect((await account.completeMagicLink('myrecipeapp://auth#access_token=a&refresh_token=b')).ok).toBe(true);
    expect(account.getState().user).toMatchObject({ id: 'user-magic', email: 'magic@example.com' });
  });

  it('stays unconfigured when there is no backend', async () => {
    const account = createAccountController({ kv: memoryStore(), backend: null, setIdentity });
    await account.restore();
    expect(account.getState().configured).toBe(false);
    expect((await account.sendCode('ada@example.com')).ok).toBe(false);
  });
});
