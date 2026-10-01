import { beforeEach, describe, expect, it, vi } from 'vitest';
import dom from './dom';
import {
  getFolderNoteFolderPath,
  getFrontmatterIcon,
  refreshFolderIconsAfterRename,
  syncFolderNoteIcon,
} from './folder-note';

describe('getFolderNoteFolderPath', () => {
  describe('when the note is named after its folder', () => {
    it('returns the folder path', () => {
      expect(getFolderNoteFolderPath('Areas/AI/AI.md')).toBe('Areas/AI');
    });

    it('returns the folder path for a top-level folder', () => {
      expect(getFolderNoteFolderPath('AI/AI.md')).toBe('AI');
    });
  });

  describe('when the note is not named after its folder', () => {
    it('returns null', () => {
      expect(getFolderNoteFolderPath('Areas/AI/Prompts.md')).toBeNull();
    });
  });

  describe('when the note is at the vault root', () => {
    it('returns null', () => {
      expect(getFolderNoteFolderPath('AI.md')).toBeNull();
    });
  });

  describe('when the file is not Markdown', () => {
    it('returns null', () => {
      expect(getFolderNoteFolderPath('Areas/AI/AI.canvas')).toBeNull();
    });
  });
});

const createPlugin = ({
  data = {},
  folders = [],
  notes = {},
  rules = [],
  iconInFrontmatterEnabled = true,
}: {
  data?: Record<string, unknown>;
  folders?: string[];
  notes?: Record<string, Record<string, unknown>>;
  rules?: unknown[];
  iconInFrontmatterEnabled?: boolean;
} = {}): any => ({
  app: {
    vault: {
      getAbstractFileByPath: (path: string) =>
        folders.includes(path)
          ? { path, children: [] as unknown[] }
          : path in notes
            ? { path }
            : null,
    },
    metadataCache: {
      getFileCache: (file: { path: string }) => ({
        frontmatter: notes[file.path],
      }),
    },
  },
  getData: () => data,
  getSettings: () => ({
    iconInFrontmatterEnabled,
    iconInFrontmatterFieldName: 'icon',
    iconColorInFrontmatterFieldName: 'iconColor',
    rules,
  }),
});

let createIconNode: ReturnType<typeof vi.spyOn>;
let removeIconInPath: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  createIconNode = vi.spyOn(dom, 'createIconNode').mockReturnValue(true);
  removeIconInPath = vi
    .spyOn(dom, 'removeIconInPath')
    .mockImplementation(() => {});
});

describe('getFrontmatterIcon', () => {
  describe('when the frontmatter has an icon and a color', () => {
    it('returns them', () => {
      const plugin = createPlugin({
        notes: { 'AI/AI.md': { icon: 'LiBot', iconColor: 'red' } },
      });

      expect(getFrontmatterIcon(plugin, { path: 'AI/AI.md' } as any)).toEqual({
        iconName: 'LiBot',
        iconColor: 'red',
      });
    });
  });

  describe('when the color is a bare hexadecimal value', () => {
    it('converts it to a CSS color', () => {
      const plugin = createPlugin({
        notes: { 'AI/AI.md': { icon: 'LiBot', iconColor: 'ff0000' } },
      });

      expect(
        getFrontmatterIcon(plugin, { path: 'AI/AI.md' } as any).iconColor,
      ).toBe('#ff0000');
    });
  });

  describe('when the fields are not text', () => {
    it('returns no icon or color', () => {
      const plugin = createPlugin({
        notes: { 'AI/AI.md': { icon: 42, iconColor: 7 } },
      });

      expect(getFrontmatterIcon(plugin, { path: 'AI/AI.md' } as any)).toEqual({
        iconName: undefined,
        iconColor: undefined,
      });
    });
  });

  describe('when icons in frontmatter are disabled', () => {
    it('returns no icon or color', () => {
      const plugin = createPlugin({
        notes: { 'AI/AI.md': { icon: 'LiBot' } },
        iconInFrontmatterEnabled: false,
      });

      expect(getFrontmatterIcon(plugin, { path: 'AI/AI.md' } as any)).toEqual({
        iconName: undefined,
        iconColor: undefined,
      });
    });
  });
});

describe('syncFolderNoteIcon', () => {
  describe('when the folder note has an icon', () => {
    it('adds the icon to the folder', () => {
      const plugin = createPlugin();

      syncFolderNoteIcon(plugin, 'Areas/AI/AI.md', 'LiBot', '#fff');

      expect(createIconNode).toHaveBeenCalledWith(plugin, 'Areas/AI', 'LiBot', {
        color: '#fff',
      });
    });
  });

  describe('when the folder note has no icon', () => {
    describe('when the folder has no icon of its own', () => {
      it('removes the folder icon', () => {
        syncFolderNoteIcon(createPlugin(), 'Areas/AI/AI.md', undefined);

        expect(removeIconInPath).toHaveBeenCalledWith('Areas/AI');
      });
    });

    describe('when the folder has its own icon as a string', () => {
      let plugin: any;

      beforeEach(() => {
        plugin = createPlugin({ data: { 'Areas/AI': 'LiBrain' } });
        syncFolderNoteIcon(plugin, 'Areas/AI/AI.md', undefined);
      });

      it('restores the folder icon', () => {
        expect(createIconNode).toHaveBeenCalledWith(
          plugin,
          'Areas/AI',
          'LiBrain',
          { color: undefined },
        );
      });

      it('does not remove the folder icon', () => {
        expect(removeIconInPath).not.toHaveBeenCalled();
      });
    });

    describe('when the folder has its own icon with a color', () => {
      it('restores the folder icon and color', () => {
        const plugin = createPlugin({
          data: { 'Areas/AI': { iconName: 'LiBrain', iconColor: '#000' } },
        });

        syncFolderNoteIcon(plugin, 'Areas/AI/AI.md', undefined);

        expect(createIconNode).toHaveBeenCalledWith(
          plugin,
          'Areas/AI',
          'LiBrain',
          { color: '#000' },
        );
      });
    });

    describe('when a custom rule applies to the folder', () => {
      it('restores the icon of the custom rule', () => {
        const plugin = createPlugin({
          rules: [
            { rule: 'AI', icon: 'LiSparkles', color: '#0f0', for: 'folders' },
          ],
        });

        syncFolderNoteIcon(plugin, 'Areas/AI/AI.md', undefined);

        expect(createIconNode).toHaveBeenCalledWith(
          plugin,
          'Areas/AI',
          'LiSparkles',
          { color: '#0f0' },
        );
      });
    });

    describe('when a custom rule applies only to files', () => {
      it('removes the folder icon', () => {
        const plugin = createPlugin({
          rules: [{ rule: 'AI', icon: 'LiSparkles', for: 'files' }],
        });

        syncFolderNoteIcon(plugin, 'Areas/AI/AI.md', undefined);

        expect(removeIconInPath).toHaveBeenCalledWith('Areas/AI');
      });
    });
  });

  describe('when the note is not a folder note', () => {
    beforeEach(() => {
      syncFolderNoteIcon(createPlugin(), 'Areas/AI/Prompts.md', 'LiBot');
    });

    it('does not add an icon', () => {
      expect(createIconNode).not.toHaveBeenCalled();
    });

    it('does not remove an icon', () => {
      expect(removeIconInPath).not.toHaveBeenCalled();
    });
  });
});

describe('refreshFolderIconsAfterRename', () => {
  describe('when a folder note is renamed to match its folder', () => {
    let plugin: any;

    beforeEach(() => {
      plugin = createPlugin({
        folders: ['Areas/ML'],
        notes: { 'Areas/ML/ML.md': { icon: 'LiBot', iconColor: '#fff' } },
      });
    });

    it('adds the icon of the folder note to the folder', () => {
      refreshFolderIconsAfterRename(plugin, 'Areas/ML/ML.md', 'Areas/ML/AI.md');

      expect(createIconNode).toHaveBeenCalledWith(plugin, 'Areas/ML', 'LiBot', {
        color: '#fff',
      });
    });
  });

  describe('when a folder is renamed away from its folder note', () => {
    let plugin: any;

    beforeEach(() => {
      plugin = createPlugin({
        folders: ['Areas/ML'],
        notes: { 'Areas/ML/AI.md': { icon: 'LiBot' } },
      });
    });

    it('removes the icon from the folder', () => {
      refreshFolderIconsAfterRename(plugin, 'Areas/ML/AI.md', 'Areas/AI/AI.md');

      expect(removeIconInPath).toHaveBeenCalledWith('Areas/ML');
    });
  });

  describe('when a folder note is moved out of its folder', () => {
    let plugin: any;

    beforeEach(() => {
      plugin = createPlugin({
        data: { 'Areas/AI': 'LiBrain' },
        folders: ['Areas/AI', 'Archive'],
        notes: { 'Archive/AI.md': { icon: 'LiBot' } },
      });
    });

    it('falls back to the icon of the old folder', () => {
      refreshFolderIconsAfterRename(plugin, 'Archive/AI.md', 'Areas/AI/AI.md');

      expect(createIconNode).toHaveBeenCalledWith(
        plugin,
        'Areas/AI',
        'LiBrain',
        { color: undefined },
      );
    });
  });

  describe('when a folder with a folder note is renamed', () => {
    let plugin: any;

    beforeEach(() => {
      plugin = createPlugin({
        folders: ['Areas/AI'],
        notes: { 'Areas/AI/AI.md': { icon: 'LiBot' } },
      });
    });

    it('refreshes the renamed folder', () => {
      refreshFolderIconsAfterRename(plugin, 'Areas/AI', 'Areas/ML');

      expect(createIconNode).toHaveBeenCalledWith(plugin, 'Areas/AI', 'LiBot', {
        color: undefined,
      });
    });
  });

  describe('when the old folder no longer exists', () => {
    beforeEach(() => {
      refreshFolderIconsAfterRename(createPlugin(), 'AI.md', 'Areas/AI/AI.md');
    });

    it('does not add an icon', () => {
      expect(createIconNode).not.toHaveBeenCalled();
    });

    it('does not remove an icon', () => {
      expect(removeIconInPath).not.toHaveBeenCalled();
    });
  });
});
