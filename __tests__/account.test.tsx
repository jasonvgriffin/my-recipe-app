/**
 * Settings → AI assistants (MCP) → "Sign in to sync and use with AI assistants" (v1.0.6).
 * A personal account syncs on its own: no household, and household sharing stays its own gate.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import * as Clipboard from 'expo-clipboard';
import { Alert } from 'react-native';

import { MCP_SERVER_URL } from '@/config';
import { featureGate, LocalFreeEntitlements, type FeatureId } from '@/entitlements';
import { resetHouseholdRuntime, stopHouseholdRuntime } from '@/household/runtime';
import { getIdentity, setIdentity } from '@/storage/identity';
import type { RemoteAdapter } from '@/sync';
import { createFakeAccountBackend } from '../test-helpers/fake-account';

const locked = (...ids: FeatureId[]) =>
  Object.fromEntries(ids.map((id) => [id, { enabled: false }]));

function manualSchedule() {
  return { schedule: () => ({ cancel: () => undefined }) };
}

async function signIn(email = 'solo@example.com') {
  fireEvent.changeText(screen.getByTestId('account-email'), email);
  await act(async () => {
    fireEvent.press(screen.getByTestId('account-send-code'));
  });
  fireEvent.changeText(await screen.findByTestId('account-otp'), '123456');
  await act(async () => {
    fireEvent.press(screen.getByTestId('account-verify'));
  });
  expect(await screen.findByTestId('account-signed-in')).toHaveTextContent(`Signed in as ${email}`);
}

describe('Settings → AI assistants: personal account + cloud sync (v1.0.6)', () => {
  let remote: { pull: jest.Mock; push: jest.Mock } & RemoteAdapter;

  beforeEach(async () => {
    await require('@react-native-async-storage/async-storage').clear();
    setIdentity({});
    featureGate.resetConfig();
    featureGate.setProvider(new LocalFreeEntitlements());
    remote = { pull: jest.fn(async () => []), push: jest.fn(async () => {}) };
    await resetHouseholdRuntime({ account: createFakeAccountBackend().api, remote, schedule: manualSchedule().schedule });
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      const confirm = [...(Array.isArray(buttons) ? buttons : [])].reverse().find((b) => b.text !== 'Cancel');
      confirm?.onPress?.();
    });
  });

  afterEach(async () => {
    await act(async () => {
      stopHouseholdRuntime();
      featureGate.resetConfig();
    });
    jest.restoreAllMocks();
  });

  it('signs in with an email code and syncs the personal space with no household', async () => {
    const Account = require('@/app/account').default;
    render(<Account />);
    await signIn();
    expect(getIdentity().householdId).toBeUndefined();
    expect(getIdentity().userId).toBeTruthy();
    expect(await screen.findByText('Synced')).toBeTruthy();
    expect(screen.getByTestId('sync-scope')).toHaveTextContent(/personal space/);
    // Personal scope = household_id null on the remote.
    expect(remote.pull).toHaveBeenCalledWith('recipes', null, undefined);
    expect(screen.getByTestId('account-mcp-url')).toHaveTextContent(MCP_SERVER_URL);
    await act(async () => {
      fireEvent.press(screen.getByTestId('account-mcp-copy'));
    });
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(MCP_SERVER_URL);
    expect(screen.getByTestId('account-household-hint')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('account-sign-out'));
    });
    expect(await screen.findByTestId('account-email')).toBeTruthy();
    expect(getIdentity()).toEqual({ userId: undefined, householdId: undefined });
  });

  it('works with household sharing locked; the household hint is hidden', async () => {
    featureGate.setConfig(locked('householdSync'));
    const Account = require('@/app/account').default;
    render(<Account />);
    await signIn();
    expect(await screen.findByText('Synced')).toBeTruthy();
    expect(screen.queryByTestId('account-household-hint')).toBeNull();
  });

  it('Settings shows the sign-in row under AI assistants (MCP), separate from Household', async () => {
    renderRouter(
      {
        _layout: require('@/app/_layout').default,
        settings: require('@/app/settings').default,
        account: require('@/app/account').default,
        household: require('@/app/household').default,
      },
      { initialUrl: '/settings' },
    );
    const row = await screen.findByTestId('account-settings-link');
    expect(row).toHaveTextContent(/Sign in to sync and use with AI assistants/);
    expect(screen.getByTestId('household-settings-link')).toBeTruthy();
    await act(async () => {
      fireEvent.press(row);
    });
    expect(await screen.findByTestId('account-screen')).toBeTruthy();
    expect(screen.getByTestId('section-title')).toHaveTextContent('AI assistants');
  });

  it('is hidden when cloudSync is locked', async () => {
    featureGate.setConfig(locked('cloudSync'));
    renderRouter(
      { _layout: require('@/app/_layout').default, settings: require('@/app/settings').default },
      { initialUrl: '/settings' },
    );
    expect(await screen.findByTestId('settings-screen')).toBeTruthy();
    expect(screen.queryByTestId('account-settings-link')).toBeNull();
  });
});
