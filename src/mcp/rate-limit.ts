/**
 * Per-user rate limits for the MCP server (Phase 3): a short burst window plus a daily cap. Over the limit,
 * the server answers HTTP 429 with Retry-After. Production uses the `mcp_rate_limit_hit` Postgres function
 * (supabase/migrations/*_mcp.sql); tests use the in-memory limiter.
 */
export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the caller may retry (when !ok). */
  retryAfter?: number;
}

export interface RateLimiter {
  hit(userId: string): Promise<RateLimitResult>;
}

export const MCP_RATE_LIMITS = {
  /** Requests per minute per user. */
  perMinute: 60,
  /** Requests per day per user. */
  perDay: 2000,
} as const;

export function createMemoryRateLimiter(
  limits: { perMinute: number; perDay: number } = MCP_RATE_LIMITS,
  now: () => Date = () => new Date(),
): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    async hit(userId) {
      const t = now().getTime();
      const list = (hits.get(userId) ?? []).filter((x) => t - x < 86_400_000);
      const lastMinute = list.filter((x) => t - x < 60_000);
      if (lastMinute.length >= limits.perMinute) {
        hits.set(userId, list);
        return { ok: false, retryAfter: Math.max(1, Math.ceil((lastMinute[0] + 60_000 - t) / 1000)) };
      }
      if (list.length >= limits.perDay) {
        hits.set(userId, list);
        return { ok: false, retryAfter: Math.max(1, Math.ceil((list[0] + 86_400_000 - t) / 1000)) };
      }
      list.push(t);
      hits.set(userId, list);
      return { ok: true };
    },
  };
}

/** Limiter backed by the `mcp_rate_limit_hit(p_per_minute, p_per_day)` RPC, called with the user's own JWT. */
export function createRpcRateLimiter(
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  limits: { perMinute: number; perDay: number } = MCP_RATE_LIMITS,
): RateLimiter {
  return {
    async hit() {
      const { data, error } = await rpc('mcp_rate_limit_hit', { p_per_minute: limits.perMinute, p_per_day: limits.perDay });
      if (error) throw new Error(`Rate limit check failed: ${error.message}`);
      const retry = typeof data === 'number' ? data : Number(data ?? 0);
      return retry > 0 ? { ok: false, retryAfter: retry } : { ok: true };
    },
  };
}
