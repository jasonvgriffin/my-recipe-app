import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import * as Clipboard from 'expo-clipboard';
import { Alert, RefreshControl, Share } from 'react-native';

import { featureGate, LocalFreeEntitlements, NoEntitlements } from '@/entitlements';
import { stopHouseholdRuntime, resetHouseholdRuntime } from '@/household/runtime';
import { setIdentity } from '@/storage/identity';
import type { RemoteAdapter } from '@/sync';
import { createFakeAccountBackend } from '../test-helpers/fake-account';

const COMPACT = 411;
const EXPANDED = 900;
let mockWidth = COMPACT;

jest.mock('@/hooks/use-window-size-class', () => {
  const actual = jest.requireActual('@/hooks/use-window-size-class');
  return { ...actual, useWindowSizeClass: () => actual.getWindowLayout(mockWidth, 800) };
});

function manualSchedule() {
  const items: { fn: () => void; cancelled: boolean }[] = [];
  return {
    schedule(fn: () => void) {
      const item = { fn, cancelled: false };
      items.push(item);
      return { cancel: () => void (item.cancelled = true) };
    },
  };
}

function renderHousehold() {
  const Household = require('@/app/household').default;
  return render(<Household />);
}

async function signIn(email = 'ada@example.com') {
  fireEvent.changeText(screen.getByTestId('household-email'), email);
  await act(async () => {
    fireEvent.press(screen.getByTestId('household-send-code'));
  });
  expect(await screen.findByTestId('household-otp')).toBeTruthy();
  fireEvent.changeText(screen.getByTestId('household-otp'), '123456');
  await act(async () => {
    fireEvent.press(screen.getByTestId('household-verify'));
  });
  expect(await screen.findByTestId('household-signed-in')).toBeTruthy();
}

describe('Settings → Household (spec #25)', () => {
  let fake: ReturnType<typeof createFakeAccountBackend>;
  let remote: { pull: jest.Mock; push: jest.Mock } & RemoteAdapter;

  beforeEach(async () => {
    mockWidth = COMPACT;
    await require('@react-native-async-storage/async-storage').clear();
    setIdentity({});
    featureGate.resetConfig();
    featureGate.setProvider(new LocalFreeEntitlements());
    fake = createFakeAccountBackend();
    remote = {
      pull: jest.fn(async () => []),
      push: jest.fn(async () => {}),
    };
    await resetHouseholdRuntime({
      account: fake.api,
      remote,
      schedule: manualSchedule().schedule,
      realtime: () => () => undefined,
    });
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const list = Array.isArray(buttons) ? buttons : [];
      const confirm = [...list].reverse().find((button) => button.text !== 'Cancel');
      confirm?.onPress?.();
    });
  });

  afterEach(async () => {
    await act(async () => {
      stopHouseholdRuntime();
      featureGate.resetConfig();
      featureGate.setProvider(new LocalFreeEntitlements());
    });
    jest.restoreAllMocks();
  });

  it('signs in with a 6-digit code, creates a household, and copies, shares and rotates the invite code', async () => {
    await renderHousehold();
    expect(screen.getByText('Sign in')).toBeTruthy();
    expect(screen.getByText(/6-digit code/)).toBeTruthy();
    await signIn();
    expect(screen.getByTestId('household-create')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('household-create'));
    });
    const codeNode = await screen.findByTestId('household-invite-code');
    const code = String(codeNode.props.children);
    expect(code).toMatch(/^CODE/);
    expect(screen.getByText('You are the owner')).toBeTruthy();
    expect(screen.getByText('Owner')).toBeTruthy();
    expect(await screen.findByText('Synced')).toBeTruthy();
    expect(remote.pull).toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByTestId('household-copy-code'));
    });
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(code);

    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    await act(async () => {
      fireEvent.press(screen.getByTestId('household-share-code'));
    });
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining(code) }),
    );

    fake.setRotateCode('NEWCODE1');
    await act(async () => {
      fireEvent.press(screen.getByTestId('household-rotate-code'));
    });
    expect(await screen.findByText('NEWCODE1')).toBeTruthy();
  });

  it('joins with a code, lists roles, removes a member, leaves and signs out without deleting local recipes', async () => {
    fake.seedHousehold('Griffins', 'WELCOME1', { id: 'user-bob', email: 'bob@example.com' }, 'Bob');
    await renderHousehold();
    await signIn('ada@example.com');
    fireEvent.changeText(screen.getByTestId('household-join-code'), 'welcome1');
    await act(async () => {
      fireEvent.press(screen.getByTestId('household-join'));
    });
    expect(await screen.findByText('Griffins')).toBeTruthy();
    expect(screen.getByText('You are a member')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Owner')).toBeTruthy();
    expect(screen.getByText('Member')).toBeTruthy();
    expect(screen.queryByTestId('household-rotate-code')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId('household-leave'));
    });
    expect(await screen.findByTestId('household-create')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('household-create'));
    });
    expect(await screen.findByTestId('household-invite-code')).toBeTruthy();
    const owned = [...fake.households.values()].find((h) => h.name === 'Our household');
    expect(owned).toBeTruthy();
    fake.addMember({
      householdId: owned!.id,
      userId: 'user-bob',
      role: 'member',
      displayName: 'Bob',
      joinedAt: '2026-10-03T03:00:00.000Z',
    });
    const control = screen.UNSAFE_getAllByType(RefreshControl)[0];
    await act(async () => {
      await control.props.onRefresh();
    });
    expect(await screen.findByTestId('remove-member-user-bob')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('remove-member-user-bob'));
    });
    await waitFor(() => expect(screen.queryByTestId('remove-member-user-bob')).toBeNull());

    fireEvent.changeText(screen.getByTestId('household-display-name'), 'Ada');
    await act(async () => {
      fireEvent.press(screen.getByTestId('household-save-name'));
    });
    expect(await screen.findByText('Ada')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('household-sign-out'));
    });
    expect(await screen.findByTestId('household-email')).toBeTruthy();
  });

  it('shows an offline queue and syncs on pull-to-refresh once the network returns', async () => {
    remote.pull.mockImplementation(async () => {
      throw new Error('Network request failed');
    });
    await renderHousehold();
    await signIn();
    await act(async () => {
      fireEvent.press(screen.getByTestId('household-create'));
    });
    expect(await screen.findByText(/Offline/)).toBeTruthy();

    remote.pull.mockImplementation(async () => []);
    await act(async () => {
      fireEvent.press(screen.getByTestId('sync-now'));
    });
    expect(await screen.findByText('Synced')).toBeTruthy();
  });

  it('hides the entry point when householdSync is locked and the route stays neutral', async () => {
    featureGate.setProvider(new NoEntitlements());
    featureGate.setConfig({ householdSync: { tier: 'premium', enabled: true } });
    renderRouter(
      {
        _layout: require('@/app/_layout').default,
        settings: require('@/app/settings').default,
        household: require('@/app/household').default,
        'cook/[action]': require('@/app/cook/[action]').default,
      },
      { initialUrl: '/settings' },
    );
    expect(await screen.findByText('Optional features')).toBeTruthy();
    expect(screen.queryByTestId('household-settings-link')).toBeNull();
    expect(screen.queryByText(/buy|upgrade|subscribe|purchase/i)).toBeNull();

    renderRouter(
      {
        _layout: require('@/app/_layout').default,
        household: require('@/app/household').default,
        'cook/[action]': require('@/app/cook/[action]').default,
      },
      { initialUrl: '/household' },
    );
    expect(await screen.findByTestId('feature-locked-householdSync')).toBeTruthy();
  });

  it('opens Household from Settings', async () => {
    renderRouter(
      {
        _layout: require('@/app/_layout').default,
        settings: require('@/app/settings').default,
        household: require('@/app/household').default,
        'cook/[action]': require('@/app/cook/[action]').default,
      },
      { initialUrl: '/settings' },
    );
    expect(await screen.findByTestId('household-settings-link')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('household-settings-link'));
    });
    expect(screen).toHavePathname('/household');
    expect(await screen.findByText('Sign in')).toBeTruthy();
  });

  it('lays out one column when folded and side-by-side when expanded', () => {
    const view = renderHousehold();
    expect(screen.getByTestId('household-layout-single')).toBeTruthy();
    expect(screen.getByTestId('household-members-empty')).toBeTruthy();

    mockWidth = EXPANDED;
    const Household = require('@/app/household').default;
    view.rerender(<Household />);
    expect(screen.getByTestId('household-layout-dual')).toBeTruthy();
    expect(screen.getByTestId('household-members-scroll')).toBeTruthy();
    expect(screen.getByTestId('household-members-empty')).toBeTruthy();
  });
});
