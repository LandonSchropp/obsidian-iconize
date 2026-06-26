import {
  Plugin,
  MenuItem,
  TFile,
  WorkspaceLeaf,
  requireApiVersion,
  MarkdownView,
  Notice,
} from 'obsidian';
import {
  EditorWithEditorComponent,
  ExplorerView,
  InlineTitleView,
  TabHeaderLeaf,
} from './@types/obsidian';
import IconsPickerModal from './ui/icons-picker-modal';
import { DEFAULT_SETTINGS, IconFolderSettings } from '@app/settings/data';
import { migrate } from '@app/migrations';
import IconFolderSettingsUI from './settings/ui';
import StarredInternalPlugin from './internal-plugins/starred';
import InternalPluginInjector from './@types/internal-plugin-injector';
import iconTabs from './lib/icon-tabs';
import dom from './lib/util/dom';
import customRule from './lib/custom-rule';
import icon from './lib/icon';
import BookmarkInternalPlugin from './internal-plugins/bookmark';
import OutlineInternalPlugin from './internal-plugins/outline';
import {
  getAllOpenedFiles,
  isHexadecimal,
  removeIconFromIconPack,
  saveIconToIconPack,
  stringToHex,
} from '@app/util';
import config from '@app/config';
import titleIcon from './lib/icon-title';
import SuggestionIcon from './editor/icons-suggestion';
import emoji from './emoji';
import { IconCache } from './lib/icon-cache';
import {
  buildIconInLinksPlugin,
  buildIconInTextPlugin,
} from './editor/live-preview';
import { PositionField, buildPositionField } from './editor/live-preview/state';
import { calculateInlineTitleSize } from './lib/util/text';
import { mergePathEntriesFromDisk } from './lib/data-merge';
import {
  processIconInTextMarkdown,
  processIconInLinkMarkdown,
} from './editor/markdown-processors';
import ChangeColorModal from './ui/change-color-modal';
import { logger } from './lib/logger';
import { EventEmitter } from './lib/event/event';
import IconizeAPI, { getApi } from './lib/api';
import { Icon, IconPackManager } from './icon-pack-manager';
import {
  getNormalizedName,
  getSvgFromLoadedIcon,
  nextIdentifier,
} from './icon-pack-manager/util';

export interface FolderIconObject {
  iconName: string | null;
  iconColor?: string;
}

export default class IconizePlugin extends Plugin {
  private data: Record<
    string,
    boolean | string | IconFolderSettings | FolderIconObject
  >;
  private registeredFileExplorers = new Set<ExplorerView>();

  private modifiedInternalPlugins: InternalPluginInjector[] = [];

  public positionField: PositionField = buildPositionField(this);

  private frontmatterCache = new Set<string>();
  private eventEmitter = new EventEmitter();

  private iconPackManager: IconPackManager;

  public api: IconizeAPI;

  public getUsedIcons(): Set<string> {
    // Used icons in paths.
    const usedIconsInPaths = icon
      .getAllWithPath(this)
      .map((value) => value.icon);

    // Used icons in rules.
    const customRules = customRule.getSortedRules(this);
    const usedIconsInCustomRules = customRules.map(
      (customRule) => customRule.icon,
    );

    return new Set([...usedIconsInPaths, ...usedIconsInCustomRules]);
  }

  async onload() {
    console.log(`loading ${config.PLUGIN_NAME}`);

    await this.loadIconFolderData();
    logger.toggleLogging(this.getSettings().debugMode);
    this.iconPackManager = new IconPackManager(
      this,
      this.getSettings().iconPacksPath,
    );

    this.api = getApi(this);

    if (this.getSettings().useInternalPlugins) {
      // Registers all modified internal plugins.
      // Only adds star plugin for obsidian under v0.12.6.
      if (!requireApiVersion('0.12.6')) {
        this.modifiedInternalPlugins.push(new StarredInternalPlugin(this));
      } else if (requireApiVersion('1.2.0')) {
        this.modifiedInternalPlugins.push(new BookmarkInternalPlugin(this));
      }

      this.modifiedInternalPlugins.push(new OutlineInternalPlugin(this));
    }

    await this.iconPackManager.createDefaultDirectory();
    await this.checkRecentlyUsedIcons();

    await migrate(this);

    const usedIconNames = this.getUsedIcons();
    // if (!this.doesUseCustomLucideIconPack()) {
    await this.iconPackManager.init();
    // }
    // Load all icons from zip files into memory before trying to load used icons.
    // This ensures icons are available even if .svg cache files don't sync (e.g., mobile).
    await this.iconPackManager.loadAll();
    // TODO: Check if needed
    await this.iconPackManager.loadUsedIcons([...usedIconNames]);

    this.app.workspace.onLayoutReady(() => this.handleChangeLayout());

    this.addCommand({
      id: 'iconize:set-icon-for-file',
      name: 'Set icon for file',
      hotkeys: [
        {
          modifiers: ['Mod', 'Shift'],
          key: 'j',
        },
      ],
      editorCallback: async (editor: EditorWithEditorComponent) => {
        const file = editor.editorComponent?.file;
        if (!file) {
          logger.warn(
            `'editor.editorComponent?.file' is undefined for file: ${file}`,
          );
          return;
        }

        const modal = new IconsPickerModal(this.app, this, file.path);
        modal.open();

        modal.onSelect = (iconName: string): void => {
          IconCache.getInstance().set(file.path, {
            iconNameWithPrefix: iconName,
          });

          // Update icon in tab when setting is enabled.
          if (this.getSettings().iconInTabsEnabled) {
            const tabLeaves = iconTabs.getTabLeavesOfFilePath(this, file.path);
            for (const tabLeaf of tabLeaves) {
              iconTabs.update(this, iconName, tabLeaf.tabHeaderInnerIconEl);
            }
          }

          // Update icon in title when setting is enabled.
          if (this.getSettings().iconInTitleEnabled) {
            this.addIconInTitle(iconName);
          }
        };
      },
    });

    this.registerEvent(
      // Registering file menu event for listening to file pinning and unpinning.
      this.app.workspace.on('file-menu', (menu, file) => {
        // I've researched other ways of doing this. However, there is no other way to listen to file pinning and unpinning.
        menu.onHide(() => {
          const path = file.path;
          if (this.getSettings().iconInTabsEnabled) {
            for (const openedFile of getAllOpenedFiles(this)) {
              if (openedFile.path === path) {
                const possibleIcon = IconCache.getInstance().get(path);
                if (!possibleIcon) {
                  return;
                }
                const tabLeaves = iconTabs.getTabLeavesOfFilePath(
                  this,
                  file.path,
                );
                for (const tabLeaf of tabLeaves) {
                  // Add timeout to ensure that the default icon is already set.
                  setTimeout(() => {
                    iconTabs.add(this, file.path, tabLeaf.tabHeaderInnerIconEl);
                  }, 5);
                }
              }
            }
          }
        });
      }),
    );

    this.registerEvent(
      this.app.workspace.on('layout-change', () => this.handleChangeLayout()),
    );

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file: TFile) => {
        const addIconMenuItem = (item: MenuItem) => {
          item.setTitle('Change icon');
          item.setIcon('hashtag');
          item.onClick(() => {
            const modal = new IconsPickerModal(this.app, this, file.path);
            modal.open();

            modal.onSelect = (iconName: string): void => {
              IconCache.getInstance().set(file.path, {
                iconNameWithPrefix: iconName,
              });

              // Update icon in tab when setting is enabled.
              if (this.getSettings().iconInTabsEnabled) {
                const tabLeaves = iconTabs.getTabLeavesOfFilePath(
                  this,
                  file.path,
                );
                for (const tabLeaf of tabLeaves) {
                  iconTabs.update(this, iconName, tabLeaf.tabHeaderInnerIconEl);
                }
              }

              // Update icon in title when setting is enabled.
              if (this.getSettings().iconInTitleEnabled) {
                this.addIconInTitle(iconName);
              }
            };
          });
        };

        const removeIconMenuItem = (item: MenuItem) => {
          item.setTitle('Remove icon');
          item.setIcon('trash');
          item.onClick(async () => {
            await this.removeSingleIcon(file);
          });
        };

        const changeColorOfIcon = (item: MenuItem) => {
          item.setTitle('Change color of icon');
          item.setIcon('palette');
          item.onClick(() => {
            const modal = new ChangeColorModal(this.app, this, file.path);
            modal.open();
          });
        };

        menu.addItem(addIconMenuItem);

        const filePathData = this.getData()[file.path];
        const hasNestedIcon =
          typeof filePathData === 'object' &&
          (filePathData as FolderIconObject).iconName !== null;
        // Only add remove icon menu item when the file path exists in the data.
        // We do not want to show this menu item for e.g. custom rules.
        if (
          filePathData &&
          (typeof filePathData === 'string' || hasNestedIcon)
        ) {
          const icon =
            typeof filePathData === 'string'
              ? filePathData
              : (filePathData as FolderIconObject).iconName;
          if (!emoji.isEmoji(icon)) {
            menu.addItem(changeColorOfIcon);
          }

          menu.addItem(removeIconMenuItem);
        }
      }),
    );

    // deleting event
    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        const path = file.path;
        this.removeFolderIcon(path);
      }),
    );

    // renaming event
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        // Check if the file was moved and had an icon before.
        const dataPoint = this.data[oldPath];
        if (dataPoint && oldPath !== 'settings') {
          const iconNameWithPrefix =
            typeof dataPoint === 'object'
              ? (dataPoint as FolderIconObject).iconName
              : (dataPoint as string);
          dom.createIconNode(this, file.path, iconNameWithPrefix);
        }

        this.renameFolder(file.path, oldPath);
      }),
    );

    // Creation event. Fires for both manual creates and files arriving via
    // Obsidian Sync from another device. The metadataCache `resolve` handler
    // may run before the file-explorer has painted the new row, in which case
    // dom.createIconNode silently no-ops. This handler is the backstop: it
    // waits one paint and tries again.
    this.registerEvent(
      this.app.vault.on('create', (file) => {
        if (!(file instanceof TFile)) return;
        if (!this.getSettings().iconInFrontmatterEnabled) return;

        requestAnimationFrame(() => {
          if (
            document.querySelector(`[data-path="${file.path}"] .iconize-icon`)
          ) {
            return;
          }

          const fileCache = this.app.metadataCache.getFileCache(file);
          const iconFrontmatterName =
            this.getSettings().iconInFrontmatterFieldName;
          const iconName = fileCache?.frontmatter?.[iconFrontmatterName];
          if (typeof iconName !== 'string' || !iconName) return;

          const iconColorFrontmatterName =
            this.getSettings().iconColorInFrontmatterFieldName;
          const rawColor = fileCache?.frontmatter?.[iconColorFrontmatterName];
          const iconColor = typeof rawColor === 'string' ? rawColor : undefined;

          const attached = dom.createIconNode(this, file.path, iconName, {
            color: iconColor,
          });
          if (attached) {
            IconCache.getInstance().set(file.path, {
              iconNameWithPrefix: iconName,
              iconColor,
            });
          }
        });
      }),
    );

    if (this.getSettings().iconsInNotesEnabled) {
      this.registerMarkdownPostProcessor((el) =>
        processIconInTextMarkdown(this, el),
      );
      this.registerEditorSuggest(new SuggestionIcon(this.app, this));
      this.registerEditorExtension([
        this.positionField,
        buildIconInTextPlugin(this),
      ]);
    }

    if (this.getSettings().iconsInLinksEnabled) {
      this.registerMarkdownPostProcessor((el, ctx) =>
        processIconInLinkMarkdown(this, el, ctx),
      );
      this.registerEditorExtension([
        this.positionField,
        buildIconInLinksPlugin(this),
      ]);
    }

    this.addSettingTab(new IconFolderSettingsUI(this.app, this));
  }

  public notifyPlugins(): void {
    this.modifiedInternalPlugins.forEach((internalPlugin) => {
      if (internalPlugin.enabled) {
        internalPlugin.onMount();
      }
    });
  }

  private async removeSingleIcon(file: TFile): Promise<void> {
    this.removeFolderIcon(file.path);
    dom.removeIconInPath(file.path);
    IconCache.getInstance().invalidate(file.path);
    this.notifyPlugins();

    let didUpdate = false;

    // Refreshes the icon tab and title icon for custom rules.
    for (const rule of customRule.getSortedRules(this)) {
      const applicable = await customRule.isApplicable(this, rule, file.path);
      if (applicable) {
        customRule.add(this, rule, file);
        this.addIconInTitle(rule.icon);
        const tabLeaves = iconTabs.getTabLeavesOfFilePath(this, file.path);
        for (const tabLeaf of tabLeaves) {
          iconTabs.add(this, file.path, tabLeaf.tabHeaderInnerIconEl, {
            iconName: rule.icon,
          });
        }
        didUpdate = true;
        break;
      }
    }

    // Only remove icon above titles and icon in tabs if no custom rule was found.
    if (!didUpdate) {
      // Refreshes icons above title and icons in tabs.
      for (const openedFile of getAllOpenedFiles(this)) {
        if (this.getSettings().iconInTitleEnabled) {
          titleIcon.remove(
            (openedFile.leaf.view as InlineTitleView).inlineTitleEl,
          );
        }
        if (this.getSettings().iconInTabsEnabled) {
          const leaf = openedFile.leaf as TabHeaderLeaf;
          iconTabs.remove(leaf.tabHeaderInnerIconEl, {
            replaceWithDefaultIcon: true,
          });
        }
      }
    }
  }

  private handleChangeLayout(): void {
    // Transform data that are objects to single strings.
    const data = Object.entries(this.data) as [
      string,
      string | FolderIconObject,
    ][];

    this.modifiedInternalPlugins.forEach((internalPlugin) => {
      if (internalPlugin.enabled) {
        internalPlugin.onMount();
        internalPlugin.register();
      }
    });

    icon.addAll(this, data, this.registeredFileExplorers, () => {
      // After initialization of the icon packs, checks the vault for missing icons and
      // adds them.
      this.iconPackManager.loadAll().then(async () => {
        if (this.getSettings().iconsBackgroundCheckEnabled) {
          const data = Object.entries(this.data) as [
            string,
            string | FolderIconObject,
          ][];
          await icon.checkMissingIcons(this, data);
          // TODO: Check if needed
          // resetPreloadedIcons();
        }

        this.eventEmitter.emit('allIconsLoaded');
      });

      if (this.getSettings().iconInFrontmatterEnabled) {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          this.frontmatterCache.add(activeFile.path);
        }
      }

      // Adds the title icon to the active leaf view.
      if (this.getSettings().iconInTitleEnabled) {
        for (const openedFile of getAllOpenedFiles(this)) {
          const iconName = icon.getByPath(this, openedFile.path);
          const activeView = openedFile.leaf.view as InlineTitleView;
          if (activeView instanceof MarkdownView && iconName) {
            let possibleIcon: string = iconName;
            if (!emoji.isEmoji(iconName)) {
              const iconNextIdentifier = nextIdentifier(iconName);
              possibleIcon = getSvgFromLoadedIcon(
                this,
                iconName.substring(0, iconNextIdentifier),
                iconName.substring(iconNextIdentifier),
              );
            }

            if (possibleIcon) {
              titleIcon.add(this, activeView.inlineTitleEl, possibleIcon, {
                fontSize: calculateInlineTitleSize(),
              });
            }
          }
        }
      }

      // Register rename event for adding icons with custom rules to the DOM
      // when file was moved to another directory.
      this.registerEvent(
        this.app.vault.on('rename', async (file, oldPath) => {
          const sortedRules = customRule.getSortedRules(this);

          // Removes possible icons from the renamed file.
          sortedRules.forEach((rule) => {
            if (customRule.doesMatchPath(rule, oldPath)) {
              dom.removeIconInPath(file.path);
            }
          });

          // Adds possible icons to the renamed file.
          sortedRules.forEach((rule) => {
            if (customRule.doesMatchPath(rule, oldPath)) {
              return;
            }

            customRule.add(this, rule, file, undefined);
          });

          // Updates icon tabs for the renamed file.
          for (const rule of customRule.getSortedRules(this)) {
            const applicable = await customRule.isApplicable(
              this,
              rule,
              file.path,
            );
            if (!applicable) {
              continue;
            }

            const openedFiles = getAllOpenedFiles(this);
            const openedFile = openedFiles.find(
              (openedFile) => openedFile.path === file.path,
            );
            if (openedFile) {
              const leaf = openedFile.leaf as TabHeaderLeaf;
              iconTabs.update(this, rule.icon, leaf.tabHeaderInnerIconEl);
            }
            break;
          }
        }),
      );

      // Register `layout-change` event for adding icons to tabs when moving a pane or
      // enabling reading mode.
      this.registerEvent(
        this.app.workspace.on('layout-change', () => {
          if (this.getSettings().iconInTitleEnabled) {
            const activeView =
              this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView) {
              const file = activeView.file;
              const view = (activeView.leaf.view as any).currentMode
                .view as InlineTitleView;
              const iconNameWithPrefix = icon.getByPath(this, file.path);
              if (!iconNameWithPrefix) {
                titleIcon.hide(view.inlineTitleEl);
                return;
              }

              let foundIcon: string = iconNameWithPrefix;
              if (!emoji.isEmoji(foundIcon)) {
                foundIcon = icon.getIconByName(
                  this,
                  iconNameWithPrefix,
                )?.svgElement;
                // Check for preloaded icons if no icon was found when the start up was faster
                // than the loading of the icons.
                if (
                  !foundIcon &&
                  this.iconPackManager.getPreloadedIcons().length > 0
                ) {
                  foundIcon = this.iconPackManager
                    .getPreloadedIcons()
                    .find(
                      (icon) => icon.prefix + icon.name === iconNameWithPrefix,
                    )?.svgElement;
                }
              }

              if (foundIcon) {
                // Removes the node because the editor markdown content is being rerendered
                // when the content mode changes back to editing.
                titleIcon.remove(view.inlineTitleEl);
                titleIcon.add(this, view.inlineTitleEl, foundIcon, {
                  fontSize: calculateInlineTitleSize(),
                });
              }
            }
          }

          if (!this.getSettings().iconInTabsEnabled) {
            return;
          }

          for (const openedFile of getAllOpenedFiles(this)) {
            const leaf = openedFile.leaf as TabHeaderLeaf;
            const iconColor = this.getIconColor(leaf.view.file.path);
            iconTabs.add(this, openedFile.path, leaf.tabHeaderInnerIconEl, {
              iconColor,
            });
          }
        }),
      );

      // Register `file-open` event for adding icon to title.
      this.registerEvent(
        this.app.workspace.on('file-open', (file) => {
          if (!this.getSettings().iconInTitleEnabled) {
            return;
          }

          for (const openedFile of getAllOpenedFiles(this)) {
            if (!file || !openedFile || openedFile.path !== file.path) {
              continue;
            }

            const leaf = openedFile.leaf.view as InlineTitleView;
            const iconNameWithPrefix = icon.getByPath(this, file.path);
            if (!iconNameWithPrefix) {
              titleIcon.hide(leaf.inlineTitleEl);
              return;
            }

            let foundIcon: string = iconNameWithPrefix;
            if (!emoji.isEmoji(foundIcon)) {
              foundIcon = icon.getIconByName(
                this,
                iconNameWithPrefix,
              )?.svgElement;
              // Check for preloaded icons if no icon was found when the start up was faster
              // than the loading of the icons.
              if (
                !foundIcon &&
                this.iconPackManager.getPreloadedIcons().length > 0
              ) {
                foundIcon = this.iconPackManager
                  .getPreloadedIcons()
                  .find(
                    (icon) => icon.prefix + icon.name === iconNameWithPrefix,
                  )?.svgElement;
              }
            }

            if (foundIcon) {
              titleIcon.add(this, leaf.inlineTitleEl, foundIcon, {
                fontSize: calculateInlineTitleSize(),
              });
            } else {
              titleIcon.hide(leaf.inlineTitleEl);
            }
          }
        }),
      );

      // Register event for frontmatter icon registration.
      this.registerEvent(
        this.app.metadataCache.on('resolve', async (file) => {
          if (!this.getSettings().iconInFrontmatterEnabled) {
            return;
          }

          const fileCache = this.app.metadataCache.getFileCache(file);
          const iconFrontmatterName =
            this.getSettings().iconInFrontmatterFieldName;
          const iconColorFrontmatterName =
            this.getSettings().iconColorInFrontmatterFieldName;
          if (fileCache?.frontmatter) {
            const {
              [iconFrontmatterName]: newIconName,
              [iconColorFrontmatterName]: newIconColor,
            } = fileCache.frontmatter;
            // If `icon` property is empty, we will remove it from the data and remove the icon.
            if (!newIconName) {
              if (this.frontmatterCache.has(file.path)) {
                await this.removeSingleIcon(file);
                this.frontmatterCache.delete(file.path);
              }
              return;
            }

            if (typeof newIconName !== 'string') {
              new Notice(
                `[${config.PLUGIN_NAME}] Frontmatter property type \`icon\` has to be of type \`text\`.`,
              );
              return;
            }

            if (newIconColor && typeof newIconColor !== 'string') {
              new Notice(
                `[${config.PLUGIN_NAME}] Frontmatter property type \`iconColor\` has to be of type \`text\`.`,
              );
              return;
            }

            let iconColor = newIconColor;
            if (isHexadecimal(iconColor)) {
              iconColor = stringToHex(iconColor);
            }

            const cachedIcon = IconCache.getInstance().get(file.path);
            const cacheMatches =
              newIconName === cachedIcon?.iconNameWithPrefix &&
              iconColor === cachedIcon?.iconColor;
            if (cacheMatches) {
              // Trust the cache only if the icon is still attached. Obsidian's
              // file-explorer can rebuild a row after the icon was inserted
              // (e.g. when Sync rewrites the file), leaving the cache pointing
              // at a node that is no longer in the DOM.
              const iconInDOM = !!document.querySelector(
                `[data-path="${file.path}"] .iconize-icon`,
              );
              if (iconInDOM) {
                return;
              }
              IconCache.getInstance().invalidate(file.path);
            }

            this.frontmatterCache.add(file.path);
            try {
              if (!emoji.isEmoji(newIconName)) {
                saveIconToIconPack(this, newIconName);
              }
            } catch (e) {
              logger.warn(
                `Something went wrong while saving icon to icon pack (error: ${e})`,
              );
              return;
            }

            const attached = dom.createIconNode(this, file.path, newIconName, {
              color: iconColor,
            });
            this.addFolderIcon(file.path, newIconName);
            this.addIconColor(file.path, iconColor);
            // Only cache the icon if it was actually attached to the DOM. If
            // the row was not yet rendered, leave the cache empty so a later
            // resolve event (or the create handler below) can retry.
            if (attached) {
              IconCache.getInstance().set(file.path, {
                iconNameWithPrefix: newIconName,
                iconColor,
              });
            }

            // Update icon in tab when setting is enabled.
            if (this.getSettings().iconInTabsEnabled) {
              const tabLeaves = iconTabs.getTabLeavesOfFilePath(
                this,
                file.path,
              );
              for (const tabLeaf of tabLeaves) {
                iconTabs.update(
                  this,
                  newIconName,
                  tabLeaf.tabHeaderInnerIconEl,
                );
              }
            }

            // Update icon in title when setting is enabled.
            if (this.getSettings().iconInTitleEnabled) {
              this.addIconInTitle(newIconName);
            }
          }
        }),
      );

      // Register active leaf change event for adding icon of file to tab.
      this.registerEvent(
        this.app.workspace.on('active-leaf-change', (leaf: WorkspaceLeaf) => {
          if (!this.getSettings().iconInTabsEnabled) {
            return;
          }

          // TODO: Maybe change in the future to a more optimal solution.
          // Fixes a problem when the file was clicked twice in the same tab.
          // See https://github.com/FlorianWoelki/obsidian-iconize/issues/208.
          if (leaf.view.getViewType() === 'file-explorer') {
            for (const openedFile of getAllOpenedFiles(this)) {
              const leaf = openedFile.leaf as TabHeaderLeaf;
              const iconColor = this.getIconColor(leaf.view.file.path);
              iconTabs.add(this, openedFile.path, leaf.tabHeaderInnerIconEl, {
                iconColor,
              });
            }
            return;
          }

          if (leaf.view.getViewType() !== 'markdown') {
            return;
          }

          const tabHeaderLeaf = leaf as TabHeaderLeaf;
          if (tabHeaderLeaf.view.file) {
            const iconColor = this.getIconColor(tabHeaderLeaf.view.file.path);
            iconTabs.add(
              this,
              tabHeaderLeaf.view.file.path,
              tabHeaderLeaf.tabHeaderInnerIconEl,
              {
                iconColor,
              },
            );
          }
        }),
      );

      this.registerEvent(
        this.app.workspace.on('css-change', () => {
          for (const openedFile of getAllOpenedFiles(this)) {
            const activeView = openedFile.leaf.view as InlineTitleView;
            if (activeView instanceof MarkdownView) {
              titleIcon.updateStyle(activeView.inlineTitleEl, {
                fontSize: calculateInlineTitleSize(),
              });
            }
          }
        }),
      );
    });
  }

  addIconInTitle(iconName: string): void {
    for (const openedFile of getAllOpenedFiles(this)) {
      const activeView = openedFile.leaf.view as InlineTitleView;
      if (activeView instanceof MarkdownView) {
        let possibleIcon = iconName;
        if (!emoji.isEmoji(iconName)) {
          possibleIcon = icon.getIconByName(this, iconName)?.svgElement;
        }

        if (possibleIcon) {
          titleIcon.add(this, activeView.inlineTitleEl, possibleIcon, {
            fontSize: calculateInlineTitleSize(),
          });
        }
      }
    }
  }

  onunload() {
    console.log('unloading obsidian-icon-folder');
  }

  async renameFolder(newPath: string, oldPath: string): Promise<void> {
    await this.mutateData(() => {
      if (!this.data[oldPath] || newPath === oldPath) {
        return;
      }

      this.data[newPath] = this.data[oldPath];
      delete this.data[oldPath];
    });
  }

  async addIconColor(path: string, iconColor: string): Promise<void> {
    await this.mutateData(() => {
      const pathData = this.data[path];

      if (typeof pathData === 'string') {
        this.data[path] = {
          iconName: pathData,
          iconColor,
        };
      } else if (pathData) {
        (pathData as FolderIconObject).iconColor = iconColor;
      }
    });
  }

  getIconColor(path: string): string | undefined {
    const pathData = this.getData()[path];

    if (!pathData) {
      return undefined;
    }

    if (typeof pathData === 'string') {
      return undefined;
    }

    return (pathData as FolderIconObject).iconColor;
  }

  async removeIconColor(path: string): Promise<void> {
    await this.mutateData(() => {
      const pathData = this.data[path];

      if (typeof pathData !== 'object' || !pathData) {
        return;
      }

      this.data[path] = (pathData as FolderIconObject).iconName;
    });
  }

  async removeFolderIcon(path: string): Promise<void> {
    // Capture the icon name (read against the freshest on-disk state) so we can
    // remove it from the icon pack directory after the data write completes.
    let iconNameWithPrefix: string | null = null;

    await this.mutateData(() => {
      const iconData = this.data[path];
      if (!iconData) {
        return;
      }

      iconNameWithPrefix =
        typeof iconData === 'object'
          ? (iconData as FolderIconObject).iconName
          : (iconData as string);

      delete this.data[path];
    });

    // Removes the icon from the icon pack directory if it is not used as an icon
    // somewhere else.
    if (iconNameWithPrefix && !emoji.isEmoji(iconNameWithPrefix)) {
      removeIconFromIconPack(this, iconNameWithPrefix);
    }
  }

  async addFolderIcon(path: string, icon: Icon | string): Promise<void> {
    // For Icon objects, use prefix + name. For emojis (strings), use as-is.
    const iconName = getNormalizedName(
      typeof icon === 'object' ? icon.prefix + icon.name : icon,
    );

    await this.mutateData(() => {
      this.data[path] = iconName;

      // Update recently used icons.
      if (!this.getSettings().recentlyUsedIcons.includes(iconName)) {
        if (
          this.getSettings().recentlyUsedIcons.length >=
          this.getSettings().recentlyUsedIconsSize
        ) {
          this.getSettings().recentlyUsedIcons =
            this.getSettings().recentlyUsedIcons.slice(
              0,
              this.getSettings().recentlyUsedIconsSize - 1,
            );
        }

        this.getSettings().recentlyUsedIcons.unshift(iconName);
      }
    });
  }

  public getSettings(): IconFolderSettings {
    return this.data.settings as IconFolderSettings;
  }

  async loadIconFolderData(): Promise<void> {
    const data = await this.loadData();
    if (data) {
      Object.entries(DEFAULT_SETTINGS).forEach(([k, v]) => {
        if (data.settings[k] === undefined) {
          data.settings[k] = v;
        }
      });
    }
    this.data = Object.assign({ settings: { ...DEFAULT_SETTINGS } }, {}, data);
  }

  /**
   * Serializes data writes so that concurrent read-modify-write cycles cannot
   * interleave and lose each other's updates.
   */
  private persistChain: Promise<void> = Promise.resolve();

  /**
   * The single entry point for writing `data.json`. It reloads the current
   * on-disk file, refreshes the in-memory icon path entries from it, lets the
   * caller apply its specific change on top, and writes the result back.
   *
   * This prevents a stale in-memory snapshot from clobbering icon entries that
   * Obsidian Sync wrote to disk from another device while this instance was
   * running. See {@link mergePathEntriesFromDisk}.
   */
  private mutateData(mutate: () => void): Promise<void> {
    const run = async () => {
      const onDisk = await this.loadData();
      this.data = mergePathEntriesFromDisk(this.data, onDisk);
      mutate();
      await this.saveData(this.data);
    };
    this.persistChain = this.persistChain.then(run, run);
    return this.persistChain;
  }

  async saveIconFolderData(): Promise<void> {
    await this.mutateData(() => {});
  }

  async checkRecentlyUsedIcons(): Promise<void> {
    if (
      this.getSettings().recentlyUsedIcons.length >
      this.getSettings().recentlyUsedIconsSize
    ) {
      this.getSettings().recentlyUsedIcons =
        this.getSettings().recentlyUsedIcons.slice(
          0,
          this.getSettings().recentlyUsedIconsSize,
        );
      await this.saveIconFolderData();
    }
  }

  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }

  getData(): Record<
    string,
    boolean | string | IconFolderSettings | FolderIconObject
  > {
    return this.data;
  }

  getIconNameFromPath(path: string): string | undefined {
    if (typeof this.getData()[path] === 'object') {
      return (this.getData()[path] as FolderIconObject).iconName;
    }

    return this.getData()[path] as string;
  }

  getRegisteredFileExplorers(): Set<ExplorerView> {
    return this.registeredFileExplorers;
  }

  doesUseCustomLucideIconPack(): boolean {
    return this.getSettings().lucideIconPackType === 'custom';
  }

  doesUseNativeLucideIconPack(): boolean {
    return this.getSettings().lucideIconPackType === 'native';
  }

  /**
   * Returns a possible data path by the given value. This function checks for
   * direct icon and custom rules.
   * @param value String that will be used to find the data path.
   * @returns String that is the data path or `undefined` if no data path was found.
   */
  getDataPathByValue(value: string): string | undefined {
    return Object.entries(this.data).find(([k, v]) => {
      if (typeof v === 'string') {
        if (value === v) {
          return k;
        }
      } else if (typeof v === 'object') {
        // Check for custom rules.
        if (k === 'settings') {
          // `rules` are defined in the settings object.
          const rules = (v as IconFolderSettings).rules;
          return rules.find((rule) => rule.icon === value);
        }

        v = v as FolderIconObject;
        if (value === v.iconName) {
          return k;
        }
      }
    }) as unknown as string;
  }

  public getIconPackManager(): IconPackManager {
    return this.iconPackManager;
  }
}
