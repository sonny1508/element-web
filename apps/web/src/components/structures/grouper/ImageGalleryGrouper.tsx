/*
 * ImageGalleryGrouper.tsx
 *
 * Groups consecutive m.image events from the same sender into an
 * MImageGallery grid. Only triggers when there are 2+ consecutive images.
 * Single images render normally via EventTile.
 *
 * Custom addition for the Glenda Studio fork.
 */

import React, { type ReactNode } from "react";
import { EventType, MsgType, type MatrixEvent } from "matrix-js-sdk/src/matrix";

import type MessagePanel from "../MessagePanel";
import { type WrappedEvent } from "../MessagePanel";
import { BaseGrouper } from "./BaseGrouper";
import MImageGallery from "../../views/messages/MImageGallery";

/**
 * Returns true if the event is an m.room.message with msgtype m.image.
 */
function isImageMessage(ev: MatrixEvent): boolean {
    if (ev.getType() !== EventType.RoomMessage) return false;
    const content = ev.getContent();
    return content.msgtype === MsgType.Image;
}

/** Max time gap (ms) between consecutive images to still group them. */
const MAX_GAP_MS = 30_000; // 30 seconds

export class ImageGalleryGrouper extends BaseGrouper {
    /**
     * Start a gallery group when we see a visible m.image event.
     * The group may later be discarded (rendered as normal tiles) if only
     * one image ends up in it — see getTiles().
     */
    public static canStartGroup = (_panel: MessagePanel, { event: ev, shouldShow }: WrappedEvent): boolean => {
        if (!shouldShow) return false;
        return isImageMessage(ev);
    };

    public constructor(
        public readonly panel: MessagePanel,
        public readonly firstEventAndShouldShow: WrappedEvent,
        public readonly prevEvent: MatrixEvent | null,
        public readonly lastShownEvent: MatrixEvent | undefined,
        nextEvent: WrappedEvent | null,
        nextEventTile: MatrixEvent | null,
    ) {
        super(panel, firstEventAndShouldShow, prevEvent, lastShownEvent, nextEvent, nextEventTile);
        this.events = [firstEventAndShouldShow];
    }

    public shouldGroup({ event: ev, shouldShow }: WrappedEvent): boolean {
        if (!shouldShow) return false;
        if (!isImageMessage(ev)) return false;

        // Must be from the same sender
        const first = this.events[0].event;
        if (ev.getSender() !== first.getSender()) return false;

        // Must be within the time gap
        const lastInGroup = this.events[this.events.length - 1].event;
        if (ev.getTs() - lastInGroup.getTs() > MAX_GAP_MS) return false;

        return true;
    }

    public add(ev: WrappedEvent): void {
        this.events.push(ev);
    }

    public getTiles(): ReactNode[] {
        // If only one image ended up in the group, fall back to normal
        // EventTile rendering — no gallery wrapper needed.
        if (this.events.length < 2) {
            const tiles: ReactNode[] = [];
            for (const wrappedEvent of this.events) {
                tiles.push(
                    ...this.panel.getTilesForEvent(
                        this.prevEvent,
                        wrappedEvent,
                        wrappedEvent.event === this.lastShownEvent,
                    ),
                );
            }
            return tiles;
        }

        const imageEvents = this.events.map((we) => we.event);
        const firstEventId = imageEvents[0].getId()!;
        const lastEvent = imageEvents[imageEvents.length - 1];

        // Check if the last image has a caption (MSC2530: filename !== body)
        const lastContent = lastEvent.getContent();
        const hasCaption = lastContent.filename && lastContent.filename !== lastContent.body;

        return [
            <li key={`gallery-${firstEventId}`} className="mx_EventTile mx_EventTile_gallery" data-scroll-tokens={firstEventId}>
                <MImageGallery
                    events={imageEvents}
                    onHeightChanged={() => this.panel.forceUpdate()}
                />
                {hasCaption && (
                    <div className="mx_EventTile_galleryCaption">
                        {lastContent.body}
                    </div>
                )}
            </li>,
        ];
    }

    public getNewPrevEvent(): MatrixEvent {
        return this.events[this.events.length - 1].event;
    }
}
