import { parseUrl } from '@/import/url';

import type { CookResult, CookSession } from './session';

/**
 * Cook-with-me deep links (spec #24):
 *   myrecipeapp://cook/{recipeId}        start (or restart) a session for the recipe
 *   myrecipeapp://cook/{recipeId}?step=3 start at step 3 (1-based, as spoken)
 *   myrecipeapp://cook/current           show/return the current step
 *   myrecipeapp://cook/next | previous | repeat | timer | end
 */
export type CookCommand =
  | { action: 'start'; recipeId: string; stepIndex?: number }
  | { action: 'current' | 'next' | 'previous' | 'repeat' | 'timer' | 'end' };

const ACTIONS = new Set(['current', 'next', 'previous', 'repeat', 'timer', 'end']);

export function parseCookDeepLink(link: string): CookCommand | undefined {
  const u = parseUrl(link);
  if (!u || u.protocol !== 'myrecipeapp') return undefined;
  const parts = (u.host + u.path).split('/').filter(Boolean);
  if (parts[0] !== 'cook' || parts.length !== 2) return undefined;
  const arg = decodeURIComponent(parts[1]);
  if (ACTIONS.has(arg)) return { action: arg as Exclude<CookCommand['action'], 'start'> };
  const step = Number(u.query.find(([k]) => k === 'step')?.[1]);
  return Number.isInteger(step) && step >= 1
    ? { action: 'start', recipeId: arg, stepIndex: step - 1 }
    : { action: 'start', recipeId: arg };
}

/** Execute a parsed command against the session (used by the deep-link route and, later, the MCP server). */
export function runCookCommand(session: CookSession, cmd: CookCommand): Promise<CookResult> {
  switch (cmd.action) {
    case 'start':
      return session.startSession(cmd.recipeId, cmd.stepIndex);
    case 'current':
      return session.getCurrentStep();
    case 'next':
      return session.next();
    case 'previous':
      return session.previous();
    case 'repeat':
      return session.repeat();
    case 'timer':
      return session.startStepTimer();
    case 'end':
      return session.endSession();
  }
}
