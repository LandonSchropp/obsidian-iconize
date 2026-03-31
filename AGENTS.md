# Agents

## Deployment

To deploy the plugin to a local Obsidian vault, create an `env.js` file in the project root (it is gitignored):

```js
export const obsidianExportPath = `/path/to/your/vault/.obsidian/plugins/obsidian-iconize`;
```

Then run:

```bash
pnpm build
```

This builds the plugin and copies `main.js`, `manifest.json`, and `src/styles.css` to the path defined in `env.js`.
