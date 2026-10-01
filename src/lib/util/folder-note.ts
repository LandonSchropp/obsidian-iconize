import type IconizePlugin from '@app/main';
import type { FolderIconObject } from '@app/main';
import type { TFile } from 'obsidian';
import { isHexadecimal, stringToHex } from '@app/util';
import customRule from '../custom-rule';
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
 * Reads a note's icon and color from its frontmatter. Fields that aren't text
 * are ignored, and a bare hexadecimal color becomes a CSS color.
 */
const getFrontmatterIcon = (
  plugin: IconizePlugin,
  file: TFile,
): { iconName?: string; iconColor?: string } => {
  const settings = plugin.getSettings();
  const frontmatter = settings.iconInFrontmatterEnabled
    ? plugin.app.metadataCache.getFileCache(file)?.frontmatter
    : undefined;
  const iconName = frontmatter?.[settings.iconInFrontmatterFieldName];
  const iconColor = frontmatter?.[settings.iconColorInFrontmatterFieldName];

  return {
    iconName: typeof iconName === 'string' ? iconName : undefined,
    iconColor:
      typeof iconColor !== 'string'
        ? undefined
        : isHexadecimal(iconColor)
          ? stringToHex(iconColor)
          : iconColor,
  };
};

/**
 * Returns the icon a folder has without its folder note: its own icon, or else
 * the icon of the first custom rule that applies to it.
 */
const getOwnFolderIcon = (
  plugin: IconizePlugin,
  folderPath: string,
): { iconName: string; color?: string } | undefined => {
  const folderIcon = plugin.getData()[folderPath] as
    | string
    | FolderIconObject
    | undefined;
  if (typeof folderIcon === 'string') {
    return { iconName: folderIcon };
  }
  if (folderIcon?.iconName) {
    return { iconName: folderIcon.iconName, color: folderIcon.iconColor };
  }

  const rule = customRule
    .getSortedRules(plugin)
    .find(
      (rule) =>
        customRule.doesMatchFileType(rule, 'folder') &&
        customRule.doesMatchPath(rule, folderPath),
    );
  return rule ? { iconName: rule.icon, color: rule.color } : undefined;
};

/**
 * Mirrors a folder note's icon onto its folder in the file explorer. When the
 * note has no icon, the folder falls back to the icon it has without it.
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

  const ownIcon = getOwnFolderIcon(plugin, folderPath);
  if (ownIcon) {
    dom.createIconNode(plugin, folderPath, ownIcon.iconName, {
      color: ownIcon.color,
    });
  } else {
    dom.removeIconInPath(folderPath);
  }
};

/**
 * Sets a folder's icon from its folder note, falling back to the icon it has
 * without it. Does nothing when the path isn't an existing folder.
 */
const refreshFolderIcon = (plugin: IconizePlugin, folderPath: string): void => {
  if (!folderPath) {
    return;
  }

  const folder = plugin.app.vault.getAbstractFileByPath(folderPath);
  if (!folder || !('children' in folder)) {
    return;
  }

  const notePath = `${folderPath}/${folderPath.split('/').pop()}.md`;
  const note = plugin.app.vault.getAbstractFileByPath(notePath);
  const { iconName, iconColor } = note
    ? getFrontmatterIcon(plugin, note as TFile)
    : {};

  syncFolderNoteIcon(plugin, notePath, iconName, iconColor);
};

/**
 * Refreshes the icons of every folder a rename touches: the renamed path itself
 * when it's a folder, and the old and new parent folders.
 */
const refreshFolderIconsAfterRename = (
  plugin: IconizePlugin,
  path: string,
  oldPath: string,
): void => {
  const getParentPath = (path: string) =>
    path.substring(0, path.lastIndexOf('/'));

  for (const folderPath of new Set([
    path,
    getParentPath(path),
    getParentPath(oldPath),
  ])) {
    refreshFolderIcon(plugin, folderPath);
  }
};

export {
  getFolderNoteFolderPath,
  getFrontmatterIcon,
  refreshFolderIconsAfterRename,
  syncFolderNoteIcon,
};
