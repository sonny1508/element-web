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

import React, { type ReactNode, useState, useCallback, useContext } from "react";
import { EventType, MsgType, type MatrixEvent } from "matrix-js-sdk/src/matrix";
import {
    ReplyIcon,
    ThreadsIcon,
    OverflowHorizontalIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

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
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import { type ShowThreadPayload } from "../../../dispatcher/payloads/ShowThreadPayload";
import RoomContext from "../../../contexts/RoomContext";

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
    children: ReactNode;
}

// -------------------------------------------------------------------------
// GalleryActionBar — lightweight hover toolbar (Reply · Thread · Options)
// -------------------------------------------------------------------------

interface GalleryActionBarProps {
    mxEvent: MatrixEvent;
    permalinkCreator?: RoomPermalinkCreator;
    onOptionsClick: (ev: React.MouseEvent) => void;
}

function GalleryActionBar({ mxEvent, onOptionsClick }: GalleryActionBarProps): ReactNode {
    const roomContext = useContext(RoomContext);

    const onReply = useCallback(
        (ev: React.MouseEvent) => {
            ev.stopPropagation();
            defaultDispatcher.dispatch({
                action: "reply_to_event",
                event: mxEvent,
                context: roomContext.timelineRenderingType,
            });
        },
        [mxEvent, roomContext.timelineRenderingType],
    );

    const onThread = useCallback(
        (ev: React.MouseEvent) => {
            ev.stopPropagation();
            const thread = mxEvent.getThread();
            if (thread?.rootEvent && !mxEvent.isThreadRoot) {
                defaultDispatcher.dispatch<ShowThreadPayload>({
                    action: Action.ShowThread,
                    rootEvent: thread.rootEvent,
                    initialEvent: mxEvent,
                    scroll_into_view: true,
                    highlighted: true,
                    push: false,
                });
            } else {
                defaultDispatcher.dispatch<ShowThreadPayload>({
                    action: Action.ShowThread,
                    rootEvent: mxEvent,
                    push: false,
                });
            }
        },
        [mxEvent],
    );

    return (
        <div className="mx_GalleryActionBar" role="toolbar" aria-label="Message actions">
            <button className="mx_GalleryActionBar_button" onClick={onReply} title="Reply">
                <ReplyIcon width={18} height={18} />
            </button>
            <button className="mx_GalleryActionBar_button" onClick={onThread} title="Thread">
                <ThreadsIcon width={18} height={18} />
            </button>
            <button className="mx_GalleryActionBar_button" onClick={onOptionsClick} title="Options">
                <OverflowHorizontalIcon width={18} height={18} />
            </button>
        </div>
    );
}

// -------------------------------------------------------------------------
// GalleryTile — wrapper providing hover highlight, action bar & context menu
// -------------------------------------------------------------------------

function GalleryTile({ eventId, mxEvent, galleryEvents, layout, isOwnEvent, permalinkCreator, children }: GalleryTileProps): ReactNode {
    const [hover, setHover] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ left: number; top: number; bottom: number } | null>(null);

    const onContextMenu = useCallback(
        (ev: React.MouseEvent) => {
            // Let native context menu handle images (for "Copy image" etc.)
            if (ev.target instanceof HTMLImageElement) return;

            ev.preventDefault();
            ev.stopPropagation();
            setContextMenu({ left: ev.clientX, top: ev.clientY, bottom: ev.clientY });
        },
        [],
    );

    const onOptionsClick = useCallback(
        (ev: React.MouseEvent) => {
            ev.preventDefault();
            ev.stopPropagation();
            const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
            setContextMenu({ left: rect.left, top: rect.bottom, bottom: rect.bottom });
        },
        [],
    );

    const onCloseMenu = useCallback(() => setContextMenu(null), []);

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
            {/* Action bar rendered inside the <li> but positioned via CSS */}
            {(hover || contextMenu) && (
                <GalleryActionBar
                    mxEvent={mxEvent}
                    permalinkCreator={permalinkCreator}
                    onOptionsClick={onOptionsClick}
                />
            )}
            {contextMenu && (
                <MessageContextMenu
                    {...aboveRightOf(contextMenu)}
                    mxEvent={mxEvent}
                    galleryEvents={galleryEvents.length > 1 ? galleryEvents : undefined}
                    permalinkCreator={permalinkCreator}
                    onFinished={onCloseMenu}
                    rightClick={true}
                />
            )}
        </li>
    );
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
        const imageEvents = this.events.map((we) => we.event);
        const firstEventId = imageEvents[0].getId()!;

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
            <GalleryTile
                key={`gallery-${firstEventId}`}
                eventId={firstEventId}
                mxEvent={imageEvents[0]}
                galleryEvents={imageEvents}
                layout={layout}
                isOwnEvent={isOwnEvent}
                permalinkCreator={this.panel.props.permalinkCreator}
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
