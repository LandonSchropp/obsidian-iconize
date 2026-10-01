import type IconizePlugin from '@app/main';
import type { FolderIconObject } from '@app/main';
import dom from './dom';

/**
 * Returns the folder a folder note belongs to, or `null` if the path isn't a
 * folder note. A folder note is a Markdown file named after the folder it sits
 * in (e.g. `Areas/AI/AI.md` for `Areas/AI`).
 */
const getFolderNoteFolderPath = (path: string): string | null => {
  return path.match(/^((?:.*\/)?([^/]+))\/\2\.md$/)?.[1] ?? null;
};

/**
 * Mirrors a folder note's icon onto its folder in the file explorer. When the
 * note has no icon, the folder falls back to its own icon, if it has one.
 * Does nothing for other notes.
 */
const syncFolderNoteIcon = (
  plugin: IconizePlugin,
  path: string,
  iconName: string | undefined,
  color?: string,
): void => {
  const folderPath = getFolderNoteFolderPath(path);
  if (!folderPath) {
    return;
  }

  if (iconName) {
    dom.createIconNode(plugin, folderPath, iconName, { color });
    return;
  }

  const folderIcon = plugin.getData()[folderPath] as
    | string
    | FolderIconObject
    | undefined;
  if (typeof folderIcon === 'string') {
    dom.createIconNode(plugin, folderPath, folderIcon);
  } else if (folderIcon?.iconName) {
    dom.createIconNode(plugin, folderPath, folderIcon.iconName, {
      color: folderIcon.iconColor,
    });
  } else {
    dom.removeIconInPath(folderPath);
  }
};

export { getFolderNoteFolderPath, syncFolderNoteIcon };
