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
 * Renders a run of consecutive same-sender image events as a compact grid
 * of uniform square thumbnails.  All cells are the same size; images are
 * cropped (object-fit: cover) so the grid stays tight regardless of the
 * original aspect ratios.  Clicking an image still opens the full-size
 * lightbox via MImageBody.
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
    /**
     * Maximum grid dimension in pixels (height reference).  Defaults to 500
     * for the timeline; the forward-dialog preview passes 250 for a compact view.
     */
    maxGridSize?: number;
    /** Called when any child image changes height (wired to MessagePanel.onHeightChanged). */
    onHeightChanged?: () => void;
}

// --------------------------------------------------------------------------
// Grid sizing constants
// --------------------------------------------------------------------------

const MAX_GRID_SIZE = 500;
const GRID_GAP = 2;
const MAX_CELL_SIZE = Math.floor((MAX_GRID_SIZE - GRID_GAP) / 2); // 249

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

export const MImageGallery: FC<IMImageGalleryProps> = ({
    events,
    mediaEventHelperForEvent,
    maxVisible = 4,
    maxGridSize = MAX_GRID_SIZE,
    onHeightChanged,
    ...passthroughProps
}) => {
    const [expanded, setExpanded] = useState(false);

    const visibleEvents = expanded ? events : events.slice(0, maxVisible);
    const overflowCount = events.length - maxVisible;
    const hasOverflow = !expanded && overflowCount > 0;
    const visibleCount = visibleEvents.length;
    const rowCount = Math.ceil(visibleCount / 2);

    const maxCell = Math.floor((maxGridSize - GRID_GAP) / 2);
    const cellSize = Math.floor(
        Math.min((maxGridSize - (rowCount - 1) * GRID_GAP) / rowCount, maxCell),
    );

    const gridStyle: React.CSSProperties = expanded
        ? {
              gridTemplateColumns: `repeat(2, ${maxCell}px)`,
              gridAutoRows: `${maxCell}px`,
          }
        : {
              gridTemplateColumns: `repeat(2, ${cellSize}px)`,
              gridTemplateRows: `repeat(${rowCount}, ${cellSize}px)`,
          };

    return (
        <div className="mx_MImageGallery">
            <div
                className={classNames("mx_MImageGallery_grid", {
                    "mx_MImageGallery_grid--expanded": expanded,
                })}
                style={gridStyle}
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