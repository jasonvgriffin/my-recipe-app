/** App icon ids without native or image imports (safe for storage and tests). Source: assets/app-icons/icons.json. */
import ICONS from '../../assets/app-icons/icons.json';

export const APP_ICON_IDS: readonly string[] = (ICONS as { id: string }[]).map((i) => i.id);

export function isAppIconId(value: unknown): value is string {
  return typeof value === 'string' && APP_ICON_IDS.includes(value);
}
