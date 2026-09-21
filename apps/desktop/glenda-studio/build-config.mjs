#!/usr/bin/env node
/*
 * Builds the Glenda Studio Element config: glenda-studio/config.json with every theme in
 * glenda-studio/themes/*.json appended to setting_defaults.custom_themes (see themes/README.md).
 *
 * Usage (from the repo root): node apps/desktop/glenda-studio/build-config.mjs <output config.json>
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const themesDir = path.join(here, "themes");

const outPath = process.argv[2];
if (!outPath) {
    console.error("Usage: node apps/desktop/glenda-studio/build-config.mjs <output config.json>");
    process.exit(1);
}

function readJson(path) {
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
        throw new Error(`${path}: ${e.message}`);
    }
}

const config = readJson(path.join(here, "config.json"));
config.setting_defaults ??= {};
const customThemes = config.setting_defaults.custom_themes ?? [];
const names = new Set(customThemes.map((theme) => theme.name));
const errors = [];

const themeFiles = readdirSync(themesDir)
    .filter((file) => file.endsWith(".json"))
    .sort();

for (const file of themeFiles) {
    const theme = readJson(path.join(themesDir, file));

    // Same validation Element applies when adding a custom theme (CustomThemesViewModel).
    if (!theme || typeof theme.name !== "string" || typeof theme.colors !== "object" || theme.colors === null) {
        errors.push(`${file}: a theme needs a "name" string and a "colors" object`);
        continue;
    }
    if (names.has(theme.name)) {
        errors.push(`${file}: duplicate theme name "${theme.name}" (Element identifies themes by name)`);
        continue;
    }
    if (/https?:\/\//.test(JSON.stringify(theme))) {
        console.warn(`warning: ${file} references http(s) URLs, which won't load on offline workstations`);
    }

    names.add(theme.name);
    customThemes.push(theme);
}

if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
}

if (customThemes.length > 0) {
    config.setting_defaults.custom_themes = customThemes;
}

writeFileSync(outPath, JSON.stringify(config, null, 4) + "\n");
console.log(
    `Wrote ${outPath} with ${customThemes.length} custom theme(s)${customThemes.length ? ": " : ""}${[...names].join(", ")}`,
);
