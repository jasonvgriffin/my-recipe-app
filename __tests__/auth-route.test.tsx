import { screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { featureGate, LocalFreeEntitlements } from '@/entitlements';
import { completeMagicLink, resetHouseholdRuntime, stopHouseholdRuntime } from '@/household/runtime';
import { setIdentity } from '@/storage/identity';
import { createFakeAccountBackend } from '../test-helpers/fake-account';

let mockLinkingUrl: string | null = null;
jest.mock('@/hooks/use-incoming-url', () => ({ useIncomingUrl: () => mockLinkingUrl }));

const FRAGMENT_LINK =
  'myrecipeapp://auth#access_token=aaa&expires_in=3600&refresh_token=bbb&token_type=bearer&type=magiclink';

function renderAuth(initialUrl: string) {
  return renderRouter(
    {
      _layout: require('@/app/_layout').default,
      auth: require('@/app/auth').default,
      household: require('@/app/household').default,
      settings: require('@/app/settings').default,
    },
    { initialUrl },
  );
}

describe('myrecipeapp://auth magic-link route (spec #25)', () => {
  let fake: ReturnType<typeof createFakeAccountBackend>;

  beforeEach(async () => {
    mockLinkingUrl = null;
    await require('@react-native-async-storage/async-storage').clear();
    setIdentity({});
    featureGate.resetConfig();
    featureGate.setProvider(new LocalFreeEntitlements());
    fake = createFakeAccountBackend();
    await resetHouseholdRuntime({
      account: fake.api,
      remote: { pull: jest.fn(async () => []), push: jest.fn(async () => {}) },
      schedule: () => ({ cancel: () => undefined }),
      realtime: () => () => undefined,
    });
  });

  afterEach(() => {
    stopHouseholdRuntime();
    jest.restoreAllMocks();
  });

  it('signs in from the token fragment and opens Settings → Household with a success message', async () => {
    mockLinkingUrl = FRAGMENT_LINK;
    const spy = jest.spyOn(fake.api, 'completeMagicLink');
    renderAuth('/auth');
    expect(await screen.findByTestId('household-auth-ok')).toBeTruthy();
    expect(screen).toHavePathname('/household');
    expect(screen.getByTestId('household-signed-in')).toHaveTextContent(/magic@example.com/);
    expect(screen.queryByText(/Unmatched Route/i)).toBeNull();
    expect(spy).toHaveBeenCalledWith(FRAGMENT_LINK);
  });

  it('exchanges a PKCE ?code= link from the route params when no raw URL is available', async () => {
    // The fake only knows token links; stand in for Supabase's exchangeCodeForSession (which also stores the session).
    const original = fake.api.completeMagicLink.bind(fake.api);
    const spy = jest.spyOn(fake.api, 'completeMagicLink').mockImplementation(async (url) => {
      expect(url).toBe('myrecipeapp://auth?code=pkce-123');
      return original(FRAGMENT_LINK);
    });
    renderAuth('/auth?code=pkce-123');
    expect(await screen.findByTestId('household-auth-ok')).toBeTruthy();
    expect(screen.getByTestId('household-signed-in')).toHaveTextContent(/magic@example.com/);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('shows the error on Household when the link cannot sign in', async () => {
    mockLinkingUrl = FRAGMENT_LINK;
    jest.spyOn(fake.api, 'completeMagicLink').mockRejectedValue(new Error('Email link is invalid or has expired'));
    renderAuth('/auth');
    expect(await screen.findByTestId('household-auth-error')).toHaveTextContent(/invalid or has expired/);
    expect(screen).toHavePathname('/household');
    expect(screen.queryByTestId('household-signed-in')).toBeNull();
  });

  it('explains an incomplete link (no tokens) instead of showing Unmatched Route', async () => {
    mockLinkingUrl = 'myrecipeapp://auth';
    renderAuth('/auth');
    expect(await screen.findByTestId('auth-callback')).toBeTruthy();
    expect(await screen.findByTestId('household-auth-error', {}, { timeout: 4000 })).toHaveTextContent(
      /incomplete or has expired/,
    );
  });

  it('completes each link once even when the URL listener and the route both handle it', async () => {
    const spy = jest.spyOn(fake.api, 'completeMagicLink');
    const [a, b] = await Promise.all([completeMagicLink(FRAGMENT_LINK), completeMagicLink(FRAGMENT_LINK)]);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });
});

describe('magicLinkUrlFrom', () => {
  const { magicLinkUrlFrom } = require('@/app/auth');

  it('prefers the raw linking URL (keeps the #fragment tokens)', () => {
    expect(magicLinkUrlFrom(FRAGMENT_LINK, {})).toBe(FRAGMENT_LINK);
  });

  it('rebuilds query-param links and ignores non-auth URLs', () => {
    expect(magicLinkUrlFrom('myrecipeapp://cook/abc', { code: 'xyz' })).toBe('myrecipeapp://auth?code=xyz');
    expect(magicLinkUrlFrom(null, { token: '123456', email: 'a@b.co' })).toBe(
      'myrecipeapp://auth?token=123456&email=a%40b.co',
    );
    expect(magicLinkUrlFrom(null, {})).toBeNull();
  });
});
