/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

/**
 * MImageGallery.tsx
 *
 * Drop at:
 *   src/components/views/messages/MImageGallery.tsx
 *
 * Renders a run of consecutive same-sender image events as a Teams-style grid:
 *
 *   1 image  → full-width single (shouldn't normally happen; single images skip this)
 *   2 images → two equal side-by-side columns
 *   3 images → left half tall + right column two stacked
 *   4+       → 2×2 grid; last visible cell has "+N more" overlay until expanded
 *
 * The component is purely visual — no Matrix events are modified.
 * Each cell delegates to the existing <MImageBody> so all lightbox,
 * media-visibility, and download behaviour is preserved.
 */

import React, { useState, type FC } from "react";
import { type MatrixEvent } from "matrix-js-sdk/src/matrix";
import classNames from "classnames";

import MImageBody from "./MImageBody";
import { type IBodyProps } from "./IBodyProps";
import { type MediaEventHelper } from "../../../utils/MediaEventHelper";

// --------------------------------------------------------------------------
// Props
// --------------------------------------------------------------------------

/**
 * Subset of IBodyProps that MessagePanel already owns and that we pass
 * straight through to every MImageBody child.
 */
export interface IGalleryPassthroughProps
    extends Pick<
        IBodyProps,
        | "highlights"
        | "highlightLink"
        | "showUrlPreview"
        | "forExport"
        | "permalinkCreator"
        | "getRelationsForEvent"
        | "isSeeingThroughMessageHiddenForModeration"
    > {}

export interface IMImageGalleryProps extends IGalleryPassthroughProps {
    /** Ordered list of consecutive m.image events from the same sender. Length >= 2. */
    events: MatrixEvent[];
    /**
     * Optional factory to supply a MediaEventHelper per event.
     * Mirror how EventTile constructs these — pass the same factory MessagePanel
     * would use when building a normal EventTile.
     */
    mediaEventHelperForEvent?: (event: MatrixEvent) => MediaEventHelper | undefined;
    /**
     * How many images to show before collapsing the rest behind the "+N" overlay.
     * Defaults to 4 (the 2×2 grid).
     */
    maxVisible?: number;
    /** Called when any child image changes height (wired to MessagePanel.onHeightChanged). */
    onHeightChanged?: () => void;
}

// --------------------------------------------------------------------------
// Grid layout helpers
// --------------------------------------------------------------------------

/**
 * Returns the explicit CSS grid-area for a cell at `index` given the total
 * number of *visible* cells. The grid is always declared as 2 cols × 2 rows.
 *
 *   2 cells → each fills one col, full height  (1 col × 2 rows each)
 *   3 cells → cell 0: left col full height; cells 1-2: right col, 1 row each
 *   4 cells → normal 2×2
 *   >4 (expanded) → not used; we switch to CSS auto-flow instead
 */
function gridArea(index: number, visibleCount: number): React.CSSProperties {
    if (visibleCount === 1) {
        return { gridColumn: "1 / span 2", gridRow: "1 / span 2" };
    }
    if (visibleCount === 2) {
        // side-by-side
        return { gridColumn: `${index + 1}`, gridRow: "1 / span 2" };
    }
    if (visibleCount === 3) {
        if (index === 0) return { gridColumn: "1", gridRow: "1 / span 2" };
        return { gridColumn: "2", gridRow: `${index}` }; // row 1 then row 2
    }
    // 4: standard 2×2
    return {
        gridColumn: `${(index % 2) + 1}`,
        gridRow: `${Math.floor(index / 2) + 1}`,
    };
}

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

export const MImageGallery: FC<IMImageGalleryProps> = ({
    events,
    mediaEventHelperForEvent,
    maxVisible = 4,
    onHeightChanged,
    ...passthroughProps
}) => {
    const [expanded, setExpanded] = useState(false);

    const visibleEvents = expanded ? events : events.slice(0, maxVisible);
    const overflowCount = events.length - maxVisible;
    const hasOverflow = !expanded && overflowCount > 0;
    const visibleCount = visibleEvents.length;

    return (
        <div className="mx_MImageGallery">
            <div
                className={classNames("mx_MImageGallery_grid", {
                    "mx_MImageGallery_grid--expanded": expanded,
                })}
                // Only set the explicit 2×2 template when not expanded.
                // Expanded mode falls back to CSS auto-flow (2 col wrap).
                style={
                    !expanded
                        ? {
                              display: "grid",
                              gridTemplateColumns: "repeat(2, 1fr)",
                              gridTemplateRows: "repeat(2, 1fr)",
                          }
                        : undefined
                }
            >
                {visibleEvents.map((event, i) => {
                    const isLastVisible = i === visibleCount - 1;
                    const showOverlay = hasOverflow && isLastVisible;
                    const eventId = event.getId() ?? `gallery-img-${i}`;

                    return (
                        <div
                            key={eventId}
                            className={classNames("mx_MImageGallery_cell", {
                                "mx_MImageGallery_cell--hasOverlay": showOverlay,
                            })}
                            style={!expanded ? gridArea(i, visibleCount) : undefined}
                        >
                            <MImageBody
                                mxEvent={event}
                                mediaEventHelper={mediaEventHelperForEvent?.(event)}
                                onMessageAllowed={onHeightChanged}
                                {...passthroughProps}
                            />
                            {showOverlay && (
                                <button
                                    className="mx_MImageGallery_overflow"
                                    aria-label={`Show ${overflowCount} more image${overflowCount !== 1 ? "s" : ""}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setExpanded(true);
                                        onHeightChanged?.();
                                    }}
                                >
                                    +{overflowCount}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default MImageGallery;