/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Taako
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import * as DataStore from "@api/DataStore";
import { ChannelToolbarButton } from "@api/HeaderBar";
import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { HeadingSecondary } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import definePlugin, { IconComponent, OptionType } from "@utils/types";
import type { Channel, RenderModalProps } from "@vencord/discord-types";
import {
    ChannelStore,
    Menu,
    Modal,
    NavigationRouter,
    openModal,
    SelectedChannelStore,
    TextArea,
    useEffect,
    useState,
    useStateFromStores,
} from "@webpack/common";

const DATASTORE_KEY = "ChannelScratchpad.entries";

interface ScratchpadEntry {
    notes: string;
    reminderAt: number | null;
    updatedAt: number;
}

type ScratchpadEntries = Record<string, ScratchpadEntry>;

let entries: ScratchpadEntries = {};
let reminderInterval: number | undefined;

const listeners = new Set<() => void>();

const settings = definePluginSettings({
    reminders: {
        type: OptionType.BOOLEAN,
        description: "Show notifications when channel reminders are due",
        default: true,
    },
    hideEmptyButton: {
        type: OptionType.BOOLEAN,
        description: "Hide the channel toolbar button until the channel has a saved scratchpad",
        default: false,
    },
});

const ScratchpadIcon: IconComponent = ({ height = 20, width = 20, className }) => (
    <svg
        className={className}
        width={width}
        height={height}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
    >
        <path d="M6 3h9l3 3v15H6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M15 3v4h4M9 11h6M9 15h6M9 19h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

function emitChange(): void {
    listeners.forEach(listener => listener());
}

function useScratchpadUpdates(): void {
    const [, forceUpdate] = useState(0);

    useEffect(() => {
        const listener = () => forceUpdate(value => value + 1);
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    }, []);
}

function toDateTimeLocal(timestamp: number | null): string {
    if (!timestamp) return "";

    const date = new Date(timestamp);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return localDate.toISOString().slice(0, 16);
}

function formatChannelName(channel: Channel): string {
    return channel.isPrivate() ? channel.name : `#${channel.name}`;
}

async function saveEntry(channelId: string, notes: string, reminderAt: number | null): Promise<void> {
    const trimmedNotes = notes.trim();

    if (!trimmedNotes && !reminderAt) {
        delete entries[channelId];
    } else {
        entries[channelId] = {
            notes: trimmedNotes,
            reminderAt,
            updatedAt: Date.now(),
        };
    }

    await DataStore.set(DATASTORE_KEY, entries);
    emitChange();
}

function ScratchpadModal({ channel, modalProps }: {
    channel: Channel;
    modalProps: RenderModalProps;
}) {
    const existing = entries[channel.id];
    const [notes, setNotes] = useState(existing?.notes ?? "");
    const [reminder, setReminder] = useState(toDateTimeLocal(existing?.reminderAt ?? null));
    const reminderTimestamp = reminder ? new Date(reminder).getTime() : null;
    const invalidReminder = reminderTimestamp !== null
        && (!Number.isFinite(reminderTimestamp) || reminderTimestamp <= Date.now());

    const save = async () => {
        if (invalidReminder) return;
        await saveEntry(channel.id, notes, reminderTimestamp);
        modalProps.onClose();
    };

    const actions: any[] = [
        {
            text: "Cancel",
            variant: "secondary",
            onClick: modalProps.onClose,
        },
        {
            text: "Save",
            variant: "primary",
            disabled: invalidReminder || (!notes.trim() && !reminderTimestamp),
            onClick: save,
        },
    ];

    if (existing) {
        actions.unshift({
            text: "Delete",
            variant: "dangerPrimary",
            onClick: async () => {
                await saveEntry(channel.id, "", null);
                modalProps.onClose();
            },
        });
    }

    return (
        <Modal
            {...modalProps}
            title="Channel Scratchpad"
            subtitle={`Private notes for ${formatChannelName(channel)}`}
            actions={actions}
            notice={invalidReminder
                ? { message: "Choose a reminder time in the future.", type: "critical" }
                : undefined}
        >
            <section className="vc-channel-scratchpad-section">
                <HeadingSecondary>Notes and links</HeadingSecondary>
                <TextArea
                    autoFocus
                    autosize
                    maxLength={10_000}
                    placeholder="Add private notes, links, or anything you want to remember..."
                    value={notes}
                    onChange={setNotes}
                />
            </section>

            <section className="vc-channel-scratchpad-section">
                <HeadingSecondary>Reminder</HeadingSecondary>
                <Paragraph className="vc-channel-scratchpad-help">
                    Optional. You will receive a notification that opens this channel.
                </Paragraph>
                <div className="vc-channel-scratchpad-reminder-row">
                    <input
                        type="datetime-local"
                        className="vc-channel-scratchpad-datetime"
                        min={toDateTimeLocal(Date.now() + 60_000)}
                        value={reminder}
                        onChange={event => setReminder(event.target.value)}
                    />
                    {reminder && (
                        <button
                            type="button"
                            className="vc-channel-scratchpad-clear"
                            onClick={() => setReminder("")}
                        >
                            Clear
                        </button>
                    )}
                </div>
            </section>
        </Modal>
    );
}

function openScratchpad(channel: Channel): void {
    openModal(modalProps => <ScratchpadModal channel={channel} modalProps={modalProps} />);
}

function ScratchpadButton() {
    useScratchpadUpdates();
    const { hideEmptyButton } = settings.use(["hideEmptyButton"]);

    const channel = useStateFromStores(
        [SelectedChannelStore, ChannelStore],
        () => ChannelStore.getChannel(SelectedChannelStore.getChannelId())
    );

    if (!channel) return null;

    const entry = entries[channel.id];
    if (hideEmptyButton && !entry) return null;

    const reminderText = entry?.reminderAt
        ? `Reminder: ${new Date(entry.reminderAt).toLocaleString()}`
        : null;

    return (
        <ChannelToolbarButton
            icon={ScratchpadIcon}
            tooltip={reminderText ?? (entry ? "Edit Channel Scratchpad" : "Add Channel Scratchpad")}
            selected={Boolean(entry)}
            showBadge={Boolean(entry?.reminderAt)}
            badgePosition="top"
            onClick={() => openScratchpad(channel)}
        />
    );
}

const patchChannelContextMenu: NavContextMenuPatchCallback = (children, { channel }) => {
    if (!channel?.id) return;

    children.splice(-1, 0,
        <Menu.MenuItem
            id="vc-channel-scratchpad"
            label={entries[channel.id] ? "Edit Channel Scratchpad" : "Add Channel Scratchpad"}
            action={() => openScratchpad(channel)}
        />
    );
};

async function checkReminders(): Promise<void> {
    if (!settings.store.reminders) return;

    const now = Date.now();
    let changed = false;

    for (const [channelId, entry] of Object.entries(entries)) {
        if (!entry.reminderAt || entry.reminderAt > now) continue;

        const channel = ChannelStore.getChannel(channelId);
        if (entry.notes) {
            entry.reminderAt = null;
        } else {
            delete entries[channelId];
        }
        changed = true;

        if (!channel) continue;

        const body = entry.notes
            ? entry.notes.slice(0, 180)
            : `Reminder for ${formatChannelName(channel)}`;

        void showNotification({
            title: `Channel Scratchpad: ${formatChannelName(channel)}`,
            body,
            onClick: () => NavigationRouter.transitionTo(
                `/channels/${channel.guild_id || "@me"}/${channel.id}`
            ),
        });
    }

    if (changed) {
        await DataStore.set(DATASTORE_KEY, entries);
        emitChange();
    }
}

export default definePlugin({
    name: "ChannelScratchpad",
    description: "Adds private notes, links, and reminders to individual channels.",
    tags: ["Chat", "Organisation", "Utility"],
    dependencies: ["HeaderBarAPI"],
    authors: [{ name: "Taako", id: 103720027483545600n }],
    settings,

    contextMenus: {
        "channel-context": patchChannelContextMenu,
    },

    headerBarButton: {
        icon: ScratchpadIcon,
        render: ScratchpadButton,
        location: "channeltoolbar",
    },

    async start() {
        entries = await DataStore.get<ScratchpadEntries>(DATASTORE_KEY) ?? {};
        emitChange();
        await checkReminders();
        reminderInterval = window.setInterval(() => void checkReminders(), 30_000);
    },

    stop() {
        if (reminderInterval !== undefined) {
            window.clearInterval(reminderInterval);
            reminderInterval = undefined;
        }

        listeners.clear();
    },
});
