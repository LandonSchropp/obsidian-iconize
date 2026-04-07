import { describe, it, expect, vi } from 'vitest';
import { IconPackManager } from '.';
import IconizePlugin from '@app/main';

const ICONS_PATH = '.obsidian/icons';

const makePlugin = (adapterOverrides: Record<string, unknown> = {}) =>
  ({
    app: {
      vault: {
        adapter: {
          list: vi.fn(),
          exists: vi.fn().mockResolvedValue(true),
          read: vi.fn(),
          readBinary: vi.fn(),
          mkdir: vi.fn(),
          write: vi.fn(),
          ...adapterOverrides,
        },
      },
    },
    getSettings: vi.fn(() => ({ iconsBackgroundCheckEnabled: false })),
    doesUseNativeLucideIconPack: vi.fn(() => false),
    doesUseCustomLucideIconPack: vi.fn(() => false),
    getIconPackManager: vi.fn(),
  }) as unknown as IconizePlugin;

describe('IconPackManager.loadAll', () => {
  it('should load icons from a custom directory pack into the icon pack', async () => {
    const svgContent = '<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>';

    const plugin = makePlugin({
      list: vi.fn((path: string) => {
        if (path === ICONS_PATH) {
          return Promise.resolve({
            files: [],
            folders: [`${ICONS_PATH}/landon`],
          });
        }
        if (path === `${ICONS_PATH}/landon`) {
          return Promise.resolve({
            files: [`${ICONS_PATH}/landon/CalendarTuesday.svg`],
            folders: [],
          });
        }
        return Promise.resolve({ files: [], folders: [] });
      }),
      read: vi.fn().mockResolvedValue(svgContent),
    });

    const manager = new IconPackManager(plugin, ICONS_PATH);
    await manager.loadAll();

    const landonPack = manager.getIconPackByName('landon');
    expect(landonPack).toBeDefined();
    expect(landonPack.getIcons()).toHaveLength(1);
    expect(landonPack.getIcons()[0].name).toBe('CalendarTuesday');
  });
});
