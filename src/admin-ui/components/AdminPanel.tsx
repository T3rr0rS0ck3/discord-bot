import React, { useEffect, useRef } from "react";
import type { AdminConfig, ChannelOption, CommunityRuntimeStatus, DatabaseStatus, DiscordRuntimeStatus, EmojiOption, LogEntry, StatusState, ToastState, TwitchRoleSyncStatus } from "../types";
import { ActionBar } from "./admin/ActionBar";
import { CommunitySettingsSection } from "./admin/CommunitySettingsSection";
import { CommunityVotingSettingsSection } from "./admin/CommunityVotingSettingsSection";
import { CoreSettingsSection } from "./admin/CoreSettingsSection";
import { MusicSettingsSection } from "./admin/MusicSettingsSection";
import { TwitchSettingsSection } from "./admin/TwitchSettingsSection";
import { WelcomeSettingsSection } from "./admin/WelcomeSettingsSection";

type CollapsibleRegionProps = {
    title: string;
    defaultOpen?: boolean;
    enabled?: boolean;
    enabledLabel?: string;
    onToggle?: (enabled: boolean) => void;
    children: React.ReactNode;
};

function CollapsibleRegion(props: CollapsibleRegionProps): React.JSX.Element {
    const enabled = props.enabled ?? true;
    return (
        <details className="region" open={enabled && (props.defaultOpen ?? true)}>
            <summary className="region-summary">
                {props.onToggle ? (
                    <label className="module-switch" onClick={event => event.stopPropagation()}>
                        <input
                            type="checkbox"
                            role="switch"
                            checked={enabled}
                            onChange={event => props.onToggle?.(event.target.checked)}
                        />
                        <span className="module-switch-track" aria-hidden="true">
                            <span className="module-switch-thumb"></span>
                        </span>
                    </label>
                ) : null}
                <span className="region-title">{props.title}</span>
                {props.onToggle ? <span className="region-status">{enabledLabelText(props.enabledLabel, enabled)}</span> : null}
            </summary>
            {enabled ? <div className="region-content">{props.children}</div> : null}
        </details>
    );
}

function enabledLabelText(label: string | undefined, enabled: boolean): string {
    return `${label ?? "Modul"}: ${enabled ? "Ein" : "Aus"}`;
}

type AdminPanelProps = {
    activePage: "dashboard" | "sqlite";
    username: string | null;
    config: AdminConfig | null;
    toast: ToastState[];
    busy: boolean;
    busyText: string;
    channels: ChannelOption[];
    emojis: EmojiOption[];
    logs: LogEntry[];
    discordStatus: DiscordRuntimeStatus;
    databaseStatus: DatabaseStatus;
    communityStatus: CommunityRuntimeStatus;
    twitchSyncStatus: TwitchRoleSyncStatus;
    saveDisabled: boolean;
    restartDisabled: boolean;
    saveAndRestartDisabled: boolean;
    onRefreshChannelsAndEmojis: () => void;
    onUpdateConfig: <K extends keyof AdminConfig>(key: K, value: AdminConfig[K]) => void;
    onUpdateRole: (index: number, patch: Partial<AdminConfig["welcomeRoles"][number]>) => void;
    onAddRole: () => void;
    onRemoveRole: (index: number) => void;
    onSave: () => void;
    onRestart: () => void;
    onSaveAndRestart: () => void;
    onCleanupCommunityChannels: () => void;
    onSyncTwitchRoles: () => void;
    onDownloadBackup: () => void;
    onRestoreBackup: (file: File) => void;
    onLogout: () => void;
    onPageChange: (page: "dashboard" | "sqlite") => void;
};

export function AdminPanel(props: AdminPanelProps): React.JSX.Element {
    const logBodyRef = useRef<HTMLDivElement | null>(null);
    const logAutoScrollRef = useRef(true);

    useEffect(() => {
        if (!logBodyRef.current) {
            return;
        }

        const logBody = logBodyRef.current;
        const updateAutoScroll = (): void => {
            const distanceFromBottom = logBody.scrollHeight - logBody.scrollTop - logBody.clientHeight;
            logAutoScrollRef.current = distanceFromBottom <= 12;
        };

        logBody.addEventListener("scroll", updateAutoScroll, { passive: true });
        updateAutoScroll();

        return () => logBody.removeEventListener("scroll", updateAutoScroll);
    }, [props.config]);

    useEffect(() => {
        if (logBodyRef.current && logAutoScrollRef.current) {
            logBodyRef.current.scrollTop = logBodyRef.current.scrollHeight;
        }
    }, [props.logs]);

    return (
        <div className="site-shell">
            <header className="site-header">
                <div className="brand-wrap">
                    <img className="brand-logo" src="https://appnaxx.de/assets/logo.png" alt="appnaxx logo" />
                    <div>
                        <span className="brand-title">appnaxx.de</span>
                        <span className="brand-badge">Bot Runtime Panel</span>
                    </div>
                </div>
                <nav className="header-links" aria-label="External links">
                    <button
                        className={`header-tab${props.activePage === "dashboard" ? " active" : ""}`}
                        type="button"
                        onClick={() => props.onPageChange("dashboard")}
                    >
                        Dashboard
                    </button>
                    <button
                        className={`header-tab${props.activePage === "sqlite" ? " active" : ""}`}
                        type="button"
                        onClick={() => props.onPageChange("sqlite")}
                    >
                        SQLite Browser
                    </button>
                    <a href="https://appnaxx.de" target="_blank" rel="noreferrer">Website</a>
                    <a href="https://github.com/T3rr0rS0ck3/discord-bot" target="_blank" rel="noreferrer">GitHub</a>
                    <button
                        className="header-icon-action"
                        type="button"
                        disabled={props.busy}
                        onClick={props.onLogout}
                        title="Log out"
                        aria-label="Log out"
                    >
                        <i className="fa-solid fa-right-from-bracket" aria-hidden="true"></i>
                    </button>
                </nav>
            </header>

            <div className="wrap">
                <div className="card" style={{ position: "relative" }}>
                    <div className={`loading-overlay${props.busy ? " active" : ""}`} aria-live="polite">
                        <div className="loading-box">
                            <div className="spinner"></div>
                            <div>{props.busyText || "Please wait..."}</div>
                        </div>
                    </div>
                    {props.toast.length > 0 ? (
                        <div className="admin-toast-stack" aria-live="polite">
                            {props.toast.map((toast) => (
                                <div className={`admin-toast admin-toast-${toast.tone}`} role="status" key={toast.id}>
                                    <span className="admin-toast-icon" aria-hidden="true">
                                        <i className={`fa-solid ${toast.tone === "restart" ? "fa-rotate" : toast.tone === "error" ? "fa-circle-exclamation" : "fa-circle-info"}`}></i>
                                    </span>
                                    <span>{toast.text}</span>
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {props.activePage === "dashboard" ? (
                        <>
                            <h1>Manage <strong>Discord Bot</strong> Runtime</h1>
                            <p className="muted">Signed in as: {props.username ?? "admin"}</p>
                            <div className={`discord-status discord-status-${props.discordStatus.state}`} role="status">
                                <span className="discord-status-dot" aria-hidden="true"></span>
                                <span>
                                    <strong>Discord: </strong>{props.discordStatus.message}
                                </span>
                            </div>
                            <div className="database-status">
                                <strong>Database schema:</strong> v{props.databaseStatus.schemaVersion}
                                {props.databaseStatus.latestMigration ? ` (${props.databaseStatus.latestMigration})` : ""}
                            </div>

                            {props.config ? (
                                <>
                                    <CollapsibleRegion
                                        title="Core Settings"
                                        defaultOpen={true}
                                    >
                                        <CoreSettingsSection
                                            config={props.config}
                                            busy={props.busy}
                                            onUpdateConfig={props.onUpdateConfig}
                                        />
                                    </CollapsibleRegion>

                                    <CollapsibleRegion
                                        title="Kanalnamen-Abstimmung"
                                        defaultOpen={true}
                                        enabled={props.config.communityVotingEnabled === true}
                                        enabledLabel="Abstimmung"
                                        onToggle={enabled => props.onUpdateConfig("communityVotingEnabled", enabled)}
                                    >
                                        <CommunityVotingSettingsSection config={props.config} busy={props.busy} onUpdateConfig={props.onUpdateConfig} />
                                    </CollapsibleRegion>

                                    <CollapsibleRegion
                                        title="Community Sprachkanäle"
                                        defaultOpen={true}
                                        enabled={props.config.communityEnabled === true}
                                        enabledLabel="Community"
                                        onToggle={enabled => props.onUpdateConfig("communityEnabled", enabled)}
                                    >
                                        <CommunitySettingsSection
                                            config={props.config}
                                            busy={props.busy}
                                            status={props.communityStatus}
                                            onUpdateConfig={props.onUpdateConfig}
                                            onCleanup={props.onCleanupCommunityChannels}
                                        />
                                    </CollapsibleRegion>

                                    <CollapsibleRegion
                                        title="Music Settings"
                                        defaultOpen={true}
                                        enabled={props.config.musicEnabled === true}
                                        enabledLabel="Musik"
                                        onToggle={enabled => props.onUpdateConfig("musicEnabled", enabled)}
                                    >
                                        <MusicSettingsSection
                                            config={props.config}
                                            busy={props.busy}
                                            onUpdateConfig={props.onUpdateConfig}
                                        />
                                    </CollapsibleRegion>

                                    <CollapsibleRegion
                                        title="Twitch Settings"
                                        defaultOpen={false}
                                        enabled={props.config.twitchEnabled === true}
                                        enabledLabel="Twitch"
                                        onToggle={enabled => props.onUpdateConfig("twitchEnabled", enabled)}
                                    >
                                        <TwitchSettingsSection
                                            config={props.config}
                                            busy={props.busy}
                                            syncStatus={props.twitchSyncStatus}
                                            onUpdateConfig={props.onUpdateConfig}
                                            onSync={props.onSyncTwitchRoles}
                                        />
                                    </CollapsibleRegion>

                                    <CollapsibleRegion
                                        title="Welcome Role Settings"
                                        defaultOpen={true}
                                        enabled={props.config.welcomeEnabled === true}
                                        enabledLabel="Welcome"
                                        onToggle={enabled => props.onUpdateConfig("welcomeEnabled", enabled)}
                                    >
                                        <WelcomeSettingsSection
                                            config={props.config}
                                            channels={props.channels}
                                            emojis={props.emojis}
                                            busy={props.busy}
                                            onUpdateConfig={props.onUpdateConfig}
                                            onRefreshChannelsAndEmojis={props.onRefreshChannelsAndEmojis}
                                            onUpdateRole={props.onUpdateRole}
                                            onAddRole={props.onAddRole}
                                            onRemoveRole={props.onRemoveRole}
                                        />
                                    </CollapsibleRegion>

                                    <ActionBar
                                        saveDisabled={props.saveDisabled}
                                        restartDisabled={props.restartDisabled}
                                        saveAndRestartDisabled={props.saveAndRestartDisabled}
                                        onSave={props.onSave}
                                        onRestart={props.onRestart}
                                        onSaveAndRestart={props.onSaveAndRestart}
                                        onDownloadBackup={props.onDownloadBackup}
                                        onRestoreBackup={props.onRestoreBackup}
                                    />

                                    <CollapsibleRegion title="Runtime Logs" defaultOpen={true}>
                                        <div className="log-panel">
                                            <div className="log-panel-head">
                                                <span>{props.logs.length} entries</span>
                                            </div>
                                            <div className="log-body" ref={logBodyRef}>
                                                {props.logs.length === 0 ? (
                                                    <div className="log-line">No log entries yet.</div>
                                                ) : (
                                                    props.logs.map((entry, index) => {
                                                        const time = new Date(entry.timestamp).toLocaleTimeString("de-DE", {
                                                            hour12: false
                                                        });

                                                        return (
                                                            <div className="log-line" key={`${entry.timestamp}-${index}`}>
                                                                <span style={{ color: "#8ea0d3" }}>[{time}] </span>
                                                                <span className={`log-level ${entry.level.toLowerCase()}`}>
                                                                    {entry.level.toUpperCase()}
                                                                </span>
                                                                <span>{entry.message}</span>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    </CollapsibleRegion>
                                </>
                            ) : (
                                <div className="status">Loading configuration...</div>
                            )}
                        </>
                    ) : (
                        <>
                            <h1>SQLite <strong>Browser</strong></h1>
                            <p className="muted">Signed in as: {props.username ?? "admin"}</p>
                            <p>
                                This page is a separate view inside the admin UI and uses the same authentication
                                session.
                            </p>

                            <div className="sqlite-browser-frame">
                                <iframe title="SQLite Browser" src="/admin/sqlite/" />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

