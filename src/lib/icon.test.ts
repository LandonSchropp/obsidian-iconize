import { it, describe, beforeEach, expect, vi } from 'vitest';
import icon from './icon';
import customRule from './custom-rule';
import dom from './util/dom';

vi.mock('obsidian', () => ({
  requireApiVersion: () => false,
}));

describe('getAllWithPath', () => {
  let plugin: any;
  beforeEach(() => {
    vi.restoreAllMocks();
    plugin = {
      getSettings: () => ({
        rules: [
          {
            icon: 'IbRuleTest',
            rule: 'folder',
          },
        ],
      }),
      getData: () => ({
        folder: 'IbTest',
      }),
    };
  });

  it('should return empty array when no icons are found', () => {
    plugin.getData = () => ({});
    plugin.getSettings = () => ({ rules: [] }) as any;
    const result = icon.getAllWithPath(plugin);
    expect(result).toEqual([]);
  });

  it('should return normal without custom rules', () => {
    plugin.getSettings = () => ({ rules: [] }) as any;
    const result = icon.getAllWithPath(plugin);
    expect(result).toEqual([
      {
        icon: 'IbTest',
        path: 'folder',
      },
    ]);
  });

  it('should return custom rule icon if icon was found in custom rules', () => {
    plugin.getData = () => ({});
    const result = icon.getAllWithPath(plugin);
    expect(result).toEqual([
      {
        icon: 'IbRuleTest',
        path: 'folder',
      },
    ]);
  });
});

describe('getByPath', () => {
  let plugin: any;
  beforeEach(() => {
    plugin = {
      getData: () => ({
        folder: 'IbTest',
        folderObj: {
          iconName: 'IbTest',
        },
      }),
    };
  });

  it('should return `undefined` when path is `settings` or `migrated', () => {
    expect(icon.getByPath({} as any, 'settings')).toBeUndefined();
    expect(icon.getByPath({} as any, 'migrated')).toBeUndefined();
  });

  it('should return the value if value in data of path is a string', () => {
    const result = icon.getByPath(plugin, 'folder');
    expect(result).toBe('IbTest');
  });

  it('should return the `iconName` property if value in data of path is an object', () => {
    const result = icon.getByPath(plugin, 'folderObj');
    expect(result).toBe('IbTest');
  });

  it('should return custom rule icon if icon was found in custom rules', () => {
    vi.spyOn(customRule, 'getSortedRules').mockImplementationOnce(
      () =>
        [
          {
            icon: 'IbTest',
          },
        ] as any,
    );

    const result = icon.getByPath(plugin, 'foo');
    expect(result).toBe('IbTest');
  });

  it('should return `undefined` when no icon is found', () => {
    vi.spyOn(customRule, 'getSortedRules').mockReturnValue([] as any);
    const result = icon.getByPath(plugin, 'foo');
    expect(result).toBe(undefined);
  });
});

describe('getIconByPath', () => {
  let plugin: any;
  beforeEach(() => {
    plugin = {
      getData: () => ({}),
      getSettings: () =>
        ({
          rules: [],
        }) as any,
    };
  });

  it('should return the correct icon for a given path', () => {
    const getIconPackByPrefix = vi.fn().mockImplementationOnce(() => ({
      getIcon: vi.fn(() => 'IbTest'),
    }));

    const newPlugin = {
      ...plugin,
      getIconPackManager: () => ({
        getIconPackByPrefix,
      }),
      getData: () => ({
        folder: 'IbTest',
      }),
    };
    const result = icon.getIconByPath(newPlugin, 'folder');
    expect(result).toBe('IbTest');
  });

  it('should return emoji for a given path', () => {
    plugin.getData = () => ({
      folder: '😁',
    });
    const result = icon.getIconByPath(plugin, 'folder');
    expect(result).toBe('😁');
  });

  it('should return `null` when no icon was found', () => {
    const result = icon.getIconByPath(plugin, 'foo');
    expect(result).toBeNull();
  });
});

describe('getIconByName', () => {
  const getIcon = vi.fn();
  let plugin: any = {
    getIconPackManager: () => ({
      getIconPackByPrefix: () => ({}),
    }),
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    plugin = {
      ...plugin,
      getIconPackManager: () => ({
        getIconPackByPrefix: () => ({
          getIcon,
        }),
      }),
    };
  });

  it('should return the correct icon for a given name', () => {
    getIcon.mockImplementation(() => 'IbTest');
    const result = icon.getIconByName(plugin, 'IbTest');
    expect(result).toBe('IbTest');
  });

  it('should return `null` when no icon was found', () => {
    getIcon.mockReturnValueOnce(null);
    const result = icon.getIconByName(plugin, 'IbFoo');
    expect(result).toBe(null);
  });
});

describe('addAll', () => {
  const createFileItem = (path: string, titleClass: string) => {
    const el = document.createElement('div');
    el.setAttribute('data-path', path);
    el.innerHTML = `<div class="${titleClass}"></div>`;
    // Obsidian adds `createDiv` to every element at runtime.
    (el as any).createDiv = () => document.createElement('div');
    document.body.append(el);
    return { selfEl: el, innerEl: el.firstElementChild };
  };

  const createPlugin = (fileItems: Record<string, unknown>): any => ({
    app: {
      workspace: {
        getLeavesOfType: (type: string) =>
          type === 'file-explorer' ? [{ view: { fileItems } }] : [],
      },
    },
    getSettings: () => ({ iconInTabsEnabled: false, rules: [] as any[] }),
  });

  let plugin: any;
  let setIconForNode: ReturnType<typeof vi.spyOn>;
  let createIconNode: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    plugin = createPlugin({
      'Areas/AI': createFileItem('Areas/AI', 'nav-folder-title-content'),
      'Areas/AI/AI.md': createFileItem(
        'Areas/AI/AI.md',
        'nav-file-title-content',
      ),
    });
    setIconForNode = vi
      .spyOn(dom, 'setIconForNode')
      .mockImplementation(() => {});
    createIconNode = vi.spyOn(dom, 'createIconNode').mockReturnValue(true);
  });

  describe('when the data contains a folder note', () => {
    it('adds the icon of the folder note to its folder', () => {
      icon.addAll(plugin, [['Areas/AI/AI.md', 'LiBot']], new WeakSet());

      expect(createIconNode).toHaveBeenCalledWith(plugin, 'Areas/AI', 'LiBot', {
        color: undefined,
      });
    });

    describe('when the folder also has its own icon', () => {
      it('uses the icon of the folder note', () => {
        icon.addAll(
          plugin,
          [
            ['Areas/AI/AI.md', 'LiBot'],
            ['Areas/AI', 'LiBrain'],
          ],
          new WeakSet(),
        );

        expect(setIconForNode).toHaveBeenCalledWith(
          plugin,
          'LiBrain',
          expect.anything(),
          { color: undefined },
        );
        expect(createIconNode).toHaveBeenCalledWith(
          plugin,
          'Areas/AI',
          'LiBot',
          { color: undefined },
        );
        expect(createIconNode.mock.invocationCallOrder[0]).toBeGreaterThan(
          setIconForNode.mock.invocationCallOrder.at(-1)!,
        );
      });
    });
  });
});
