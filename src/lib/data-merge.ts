/**
 * Produces a data object that keeps the in-memory `settings` but takes all
 * icon path entries from the on-disk file.
 *
 * The plugin loads `data.json` once at startup and holds it in memory. When
 * Obsidian Sync writes a newer `data.json` to disk (e.g. folder icons added on
 * another device), the in-memory copy becomes stale. Writing it back blindly
 * would clobber those entries. Refreshing path entries from disk before every
 * write ensures we only ever apply our own delta on top of the freshest state.
 *
 * Settings are kept from memory because the caller may be in the middle of
 * changing them; path entries are taken from disk because that is the shared,
 * frequently-synced state we must not overwrite.
 */
export function mergePathEntriesFromDisk<T extends Record<string, unknown>>(
  inMemory: T,
  onDisk: Record<string, unknown> | null,
): T {
  if (!onDisk) {
    return inMemory;
  }

  const result: Record<string, unknown> = { settings: inMemory.settings };
  for (const [key, value] of Object.entries(onDisk)) {
    if (key !== 'settings') {
      result[key] = value;
    }
  }

  return result as T;
}

export interface IconDataDiff {
  /** Paths present in `previous` but no longer in `next`. */
  removed: string[];
  /** Paths added or whose icon/color changed, with their new value. */
  changed: [string, unknown][];
}

/**
 * Computes which icon path entries were added/changed or removed between two
 * data objects. The `settings` key is ignored. Used to re-render only the icons
 * that actually changed when `data.json` is updated externally (e.g. by Sync).
 */
export function diffIconData(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): IconDataDiff {
  const removed: string[] = [];
  const changed: [string, unknown][] = [];

  for (const key of Object.keys(previous)) {
    if (key !== 'settings' && !(key in next)) {
      removed.push(key);
    }
  }

  for (const [key, value] of Object.entries(next)) {
    if (key === 'settings') {
      continue;
    }

    if (JSON.stringify(previous[key]) !== JSON.stringify(value)) {
      changed.push([key, value]);
    }
  }

  return { removed, changed };
}
