/*
Copyright 2024 New Vector Ltd.
Copyright 2019-2021 The Matrix.org Foundation C.I.C.
Copyright 2019 Michael Telatynski <7t3chguy@gmail.com>

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { createRef, type JSX } from "react";
import { FilesIcon } from "@vector-im/compound-design-tokens/assets/web/icons";
import { type Room } from "matrix-js-sdk/src/matrix";

import { _t } from "../../../languageHandler";
import BaseDialog from "./BaseDialog";
import DialogButtons from "../elements/DialogButtons";
import { fileSize } from "../../../utils/FileUtils";
import Autocomplete from "../rooms/Autocomplete";
import { type ICompletion } from "../../../autocomplete/Autocompleter";

/** A user the caption author chose via autocomplete; sent as m.mentions.user_ids. */
export interface CaptionMention {
    userId: string;
    displayName: string;
}

interface IProps {
    file: File;
    currentIndex: number;
    totalFiles: number;
    /** Room used to source @-mention completions for the caption input. */
    room?: Room;
    onFinished: (
        uploadConfirmed: boolean,
        uploadAll?: boolean,
        caption?: string,
        mentions?: CaptionMention[],
    ) => void;
}

interface IState {
    objectUrl?: string;
    caption: string;
    selectionStart: number;
    selectionEnd: number;
    /** All users picked via autocomplete since the dialog opened. Filtered at send time. */
    mentions: CaptionMention[];
}

export default class UploadConfirmDialog extends React.Component<IProps, IState> {
    public static defaultProps: Partial<IProps> = {
        totalFiles: 1,
        currentIndex: 0,
    };

    private inputRef = createRef<HTMLInputElement>();
    private autocompleteRef = createRef<Autocomplete>();

    public constructor(props: IProps) {
        super(props);

        this.state = { caption: "", selectionStart: 0, selectionEnd: 0, mentions: [] };
    }

    public componentDidMount(): void {
        if (this.props.file.type.startsWith("image/") || this.props.file.type.startsWith("video/")) {
            this.setState({
                // We do not filter the mimetype using getBlobSafeMimeType here as if the user is uploading the file
                // themselves they should be trusting it enough to open/load it, and it will be rendered into a hidden
                // canvas for thumbnail generation anyway
                objectUrl: URL.createObjectURL(this.props.file),
            });
        }
    }

    public componentWillUnmount(): void {
        if (this.state.objectUrl) URL.revokeObjectURL(this.state.objectUrl);
    }

    private onCancelClick = (): void => {
        this.props.onFinished(false);
    };

    /** Mentions that still have their display name present in the caption text. */
    private activeMentions(): CaptionMention[] {
        const { caption, mentions } = this.state;
        const seen = new Set<string>();
        return mentions.filter((m) => {
            if (seen.has(m.userId)) return false;
            if (!caption.includes(m.displayName)) return false;
            seen.add(m.userId);
            return true;
        });
    }

    private onUploadClick = (): void => {
        const caption = this.state.caption || undefined;
        const mentions = caption ? this.activeMentions() : [];
        this.props.onFinished(true, undefined, caption, mentions);
    };

    private onUploadAllClick = (): void => {
        const caption = this.state.caption || undefined;
        const mentions = caption ? this.activeMentions() : [];
        this.props.onFinished(true, true, caption, mentions);
    };

    private syncSelection = (): void => {
        const input = this.inputRef.current;
        if (!input) return;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        if (start !== this.state.selectionStart || end !== this.state.selectionEnd) {
            this.setState({ selectionStart: start, selectionEnd: end });
        }
    };

    private onCaptionChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        const value = e.target.value;
        const caret = e.target.selectionStart ?? value.length;
        this.setState({ caption: value, selectionStart: caret, selectionEnd: caret });
    };

    private onCaptionSelect = (): void => {
        this.syncSelection();
    };

    private autocompleteVisible(): boolean {
        const ac = this.autocompleteRef.current;
        return !!ac && ac.countCompletions() > 0;
    }

    private onCaptionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
        const ac = this.autocompleteRef.current;
        if (ac && this.autocompleteVisible()) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                ac.moveSelection(1);
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                ac.moveSelection(-1);
                return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
                if (ac.hasSelection()) {
                    e.preventDefault();
                    ac.onConfirmCompletion();
                    return;
                }
            }
            if (e.key === "Escape") {
                e.preventDefault();
                ac.onEscape(e.nativeEvent);
                return;
            }
        }

        if (e.key === "Enter") {
            e.preventDefault();
            this.onUploadClick();
        }
    };

    private onConfirmCompletion = (completion: ICompletion): void => {
        const { caption, mentions } = this.state;
        const range = completion.range;
        if (!range || range.start < 0) return;

        const before = caption.slice(0, range.start);
        const after = caption.slice(range.end);
        const insertion = completion.completion + (completion.suffix ?? "");
        const next = before + insertion + after;
        const caret = before.length + insertion.length;

        const newMentions =
            completion.type === "user" && completion.completionId
                ? [...mentions, { userId: completion.completionId, displayName: completion.completion }]
                : mentions;

        this.setState(
            { caption: next, selectionStart: caret, selectionEnd: caret, mentions: newMentions },
            () => {
                const input = this.inputRef.current;
                if (input) {
                    input.focus();
                    input.setSelectionRange(caret, caret);
                }
            },
        );
    };

    public render(): React.ReactNode {
        let title: string;
        if (this.props.totalFiles > 1 && this.props.currentIndex !== undefined) {
            title = _t("upload_file|title_progress", {
                current: this.props.currentIndex + 1,
                total: this.props.totalFiles,
            });
        } else {
            title = _t("upload_file|title");
        }

        const fileId = `mx-uploadconfirmdialog-${this.props.file.name}`;
        const mimeType = this.props.file.type;

        let preview: JSX.Element | undefined;
        let placeholder: JSX.Element | undefined;
        if (mimeType.startsWith("image/")) {
            preview = (
                <img
                    className="mx_UploadConfirmDialog_imagePreview"
                    src={this.state.objectUrl}
                    aria-labelledby={fileId}
                />
            );
        } else if (mimeType.startsWith("video/")) {
            preview = (
                <video
                    className="mx_UploadConfirmDialog_imagePreview"
                    src={this.state.objectUrl}
                    playsInline
                    controls={false}
                />
            );
        } else {
            placeholder = <FilesIcon className="mx_UploadConfirmDialog_fileIcon" height="18px" width="18px" />;
        }

        let uploadAllButton: JSX.Element | undefined;
        if (this.props.currentIndex + 1 < this.props.totalFiles) {
            uploadAllButton = <button onClick={this.onUploadAllClick}>{_t("upload_file|upload_all_button")}</button>;
        }

        const { room } = this.props;

        return (
            <BaseDialog
                className="mx_UploadConfirmDialog"
                fixedWidth={false}
                onFinished={this.onCancelClick}
                title={title}
                contentId="mx_Dialog_content"
            >
                <div id="mx_Dialog_content">
                    <div className="mx_UploadConfirmDialog_previewOuter">
                        <div className="mx_UploadConfirmDialog_previewInner">
                            {preview && <div>{preview}</div>}
                            <div id={fileId}>
                                {placeholder}
                                {this.props.file.name} ({fileSize(this.props.file.size)})
                            </div>
                        </div>
                    </div>
                    <div className="mx_UploadConfirmDialog_captionWrapper mx_no_textinput">
                        <input
                            type="text"
                            ref={this.inputRef}
                            className="mx_UploadConfirmDialog_caption"
                            placeholder="Add a caption (optional)"
                            value={this.state.caption}
                            onChange={this.onCaptionChange}
                            onSelect={this.onCaptionSelect}
                            onKeyDown={this.onCaptionKeyDown}
                            autoFocus={false}
                        />
                        {room && (
                            <Autocomplete
                                ref={this.autocompleteRef}
                                query={this.state.caption}
                                selection={{
                                    start: this.state.selectionStart,
                                    end: this.state.selectionEnd,
                                    beginning: this.state.selectionStart === 0,
                                }}
                                onConfirm={this.onConfirmCompletion}
                                room={room}
                            />
                        )}
                    </div>
                </div>

                <DialogButtons
                    primaryButton={_t("action|upload")}
                    hasCancel={false}
                    onPrimaryButtonClick={this.onUploadClick}
                    focus={true}
                >
                    {uploadAllButton}
                </DialogButtons>
            </BaseDialog>
        );
    }
}
