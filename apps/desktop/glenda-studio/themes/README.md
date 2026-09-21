# Glenda Studio custom themes

Every `*.json` file in this folder is a custom Element theme that ships inside the desktop app.
Nothing is downloaded at runtime, so the themes work on offline workstations.

## How it works

`../build-config.mjs` takes `../config.json`, appends every theme in this folder (sorted by file name) to
`setting_defaults.custom_themes`, and writes the result where the build needs it. CI runs it in
`.github/workflows/build_glenda_prepare.yaml`, so the generated config is what gets packaged into the app.
The themes then appear in **Settings → Appearance** for every user.

## Adding a theme

1. Drop the theme's JSON file in this folder (e.g. `Discord-Dark.json`). The format is the one Element uses for
   custom themes, e.g.
   https://raw.githubusercontent.com/aaronraimist/element-themes/master/Discord/Discord-Dark/Discord-Dark-Theme.json
2. Check it builds: `node apps/desktop/glenda-studio/build-config.mjs /tmp/config.json` (from the repo root).
3. Commit and push; the next desktop build includes it.

Rules (checked by the script; the build fails if they're broken):

- `name` (string) and `colors` (object) are required — the same check Element applies to custom themes.
- Names must be unique. Element's internal ID is `custom-<name>`, so to make one the default theme use e.g.
  `"default_theme": "custom-Discord Dark"` in `../config.json`.

`is_dark: true` builds the theme on Element's dark base, otherwise the light one (Element's stock bases, not the
Glenda themes). The script warns about `http(s)://` URLs (e.g. web fonts in `fonts.faces`): those can't load on
offline workstations, and Element falls back to its default font.

## Testing locally

The dev server reads `apps/web/config.json` (git-ignored). Regenerate it from the Glenda config + these themes
instead of editing it by hand:

```bash
node apps/desktop/glenda-studio/build-config.mjs apps/web/config.json
```
