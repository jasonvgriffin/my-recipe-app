/**
 * Detect cooking times in step text for step timers (spec #15) and cooking mode (spec #19).
 * "Bake 25–30 minutes" → 1800 (uses the upper bound so food isn't undercooked; user can adjust).
 * "1 hour 15 minutes" → 4500. Returns undefined if no time found.
 */
const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1,
  m: 60,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  h: 3600,
  hr: 3600,
  hrs: 3600,
  hour: 3600,
  hours: 3600,
};

const TIME_RE =
  /(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|[hms])\b/gi;

export function detectStepDuration(text: string): number | undefined {
  let total = 0;
  for (const m of text.matchAll(TIME_RE)) {
    const value = Number(m[2] ?? m[1]);
    total += value * UNIT_SECONDS[m[3].toLowerCase()];
  }
  return total > 0 ? Math.round(total) : undefined;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Duration in words for print/share: "45 sec", "20 min", "1 hr 5 min" (v1.0.3 PDF export). */
export function formatDurationWords(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} sec`;
  const h = Math.floor(total / 3600);
  const m = Math.round((total % 3600) / 60);
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
