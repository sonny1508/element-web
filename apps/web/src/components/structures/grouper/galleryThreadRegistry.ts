import { type MatrixEvent } from "matrix-js-sdk/src/matrix";

const galleryEventsRegistry = new Map<string, MatrixEvent[]>();

export function registerGalleryForThread(rootEventId: string, events: MatrixEvent[]): void {
    galleryEventsRegistry.set(rootEventId, events);
}

export function getGalleryForThread(rootEventId: string): MatrixEvent[] | undefined {
    return galleryEventsRegistry.get(rootEventId);
}
