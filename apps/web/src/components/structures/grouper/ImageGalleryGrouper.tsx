/*
 * ImageGalleryGrouper.tsx
 *
 * Groups consecutive m.image events from the same sender into an
 * MImageGallery grid with a bubble wrapper. Single images also get
 * the bubble treatment. Includes hover highlight and right-click
 * context menu support.
 *
 * Custom addition for the Glenda Studio fork.
 */

import React, { type ReactNode, useState, useCallback, useEffect } from "react";
import { EventType, MsgType, type MatrixEvent, MatrixEventEvent, type Relations } from "matrix-js-sdk/src/matrix";

import type MessagePanel from "../MessagePanel";
import { type WrappedEvent } from "../MessagePanel";
import { BaseGrouper } from "./BaseGrouper";
import MImageGallery from "../../views/messages/MImageGallery";
import MImageBody from "../../views/messages/MImageBody";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import MessageContextMenu from "../../views/context_menus/MessageContextMenu";
import { aboveRightOf } from "../ContextMenu";
import { type RoomPermalinkCreator } from "../../../utils/permalinks/Permalinks";
import { type Layout } from "../../../settings/enums/Layout";
import { TimelineRenderingType } from "../../../contexts/RoomContext";
import { type GetRelationsForEvent, ReactionsRowWrapper, ActionBarWrapper } from "../../views/rooms/EventTile";
import { registerGalleryForThread, getGalleryForThread } from "./galleryThreadRegistry";

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
 */
const MAX_GAP_MS = 10_000; // 10 seconds

// -------------------------------------------------------------------------
// GalleryTile — lightweight wrapper providing hover + context menu
// -------------------------------------------------------------------------

interface GalleryTileProps {
    eventId: string;
    /** The "representative" event used for the context menu (first in group). */
    mxEvent: MatrixEvent;
    /** All events in the gallery group (for forwarding). */
    galleryEvents: MatrixEvent[];
    layout: Layout | undefined;
    isOwnEvent: boolean;
    permalinkCreator?: RoomPermalinkCreator;
    showReactions?: boolean;
    getRelationsForEvent?: GetRelationsForEvent;
    children: ReactNode;
}

// -------------------------------------------------------------------------
// GalleryTile — wrapper providing hover highlight, action bar & context menu
// -------------------------------------------------------------------------

const noop = (): void => {};
const returnNull = (): null => null;

function GalleryTile({ eventId, mxEvent, galleryEvents, layout, isOwnEvent, permalinkCreator, showReactions, getRelationsForEvent, children }: GalleryTileProps): ReactNode {
    const [hover, setHover] = useState(false);
    const [actionBarFocused, setActionBarFocused] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ left: number; top: number; bottom: number } | null>(null);

    // Reactions support
    const [reactions, setReactions] = useState<Relations | null | undefined>(() => {
        if (!showReactions || !getRelationsForEvent) return null;
        return getRelationsForEvent(mxEvent.getId()!, "m.annotation", "m.reaction") ?? null;
    });

    useEffect(() => {
        if (!showReactions || !getRelationsForEvent) return;
        const onRelationsCreated = (relationType: string, eventType: string): void => {
            if (relationType !== "m.annotation" || eventType !== "m.reaction") return;
            setReactions(getRelationsForEvent(mxEvent.getId()!, "m.annotation", "m.reaction") ?? null);
        };
        mxEvent.on(MatrixEventEvent.RelationsCreated, onRelationsCreated);
        return () => { mxEvent.off(MatrixEventEvent.RelationsCreated, onRelationsCreated); };
    }, [mxEvent, showReactions, getRelationsForEvent]);

    // Register gallery events so thread views can find the full group
    useEffect(() => {
        if (galleryEvents.length > 1) {
            registerGalleryForThread(mxEvent.getId()!, galleryEvents);
        }
    }, [mxEvent, galleryEvents]);

    const onContextMenu = useCallback(
        (ev: React.MouseEvent) => {
            if (ev.target instanceof HTMLImageElement) return;

            ev.preventDefault();
            ev.stopPropagation();
            setContextMenu({ left: ev.clientX, top: ev.clientY, bottom: ev.clientY });
        },
        [],
    );

    const onCloseMenu = useCallback(() => setContextMenu(null), []);

    const showActionBar = hover || actionBarFocused || !!contextMenu;

    return (
        <li
            className="mx_EventTile mx_EventTile_gallery"
            data-scroll-tokens={eventId}
            data-layout={layout}
            data-self={isOwnEvent}
            onContextMenu={onContextMenu}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            {children}
            {showReactions && (
                <div className="mx_EventTile_footer">
                    <ReactionsRowWrapper mxEvent={mxEvent} reactions={reactions} />
                </div>
            )}
            {showActionBar && (
                <ActionBarWrapper
                    mxEvent={mxEvent}
                    reactions={reactions}
                    permalinkCreator={permalinkCreator}
                    getTile={returnNull}
                    getReplyChain={returnNull}
                    onFocusChange={setActionBarFocused}
                    toggleThreadExpanded={noop}
                    getRelationsForEvent={getRelationsForEvent}
                    galleryEvents={galleryEvents.length > 1 ? galleryEvents : undefined}
                />
            )}
            {contextMenu && (
                <MessageContextMenu
                    {...aboveRightOf(contextMenu)}
                    mxEvent={mxEvent}
                    galleryEvents={galleryEvents.length > 1 ? galleryEvents : undefined}
                    reactions={reactions}
                    permalinkCreator={permalinkCreator}
                    onFinished={onCloseMenu}
                    rightClick={true}
                />
            )}
        </li>
    );
}

// -------------------------------------------------------------------------
// Gallery events registry for thread context
// -------------------------------------------------------------------------

/**
 * Look up sibling gallery events from the room's main timeline.
 * Used in thread view so the root event's gallery can be rendered in full.
 */
function findGallerySiblings(event: MatrixEvent): MatrixEvent[] {
    const room = MatrixClientPeg.safeGet().getRoom(event.getRoomId());
    if (!room) return [event];

    const timeline = room.getLiveTimeline();
    const events = timeline.getEvents();

    const eventId = event.getId();
    const idx = events.findIndex((e) => e.getId() === eventId);
    if (idx === -1) return [event];

    const sender = event.getSender();
    const result: MatrixEvent[] = [event];

    for (let i = idx - 1; i >= 0; i--) {
        const e = events[i];
        if (!isImageMessage(e) || e.getSender() !== sender) break;
        if (result[0].getTs() - e.getTs() > MAX_GAP_MS) break;
        result.unshift(e);
    }

    for (let i = idx + 1; i < events.length; i++) {
        const e = events[i];
        if (!isImageMessage(e) || e.getSender() !== sender) break;
        if (e.getTs() - result[result.length - 1].getTs() > MAX_GAP_MS) break;
        result.push(e);
    }

    return result;
}

// -------------------------------------------------------------------------
// Grouper
// -------------------------------------------------------------------------

export class ImageGalleryGrouper extends BaseGrouper {
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

        const first = this.events[0].event;
        if (ev.getSender() !== first.getSender()) return false;

        const lastInGroup = this.events[this.events.length - 1].event;
        if (ev.getTs() - lastInGroup.getTs() > MAX_GAP_MS) return false;

        return true;
    }

    public add(ev: WrappedEvent): void {
        this.events.push(ev);
    }

    public getTiles(): ReactNode[] {
        let imageEvents = this.events.map((we) => we.event);
        const firstEventId = imageEvents[0].getId()!;

        // In thread context, restore the full gallery from registry or room timeline
        if (
            imageEvents.length === 1 &&
            this.panel.context?.timelineRenderingType === TimelineRenderingType.Thread
        ) {
            const registered = getGalleryForThread(firstEventId);
            if (registered && registered.length > 1) {
                imageEvents = registered;
            } else {
                const siblings = findGallerySiblings(imageEvents[0]);
                if (siblings.length > 1) {
                    imageEvents = siblings;
                }
            }
        }

        const layout = this.panel.props.layout;
        const myUserId = MatrixClientPeg.safeGet().getUserId();
        const isOwnEvent = imageEvents[0].getSender() === myUserId;

        // Find caption from any image (MSC2530: filename !== body)
        let captionText: string | undefined;
        for (const ev of imageEvents) {
            const c = ev.getContent();
            if (c.filename && c.filename !== c.body) {
                captionText = c.body;
                break;
            }
        }

        // Single image or multi-image grid
        let mediaContent: ReactNode;
        if (imageEvents.length === 1) {
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
            <GalleryTile
                key={`gallery-${firstEventId}`}
                eventId={firstEventId}
                mxEvent={imageEvents[0]}
                galleryEvents={imageEvents}
                layout={layout}
                isOwnEvent={isOwnEvent}
                permalinkCreator={this.panel.props.permalinkCreator}
                showReactions={this.panel.props.showReactions}
                getRelationsForEvent={this.panel.props.getRelationsForEvent}
            >
                <div className="mx_EventTile_gallery_bubble">
                    {mediaContent}
                    {captionText && (
                        <div className="mx_EventTile_galleryCaption">
                            {captionText}
                        </div>
                    )}
                </div>
            </GalleryTile>,
        ];
    }

    public getNewPrevEvent(): MatrixEvent {
        return this.events[this.events.length - 1].event;
    }
}
