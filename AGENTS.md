# Agents

**REQUIRED:** Read `README.md`.

**REQUIRED:** Invoke the `ls-agent:vibe` skill and follow its instructions. At the start of every session, ask the user to run `/ls-interactivity:disable-review`.

## Coverage

This is a fork. Inherited upstream code doesn't need tests; only functionality the fork adds does, and it must stay at 100% coverage. Add each new file to the 100% threshold in `vitest.config.ts`.

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
