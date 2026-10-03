import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import type { CookResult, CookSession } from '@/cooking';

/**
 * Local step-timer alerts (spec #15). The cook session stores `{ startedAt, endsAt }`;
 * this module asks for notification permission and schedules a notification that the OS
 * delivers — with sound — even when the app is backgrounded or not on screen.
 * One notification id per recipe step, so several steps can time at once.
 */

export const STEP_TIMER_CHANNEL_ID = 'step-timers';

export type TimerPermission = 'granted' | 'denied';

export interface ArmStepTimerInput {
  recipeId: string;
  recipeTitle: string;
  stepIndex: number;
  endsAt: string;
  now?: Date;
}

export interface ArmStepTimerResult {
  permission: TimerPermission;
  /** Set when a notification was scheduled. */
  id?: string;
  scheduled: boolean;
}

export function stepTimerNotificationId(recipeId: string, stepIndex: number): string {
  return `step-timer:${recipeId}:${stepIndex}`;
}

/** Foreground presentation: show the banner and play a sound while the app is open. */
export function configureStepTimerNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Android 13+ won't show the notification prompt until a channel exists, and Android 8+
 * plays sound from the channel. Call this before requesting permission.
 */
export async function ensureStepTimerChannel(platform: string = Platform.OS): Promise<void> {
  if (platform !== 'android') return;
  await Notifications.setNotificationChannelAsync(STEP_TIMER_CHANNEL_ID, {
    name: 'Step timers',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
  });
}

export async function ensureTimerPermission(platform: string = Platform.OS): Promise<TimerPermission> {
  configureStepTimerNotifications();
  await ensureStepTimerChannel(platform);
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  const asked = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return asked.granted ? 'granted' : 'denied';
}

/**
 * Schedule (or replace) the notification for one step. A denied permission still
 * leaves the in-app countdown running; the caller tells the user notifications are off.
 * An `endsAt` already in the past is not scheduled.
 */
export async function armStepTimer(
  input: ArmStepTimerInput,
  platform: string = Platform.OS,
): Promise<ArmStepTimerResult> {
  const permission = await ensureTimerPermission(platform);
  const id = stepTimerNotificationId(input.recipeId, input.stepIndex);
  const fireAt = new Date(input.endsAt);
  const now = input.now ?? new Date();
  if (permission !== 'granted' || !(fireAt.getTime() > now.getTime())) {
    return { permission, scheduled: false };
  }
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: 'Timer done',
      body: `${input.recipeTitle} — step ${input.stepIndex + 1} is ready`,
      sound: true,
      data: { recipeId: input.recipeId, stepIndex: input.stepIndex },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
      channelId: STEP_TIMER_CHANNEL_ID,
    },
  });
  return { permission, id, scheduled: true };
}

export async function cancelStepTimerNotification(recipeId: string, stepIndex: number): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(stepTimerNotificationId(recipeId, stepIndex)).catch(
    () => undefined,
  );
}

export async function cancelStepTimerNotifications(recipeId: string, stepIndexes: number[]): Promise<void> {
  await Promise.all(stepIndexes.map((i) => cancelStepTimerNotification(recipeId, i)));
}

export interface StartBackgroundTimerInput {
  recipeId: string;
  recipeTitle: string;
  stepIndex: number;
  durationSeconds?: number;
}

export type StartBackgroundTimerResult =
  | { ok: true; result: Extract<CookResult, { ok: true }>; permission: TimerPermission; scheduled: boolean }
  | { ok: false; result: CookResult; permission: 'skipped' };

/**
 * Start a step timer from outside cooking mode (the ⏱ on a recipe) and schedule its notification.
 * Reuses the active session when it's already this recipe so other running timers stay.
 * A different recipe replaces the session (one session per device).
 */
export async function startBackgroundStepTimer(
  session: CookSession,
  input: StartBackgroundTimerInput,
): Promise<StartBackgroundTimerResult> {
  const prev = await session.getState();
  if (!prev || prev.recipeId !== input.recipeId) {
    const started = await session.startSession(input.recipeId, 0);
    if (!started.ok) return { ok: false, result: started, permission: 'skipped' };
    if (prev?.timers.length) {
      await cancelStepTimerNotifications(
        prev.recipeId,
        prev.timers.map((t) => t.stepIndex),
      );
    }
  }
  const result = await session.startStepTimer(input.durationSeconds, input.stepIndex);
  if (!result.ok || !('step' in result)) return { ok: false, result, permission: 'skipped' };
  const timer = result.step.activeTimers?.find((t) => t.stepIndex === input.stepIndex);
  if (!timer) return { ok: false, result, permission: 'skipped' };
  const armed = await armStepTimer({
    recipeId: input.recipeId,
    recipeTitle: input.recipeTitle,
    stepIndex: input.stepIndex,
    endsAt: timer.endsAt,
  });
  return { ok: true, result, permission: armed.permission, scheduled: armed.scheduled };
}
