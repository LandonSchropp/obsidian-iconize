import { describe, expect, it } from 'vitest';
import { diffIconData, mergePathEntriesFromDisk } from './data-merge';

describe('mergePathEntriesFromDisk', () => {
  it('keeps the in-memory settings', () => {
    const inMemory = { settings: { fontSize: 16 }, 'Areas/AI': 'TiRobot' };
    const onDisk = { settings: { fontSize: 99 } };

    const result = mergePathEntriesFromDisk(inMemory, onDisk);

    expect(result.settings).toEqual({ fontSize: 16 });
  });

  it('adopts path entries from disk that are not in memory', () => {
    const inMemory: Record<string, unknown> = {
      settings: {},
      'Areas/AI': 'TiRobot',
    };
    const onDisk: Record<string, unknown> = {
      settings: {},
      'Areas/Business': 'TiBriefcase',
    };

    const result = mergePathEntriesFromDisk(inMemory, onDisk);

    expect(result['Areas/Business']).toBe('TiBriefcase');
  });

  it('drops in-memory path entries that are absent from disk', () => {
    const inMemory: Record<string, unknown> = {
      settings: {},
      'Areas/AI': 'TiRobot',
    };
    const onDisk: Record<string, unknown> = { settings: {} };

    const result = mergePathEntriesFromDisk(inMemory, onDisk);

    expect(result['Areas/AI']).toBeUndefined();
  });

  it('prefers the disk value when a path exists in both', () => {
    const inMemory: Record<string, unknown> = {
      settings: {},
      'Areas/AI': 'OldIcon',
    };
    const onDisk: Record<string, unknown> = {
      settings: {},
      'Areas/AI': 'NewIcon',
    };

    const result = mergePathEntriesFromDisk(inMemory, onDisk);

    expect(result['Areas/AI']).toBe('NewIcon');
  });

  it('returns the in-memory data unchanged when disk is null', () => {
    const inMemory = { settings: {}, 'Areas/AI': 'TiRobot' };

    const result = mergePathEntriesFromDisk(inMemory, null);

    expect(result).toBe(inMemory);
  });
});

describe('diffIconData', () => {
  it('reports paths that were added', () => {
    const previous = { settings: {} };
    const next = { settings: {}, 'Areas/AI': 'TiRobot' };

    const result = diffIconData(previous, next);

    expect(result.changed).toEqual([['Areas/AI', 'TiRobot']]);
    expect(result.removed).toEqual([]);
  });

  it('reports paths that were removed', () => {
    const previous = { settings: {}, 'Areas/AI': 'TiRobot' };
    const next = { settings: {} };

    const result = diffIconData(previous, next);

    expect(result.removed).toEqual(['Areas/AI']);
    expect(result.changed).toEqual([]);
  });

  it('reports paths whose icon changed', () => {
    const previous = { settings: {}, 'Areas/AI': 'TiRobot' };
    const next = { settings: {}, 'Areas/AI': 'TiBrain' };

    const result = diffIconData(previous, next);

    expect(result.changed).toEqual([['Areas/AI', 'TiBrain']]);
  });

  it('reports paths whose color changed', () => {
    const previous = {
      settings: {},
      'Areas/AI': { iconName: 'TiRobot', iconColor: 'red' },
    };
    const next = {
      settings: {},
      'Areas/AI': { iconName: 'TiRobot', iconColor: 'blue' },
    };

    const result = diffIconData(previous, next);

    expect(result.changed).toEqual([
      ['Areas/AI', { iconName: 'TiRobot', iconColor: 'blue' }],
    ]);
  });

  it('ignores unchanged paths and the settings key', () => {
    const previous = { settings: { fontSize: 1 }, 'Areas/AI': 'TiRobot' };
    const next = { settings: { fontSize: 2 }, 'Areas/AI': 'TiRobot' };

    const result = diffIconData(previous, next);

    expect(result.changed).toEqual([]);
    expect(result.removed).toEqual([]);
  });
});
