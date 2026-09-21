/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { afterEach, describe, expect, it, vi } from "vitest";

import { computeMediaVisibility } from "./mediaVisibility";
import { type MediaPreviewConfig, MediaPreviewValue } from "../../@types/media_preview";
import SettingsStore from "../../settings/SettingsStore";
import { UIFeature } from "../../settings/UIFeature";

const previewsOff: MediaPreviewConfig = { media_previews: MediaPreviewValue.Off, invite_avatars: MediaPreviewValue.On };
const hiddenOverride = { $event: false };

describe("computeMediaVisibility", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("respects per-event overrides and the media preview setting by default", () => {
        expect(computeMediaVisibility(previewsOff, {}, "@me:x", "$event", "@other:x", false)).toBe(false);
        expect(
            computeMediaVisibility(
                { ...previewsOff, media_previews: MediaPreviewValue.On },
                hiddenOverride,
                "@me:x",
                "$event",
                "@other:x",
                false,
            ),
        ).toBe(false);
    });

    it("always shows media when media hiding is disabled for the deployment", () => {
        const originalGetValue = SettingsStore.getValue.bind(SettingsStore);
        vi.spyOn(SettingsStore, "getValue").mockImplementation(((name: string, ...args: unknown[]) =>
            name === UIFeature.MediaHiding ? false : (originalGetValue as any)(name, ...args)) as any);

        expect(computeMediaVisibility(previewsOff, {}, "@me:x", "$event", "@other:x", false)).toBe(true);
        expect(computeMediaVisibility(previewsOff, hiddenOverride, "@me:x", "$event", "@other:x", false)).toBe(true);
    });
});
