import React, { useEffect, useRef } from "react";
import type { AdminConfig, ChannelOption, EmojiOption, LogEntry, StatusState } from "../types";
import { ActionBar } from "./admin/ActionBar";
import { CommunitySettingsSection } from "./admin/CommunitySettingsSection";
import { ModuleSettingsSection } from "./admin/ModuleSettingsSection";
import { CoreSettingsSection } from "./admin/CoreSettingsSection";
import { MusicSettingsSection } from "./admin/MusicSettingsSection";
import { SpotifySettingsSection } from "./admin/SpotifySettingsSection";
import { TwitchSettingsSection } from "./admin/TwitchSettingsSection";
import { WelcomeSettingsSection } from "./admin/WelcomeSettingsSection";

type CollapsibleRegionProps = {
    title: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
};

function CollapsibleRegion(props: CollapsibleRegionProps): React.JSX.Element {
    return (
        <details className="region" open={props.defaultOpen ?? true}>
            <summary className="region-summary">{props.title}</summary>
            <div className="region-content">{props.children}</div>
        </details>
    );
}

type AdminPanelProps = {
    activePage: "dashboard" | "sqlite";
    username: string | null;
    config: AdminConfig | null;
    status: StatusState;
    busy: boolean;
    busyText: string;
    channels: ChannelOption[];
    emojis: EmojiOption[];
    logs: LogEntry[];
    restartHintText: string;
    hasPendingRestart: boolean;
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
    onLogout: () => void;
    onPageChange: (page: "dashboard" | "sqlite") => void;
};

export function AdminPanel(props: AdminPanelProps): React.JSX.Element {
    const logBodyRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!logBodyRef.current) {
            return;
        }

        logBodyRef.current.scrollTop = logBodyRef.current.scrollHeight;
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

                    {props.activePage === "dashboard" ? (
                        <>
                            <h1>Manage <strong>Discord Bot</strong> Runtime</h1>
                            <p className="muted">Signed in as: {props.username ?? "admin"}</p>
                            <p>All settings are stored in SQLite. Restart is required for Discord/Admin changes.</p>

                            {props.config ? (
                                <>
                                    <CollapsibleRegion title="Module" defaultOpen={true}>
                                        <ModuleSettingsSection config={props.config} busy={props.busy} onUpdateConfig={props.onUpdateConfig} />
                                    </CollapsibleRegion>
                                    <CollapsibleRegion title="Core Settings" defaultOpen={true}>
                                        <CoreSettingsSection
                                            config={props.config}
                                            busy={props.busy}
                                            onUpdateConfig={props.onUpdateConfig}
                                        />
                                    </CollapsibleRegion>

                                    <CollapsibleRegion title="Community Sprachkanäle" defaultOpen={true}>
                                        <CommunitySettingsSection config={props.config} busy={props.busy} onUpdateConfig={props.onUpdateConfig} />
                                    </CollapsibleRegion>

                                    <CollapsibleRegion title="Music Settings" defaultOpen={true}>
                                        <MusicSettingsSection
                                            config={props.config}
                                            busy={props.busy}
                                            onUpdateConfig={props.onUpdateConfig}
                                        />
                                    </CollapsibleRegion>

                                    <CollapsibleRegion title="Spotify Settings" defaultOpen={false}>
                                        <SpotifySettingsSection
                                            config={props.config}
                                            busy={props.busy}
                                            onUpdateConfig={props.onUpdateConfig}
                                        />
                                    </CollapsibleRegion>

                                    <CollapsibleRegion title="Twitch Settings" defaultOpen={false}>
                                        <TwitchSettingsSection
                                            config={props.config}
                                            busy={props.busy}
                                            onUpdateConfig={props.onUpdateConfig}
                                        />
                                    </CollapsibleRegion>

                                    <CollapsibleRegion title="Welcome Role Select" defaultOpen={true}>
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
                                    />

                                    <div className="status" style={{ color: props.status.color }}>
                                        {props.status.text}
                                    </div>
                                    <div
                                        className="status"
                                        style={{ display: props.hasPendingRestart ? "block" : "none", color: "#fbbf24" }}
                                    >
                                        {props.restartHintText}
                                    </div>
                                    <div className="muted">
                                        Note: Welcome changes are applied live. Token/Guild/Admin/Port changes require a
                                        restart.
                                    </div>

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
