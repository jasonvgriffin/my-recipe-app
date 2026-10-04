/**
 * Data access for the MCP server (Phase 3): the caller's household, or (v1.0.6) their personal space when they
 * are in no household (rows with household_id NULL, owner = the user; docs/SYNC.md "Personal space"). Reads and writes the same synced Supabase tables the
 * app uses (docs/SYNC.md), through the same row mapping (`src/sync/rows.ts`), so records written here show up
 * in the app on its next sync. UI-free and runtime-neutral (Node, Deno, jest).
 */
import { fromRow, toRow, type DbRow } from '@/sync/rows';
import type { SyncTable } from '@/types/sync';

export type McpTable = Extract<SyncTable, 'recipes' | 'categories' | 'pantry_items' | 'meal_plan_entries' | 'shopping_items'>;

export type HouseholdRecord = { id: string; createdAt: string; updatedAt: string } & Record<string, unknown>;

export interface HouseholdRepo {
  /** The shared household, or null = the user's personal space. */
  readonly householdId: string | null;
  /** Live (non-deleted) records of a table, as app records. */
  list(table: McpTable): Promise<HouseholdRecord[]>;
  /** Insert or update one record (stamps household or personal scope, author, updatedAt). */
  save<T extends HouseholdRecord>(table: McpTable, record: T): Promise<T>;
  /** Tombstone a record (no hard deletes, same as the app). */
  remove(table: McpTable, id: string): Promise<void>;
}

/** Minimal slice of the supabase-js query builder used here (keeps this file free of the SDK). */
type Rows = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
interface FilterLike extends Rows {
  eq(column: string, value: string): FilterLike;
  is(column: string, value: null): FilterLike;
}
export interface SupabaseLike {
  from(table: string): {
    select(columns: string): FilterLike;
    upsert(rows: DbRow[], options?: { onConflict?: string }): PromiseLike<{ error: { message: string } | null }>;
  };
}

export function createSupabaseRepo(
  client: SupabaseLike,
  ctx: { householdId: string | null; userId: string; now?: () => Date },
): HouseholdRepo {
  const now = ctx.now ?? (() => new Date());
  const householdId = ctx.householdId || null;
  async function upsert(table: McpTable, rec: HouseholdRecord) {
    const { error } = await client.from(table).upsert([toRow(table, rec)], { onConflict: 'id' });
    if (error) throw new Error(`Could not save to ${table}: ${error.message}`);
  }
  return {
    householdId,
    async list(table) {
      const base = client.from(table).select('*');
      // Personal space: household_id IS NULL; RLS limits it to the caller's own rows (owner_id = auth.uid()).
      const scoped = householdId ? base.eq('household_id', householdId) : base.is('household_id', null);
      const { data, error } = await scoped.is('deleted_at', null);
      if (error) throw new Error(`Could not read ${table}: ${error.message}`);
      return (data ?? []).map((row) => fromRow(row as DbRow) as HouseholdRecord);
    },
    async save(table, record) {
      const rec = {
        ...record,
        householdId: householdId ?? undefined,
        createdBy: (record.createdBy as string | undefined) ?? ctx.userId,
        updatedAt: now().toISOString(),
      };
      await upsert(table, rec);
      return rec;
    },
    async remove(table, id) {
      const existing = (await this.list(table)).find((r) => r.id === id);
      if (!existing) return;
      const ts = now().toISOString();
      await upsert(table, { ...existing, deletedAt: ts, updatedAt: ts });
    },
  };
}

/** In-memory repo for tests and local runs. */
export function createMemoryRepo(
  householdId: string | null = 'household-1',
  userId = 'user-1',
  now = () => new Date(),
): HouseholdRepo & {
  tables: Record<McpTable, Map<string, HouseholdRecord>>;
} {
  const tables = {
    recipes: new Map(),
    categories: new Map(),
    pantry_items: new Map(),
    meal_plan_entries: new Map(),
    shopping_items: new Map(),
  } as Record<McpTable, Map<string, HouseholdRecord>>;
  return {
    householdId,
    tables,
    async list(table) {
      return [...tables[table].values()].filter((r) => !r.deletedAt).map((r) => structuredClone(r));
    },
    async save(table, record) {
      const rec = {
        ...record,
        householdId: householdId ?? undefined,
        createdBy: (record.createdBy as string | undefined) ?? userId,
        updatedAt: now().toISOString(),
      };
      tables[table].set(rec.id, structuredClone(rec));
      return rec;
    },
    async remove(table, id) {
      const r = tables[table].get(id);
      if (r) r.deletedAt = now().toISOString();
    },
  };
}
