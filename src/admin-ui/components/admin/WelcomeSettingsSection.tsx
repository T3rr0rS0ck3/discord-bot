import React, { useEffect, useMemo, useRef, useState } from "react";
import type { AdminConfig, ChannelOption, EmojiOption } from "../../types";

type UpdateConfigFn = <K extends keyof AdminConfig>(key: K, value: AdminConfig[K]) => void;

type WelcomeSettingsSectionProps = {
    config: AdminConfig;
    channels: ChannelOption[];
    emojis: EmojiOption[];
    busy: boolean;
    onUpdateConfig: UpdateConfigFn;
    onRefreshChannelsAndEmojis: () => void;
    onUpdateRole: (index: number, patch: Partial<AdminConfig["welcomeRoles"][number]>) => void;
    onAddRole: () => void;
    onRemoveRole: (index: number) => void;
};

type EmojiGroupEntry = [string, EmojiOption[]];

function normalizeEmojiKey(value: string): string {
    return value.replace(/[\uFE0E\uFE0F]/g, "").trim();
}

type EmojiDropdownProps = {
    disabled: boolean;
    selectedValue: string;
    selectedLabel: string;
    groupedEmojis: EmojiGroupEntry[];
    onChange: (value: string) => void;
};

function EmojiDropdown(props: EmojiDropdownProps): React.JSX.Element {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const wrapperRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        function handleOutsideClick(event: MouseEvent): void {
            if (!wrapperRef.current) {
                return;
            }

            if (!wrapperRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        }

        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, []);

    const filteredGroups = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) {
            return props.groupedEmojis;
        }

        return props.groupedEmojis
            .map(([groupName, emojis]) => {
                const filtered = emojis.filter((emoji) => {
                    const label = emoji.label.toLowerCase();
                    const value = emoji.value.toLowerCase();
                    return label.includes(q) || value.includes(q);
                });
                return [groupName, filtered] as EmojiGroupEntry;
            })
            .filter(([, emojis]) => emojis.length > 0);
    }, [props.groupedEmojis, query]);

    return (
        <div className={`emoji-dropdown${open ? " is-open" : ""}`} ref={wrapperRef}>
            <button
                type="button"
                className="emoji-trigger"
                disabled={props.disabled}
                onClick={() => setOpen((prev) => !prev)}
                aria-label="Open emoji dropdown"
            >
                <span className="emoji-trigger-label">{props.selectedLabel || "Select emoji"}</span>
                <span aria-hidden="true">▾</span>
            </button>

            {open ? (
                <div className="emoji-panel" role="dialog" aria-label="Emoji picker">
                    <input
                        className="emoji-search-input"
                        type="text"
                        placeholder="Search emojis or names"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        autoFocus
                    />
                    <div className="emoji-groups">
                        {filteredGroups.length === 0 ? (
                            <div className="emoji-empty">No emoji matches your search</div>
                        ) : (
                            filteredGroups.map(([groupName, emojis]) => (
                                <div key={groupName}>
                                    <div className="emoji-group-title">{groupName}</div>
                                    {emojis.map((emoji) => (
                                        <button
                                            key={`${groupName}-${emoji.value}`}
                                            type="button"
                                            className={`emoji-option${emoji.value === props.selectedValue ? " active" : ""}`}
                                            onClick={() => {
                                                props.onChange(emoji.value);
                                                setOpen(false);
                                            }}
                                        >
                                            {emoji.label}
                                        </button>
                                    ))}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export function WelcomeSettingsSection(props: WelcomeSettingsSectionProps): React.JSX.Element {
    const normalizedEmojiMap = useMemo(() => {
        const map = new Map<string, string>();

        for (const emoji of props.emojis) {
            const normalized = normalizeEmojiKey(emoji.value);
            if (!map.has(normalized)) {
                map.set(normalized, emoji.value);
            }
        }

        return map;
    }, [props.emojis]);
    const emojiLabelMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const emoji of props.emojis) {
            map.set(emoji.value, emoji.label);
        }
        return map;
    }, [props.emojis]);
    const groupedEmojis = useMemo(() => {
        const groups = new Map<string, EmojiOption[]>();

        for (const emoji of props.emojis) {
            const groupName = emoji.group?.trim() || "Other";
            if (!groups.has(groupName)) {
                groups.set(groupName, []);
            }

            groups.get(groupName)!.push(emoji);
        }

        const preferredOrder = [
            "Server Emojis",
            "Smileys & Emotion",
            "People & Body",
            "Components",
            "Animals & Nature",
            "Food & Drink",
            "Travel & Places",
            "Activities",
            "Objects",
            "Symbols",
            "Flags",
            "Other"
        ];

        return [...groups.entries()].sort((a, b) => {
            const aIndex = preferredOrder.indexOf(a[0]);
            const bIndex = preferredOrder.indexOf(b[0]);

            const aRank = aIndex === -1 ? preferredOrder.length : aIndex;
            const bRank = bIndex === -1 ? preferredOrder.length : bIndex;

            if (aRank !== bRank) {
                return aRank - bRank;
            }

            return a[0].localeCompare(b[0], "en");
        });
    }, [props.emojis]);

    return (
        <>
            <label>Welcome Channel <span className="required-mark">*</span></label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <select
                    style={{ flex: 1 }}
                    value={props.config.welcomeChannelId ?? ""}
                    required
                    disabled={props.busy}
                    onChange={(event) => props.onUpdateConfig("welcomeChannelId", event.target.value)}
                >
                    <option value="">Select a channel</option>
                    {props.channels.map((channel) => (
                        <option key={channel.id} value={channel.id}>
                            {`${channel.name} (${channel.id})`}
                        </option>
                    ))}
                    {props.config.welcomeChannelId &&
                    props.channels.every((channel) => channel.id !== props.config.welcomeChannelId) ? (
                        <option value={props.config.welcomeChannelId}>
                            {`Current: ${props.config.welcomeChannelId} (not found)`}
                        </option>
                    ) : null}
                </select>
                <button
                    className="add icon-btn icon-only"
                    type="button"
                    disabled={props.busy}
                    onClick={props.onRefreshChannelsAndEmojis}
                    title="Refresh"
                    aria-label="Refresh"
                >
                    <i className="fa-solid fa-rotate-right" aria-hidden="true"></i>
                </button>
            </div>

            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    margin: "14px 0 8px"
                }}
            >
                <strong>Welcome Roles</strong>
                <button
                    className="add icon-btn icon-only"
                    type="button"
                    disabled={props.busy}
                    onClick={props.onAddRole}
                    title="Add role"
                    aria-label="Add role"
                >
                    <i className="fa-solid fa-user-plus" aria-hidden="true"></i>
                </button>
            </div>

            <div>
                {props.config.welcomeRoles.map((role, index) => {
                    const normalizedRoleEmoji = normalizeEmojiKey(role.emoji);
                    const matchedEmojiValue = normalizedEmojiMap.get(normalizedRoleEmoji);
                    const selectedEmojiValue = matchedEmojiValue ?? role.emoji;
                    const showStoredOption = role.emoji.length > 0 && !matchedEmojiValue;
                    const selectedEmojiLabel =
                        emojiLabelMap.get(selectedEmojiValue) ??
                        (showStoredOption ? `${role.emoji} (saved)` : "Select emoji");

                    const dropdownGroups: EmojiGroupEntry[] = showStoredOption
                        ? [...groupedEmojis, ["Saved", [{ value: role.emoji, label: `${role.emoji} (saved)` }]]]
                        : groupedEmojis;

                    return (
                        <div className="row" key={`role-${index}`}>
                            <EmojiDropdown
                                disabled={props.busy}
                                selectedValue={selectedEmojiValue}
                                selectedLabel={selectedEmojiLabel}
                                groupedEmojis={dropdownGroups}
                                onChange={(value) => props.onUpdateRole(index, { emoji: value })}
                            />
                            <input
                                placeholder="Enter a role name *"
                                value={role.name}
                                required
                                disabled={props.busy}
                                onChange={(event) => props.onUpdateRole(index, { name: event.target.value })}
                            />
                            <input
                                placeholder="Describe what this role is for *"
                                value={role.description}
                                required
                                disabled={props.busy}
                                onChange={(event) =>
                                    props.onUpdateRole(index, { description: event.target.value })
                                }
                            />
                            <button
                                className="del icon-btn icon-only"
                                type="button"
                                disabled={props.busy}
                                onClick={() => props.onRemoveRole(index)}
                                title="Delete role"
                                aria-label="Delete role"
                            >
                                <i className="fa-regular fa-trash-can" aria-hidden="true"></i>
                            </button>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
