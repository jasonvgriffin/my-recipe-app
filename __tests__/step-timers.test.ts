import * as Notifications from 'expo-notifications';

import { createCookSession } from '@/cooking';
import { SAMPLE_RECIPES } from '../test-helpers/sample-recipes';
import {
  armStepTimer,
  cancelStepTimerNotification,
  configureStepTimerNotifications,
  startBackgroundStepTimer,
  stepTimerNotificationId,
  STEP_TIMER_CHANNEL_ID,
} from '@/notifications/step-timers';
import type { KeyValueStore } from '@/storage/kv';
import type { Recipe } from '@/types/recipe';

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

const chicken = SAMPLE_RECIPES[0];
const other: Recipe = { ...SAMPLE_RECIPES[1], id: 'other-recipe' };

beforeEach(() => {
  jest.clearAllMocks();
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
    granted: true,
    canAskAgain: true,
    status: 'granted',
  });
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
    granted: true,
    canAskAgain: true,
    status: 'granted',
  });
});

describe('step timer notifications (spec #15)', () => {
  it('plays a sound and shows a banner while the app is open', async () => {
    configureStepTimerNotifications();
    const handler = (Notifications.setNotificationHandler as jest.Mock).mock.calls.at(-1)[0].handleNotification;
    await expect(handler()).resolves.toMatchObject({
      shouldPlaySound: true,
      shouldShowBanner: true,
      shouldShowList: true,
    });
  });

  it('creates the Android channel before asking for permission, then schedules with sound', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: true });
    const endsAt = new Date(Date.now() + 60_000).toISOString();
    const armed = await armStepTimer({ recipeId: 'r', recipeTitle: 'Lemon chicken', stepIndex: 3, endsAt }, 'android');
    expect(armed).toMatchObject({ permission: 'granted', scheduled: true, id: 'step-timer:r:3' });
    const channelOrder = (Notifications.setNotificationChannelAsync as jest.Mock).mock.invocationCallOrder[0];
    const askOrder = (Notifications.requestPermissionsAsync as jest.Mock).mock.invocationCallOrder[0];
    expect(channelOrder).toBeLessThan(askOrder);
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      STEP_TIMER_CHANNEL_ID,
      expect.objectContaining({ name: 'Step timers', importance: 4 }),
    );
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: stepTimerNotificationId('r', 3),
        content: expect.objectContaining({ sound: true, title: 'Timer done' }),
        trigger: expect.objectContaining({ type: 'date', channelId: STEP_TIMER_CHANNEL_ID }),
      }),
    );
  });

  it('does not schedule when permission is denied or the timer already ended', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: false });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: false });
    const denied = await armStepTimer(
      { recipeId: 'r', recipeTitle: 'Lemon chicken', stepIndex: 0, endsAt: new Date(Date.now() + 5000).toISOString() },
      'android',
    );
    expect(denied).toMatchObject({ permission: 'denied', scheduled: false });
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();

    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    const past = await armStepTimer({
      recipeId: 'r',
      recipeTitle: 'Lemon chicken',
      stepIndex: 1,
      endsAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(past.scheduled).toBe(false);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules a separate notification per step and cancels one without the other', async () => {
    const soon = new Date(Date.now() + 30_000).toISOString();
    const later = new Date(Date.now() + 90_000).toISOString();
    await armStepTimer({ recipeId: 'r', recipeTitle: 'Soup', stepIndex: 0, endsAt: soon });
    await armStepTimer({ recipeId: 'r', recipeTitle: 'Soup', stepIndex: 1, endsAt: later });
    const ids = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.map((c) => c[0].identifier);
    expect(ids).toEqual(['step-timer:r:0', 'step-timer:r:1']);
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockClear();
    await cancelStepTimerNotification('r', 0);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('step-timer:r:0');
  });

  it('starts a background timer on a recipe step and keeps another step’s timer', async () => {
    const recipes = new Map<string, Recipe>([
      [chicken.id, chicken],
      [other.id, other],
    ]);
    const session = createCookSession({
      getRecipe: async (id) => recipes.get(id),
      kv: memoryStore(),
      now: () => new Date('2026-10-03T12:00:00Z'),
    });
    const first = await startBackgroundStepTimer(session, {
      recipeId: chicken.id,
      recipeTitle: chicken.title,
      stepIndex: 3,
    });
    expect(first.ok).toBe(true);
    const second = await startBackgroundStepTimer(session, {
      recipeId: chicken.id,
      recipeTitle: chicken.title,
      stepIndex: 0,
      durationSeconds: 45,
    });
    expect(second.ok).toBe(true);
    const state = await session.getState();
    expect(state?.stepIndex).toBe(0);
    expect(state?.timers.map((t) => t.stepIndex).sort()).toEqual([0, 3]);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);

    await startBackgroundStepTimer(session, {
      recipeId: other.id,
      recipeTitle: other.title,
      stepIndex: 3,
      durationSeconds: 30,
    });
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(`step-timer:${chicken.id}:0`);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(`step-timer:${chicken.id}:3`);
    expect((await session.getState())?.recipeId).toBe(other.id);
  });
});
