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
import MImageBody from "../../views/messages/MImageBody";
import { MatrixClientPeg } from "../../../MatrixClientPeg";

/**
 * Returns true if the event is an m.room.message with msgtype m.image.
 */
function isImageMessage(ev: MatrixEvent): boolean {
    if (ev.getType() !== EventType.RoomMessage) return false;
    const content = ev.getContent();
    return content.msgtype === MsgType.Image;
}

/**
 * Max time gap (ms) between consecutive images to still group them.
 * When uploading multiple images at once, they arrive sequentially
 * within a few seconds of each other. 10s is generous enough to
 * cover slow uploads while still separating distinct send actions.
 */
const MAX_GAP_MS = 10_000; // 10 seconds

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
        const imageEvents = this.events.map((we) => we.event);
        const firstEventId = imageEvents[0].getId()!;

        // Bubble layout: match the data attributes that EventTile uses
        // so the gallery aligns left (others) or right (self).
        const layout = this.panel.props.layout;
        const myUserId = MatrixClientPeg.safeGet().getUserId();
        const isOwnEvent = imageEvents[0].getSender() === myUserId;

        // Find the caption from any image in the group (MSC2530: filename !== body).
        let captionText: string | undefined;
        for (const ev of imageEvents) {
            const c = ev.getContent();
            if (c.filename && c.filename !== c.body) {
                captionText = c.body;
                break;
            }
        }

        // Build the inner content: single image or multi-image grid
        let mediaContent: ReactNode;
        if (this.events.length === 1) {
            mediaContent = (
                <div className="mx_MImageBody_single">
                    <MImageBody mxEvent={imageEvents[0]} />
                </div>
            );
        } else {
            mediaContent = (
                <MImageGallery
                    events={imageEvents}
                    onHeightChanged={() => this.panel.forceUpdate()}
                />
            );
        }

        return [
            <li
                key={`gallery-${firstEventId}`}
                className="mx_EventTile mx_EventTile_gallery"
                data-scroll-tokens={firstEventId}
                data-layout={layout}
                data-self={isOwnEvent}
            >
                <div className="mx_EventTile_gallery_bubble">
                    {mediaContent}
                    {captionText && (
                        <div className="mx_EventTile_galleryCaption">
                            {captionText}
                        </div>
                    )}
                </div>
            </li>,
        ];
    }

    public getNewPrevEvent(): MatrixEvent {
        return this.events[this.events.length - 1].event;
    }
}
