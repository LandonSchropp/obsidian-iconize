import { beforeEach, describe, expect, it, vi } from 'vitest';
import dom from './dom';
import { getFolderNoteFolderPath, syncFolderNoteIcon } from './folder-note';

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

describe('syncFolderNoteIcon', () => {
  let data: Record<string, unknown>;
  let plugin: any;
  let createIconNode: ReturnType<typeof vi.spyOn>;
  let removeIconInPath: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    data = {};
    plugin = { getData: () => data };
    createIconNode = vi.spyOn(dom, 'createIconNode').mockReturnValue(true);
    removeIconInPath = vi
      .spyOn(dom, 'removeIconInPath')
      .mockImplementation(() => {});
  });

  describe('when the folder note has an icon', () => {
    it('adds the icon to the folder', () => {
      syncFolderNoteIcon(plugin, 'Areas/AI/AI.md', 'LiBot', '#fff');

      expect(createIconNode).toHaveBeenCalledWith(plugin, 'Areas/AI', 'LiBot', {
        color: '#fff',
      });
    });
  });

  describe('when the folder note has no icon', () => {
    describe('when the folder has no icon of its own', () => {
      it('removes the folder icon', () => {
        syncFolderNoteIcon(plugin, 'Areas/AI/AI.md', undefined);

        expect(removeIconInPath).toHaveBeenCalledWith('Areas/AI');
      });
    });

    describe('when the folder has its own icon as a string', () => {
      it('restores the folder icon', () => {
        data['Areas/AI'] = 'LiBrain';

        syncFolderNoteIcon(plugin, 'Areas/AI/AI.md', undefined);

        expect(createIconNode).toHaveBeenCalledWith(
          plugin,
          'Areas/AI',
          'LiBrain',
        );
        expect(removeIconInPath).not.toHaveBeenCalled();
      });
    });

    describe('when the folder has its own icon with a color', () => {
      it('restores the folder icon and color', () => {
        data['Areas/AI'] = { iconName: 'LiBrain', iconColor: '#000' };

        syncFolderNoteIcon(plugin, 'Areas/AI/AI.md', undefined);

        expect(createIconNode).toHaveBeenCalledWith(
          plugin,
          'Areas/AI',
          'LiBrain',
          { color: '#000' },
        );
      });
    });
  });

  describe('when the note is not a folder note', () => {
    it('does nothing', () => {
      syncFolderNoteIcon(plugin, 'Areas/AI/Prompts.md', 'LiBot');

      expect(createIconNode).not.toHaveBeenCalled();
      expect(removeIconInPath).not.toHaveBeenCalled();
    });
  });
});
