/*
Copyright 2024 New Vector Ltd.
Copyright 2017 Vector Creations Ltd

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type IRedactOpts, type MatrixEvent } from "matrix-js-sdk/src/matrix";
import React from "react";

import { _t } from "../../../languageHandler";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import Modal from "../../../Modal";
import ErrorDialog from "./ErrorDialog";
import TextInputDialog from "./TextInputDialog";

interface IProps {
    event: MatrixEvent;
    onFinished(success?: false, reason?: void): void;
    onFinished(success: true, reason?: string): void;
}

/*
 * A dialog for confirming a redaction.
 */
export default class ConfirmRedactDialog extends React.Component<IProps> {
    public render(): React.ReactNode {
        let description = _t("redact|confirm_description");
        if (this.props.event.isState()) {
            description += " " + _t("redact|confirm_description_state");
        }

        return (
            <TextInputDialog
                onFinished={this.props.onFinished}
                title={_t("redact|confirm_button")}
                description={description}
                placeholder={_t("redact|reason_label")}
                focus
                button={_t("action|remove")}
            />
        );
    }
}

export function createRedactEventDialog({
    mxEvent,
    extraEvents,
    onCloseDialog = () => {},
}: {
    mxEvent: MatrixEvent;
    /** Additional events to redact together (e.g. all images in a gallery group). */
    extraEvents?: MatrixEvent[];
    onCloseDialog?: () => void;
}): void {
    const eventId = mxEvent.getId();

    if (!eventId) throw new Error("cannot redact event without ID");

    const roomId = mxEvent.getRoomId();

    if (!roomId) throw new Error(`cannot redact event ${mxEvent.getId()} without room ID`);
    const { finished } = Modal.createDialog(ConfirmRedactDialog, { event: mxEvent }, "mx_Dialog_confirmredact");

    finished.then(async ([proceed, reason]) => {
        if (!proceed) return;

        const cli = MatrixClientPeg.safeGet();
        const withRelTypes: Pick<IRedactOpts, "with_rel_types"> = {};

        const eventsToRedact: MatrixEvent[] = [mxEvent, ...(extraEvents ?? [])];
        // Deduplicate in case mxEvent is also present in extraEvents.
        const seen = new Set<string>();
        const uniqueEvents = eventsToRedact.filter((e) => {
            const id = e.getId();
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        });

        try {
            onCloseDialog?.();
            await Promise.all(
                uniqueEvents.map((e) =>
                    cli.redactEvent(e.getRoomId()!, e.getId()!, undefined, {
                        ...(reason ? { reason } : {}),
                        ...withRelTypes,
                    }),
                ),
            );
        } catch (e: any) {
            const code = e.errcode || e.statusCode;
            // only show the dialog if failing for something other than a network error
            // (e.g. no errcode or statusCode) as in that case the redactions end up in the
            // detached queue and we show the room status bar to allow retry
            if (typeof code !== "undefined") {
                // display error message stating you couldn't delete this.
                Modal.createDialog(ErrorDialog, {
                    title: _t("common|error"),
                    description: _t("redact|error", { code }),
                });
            }
        }
    });
}
