import React from "react";
import type { AdminConfig, TwitchRoleSyncStatus } from "../../types";

type TwitchSettingsSectionProps = {
    config: AdminConfig;
    busy: boolean;
    syncStatus: TwitchRoleSyncStatus;
    onUpdateConfig: <K extends keyof AdminConfig>(key: K, value: AdminConfig[K]) => void;
    onSync: () => void;
};

export function TwitchSettingsSection(props: TwitchSettingsSectionProps): React.JSX.Element {
    const canStartOAuth = Boolean(
        props.config.twitchClientId?.trim() &&
            props.config.twitchClientSecret?.trim() &&
            props.config.twitchRedirectUri?.trim()
    );

    return (
        <div>
            <div className="input-group">
                <label htmlFor="twitchLinkChannelName">Verknüpfungskanal <span className="required-mark">*</span></label>
                <input id="twitchLinkChannelName" type="text" maxLength={100} required disabled={props.busy}
                    placeholder="twitch-verknuepfung" value={props.config.twitchLinkChannelName ?? ""}
                    onChange={(e) => props.onUpdateConfig("twitchLinkChannelName", e.target.value)} />
                <p className="input-hint">Der Bot erstellt oder verwendet diesen Discord-Textkanal für die Twitch-Verknüpfung.</p>
            </div>

            <div className="input-group">
                <label htmlFor="twitchLinkPanelTitle">Panel-Titel <span className="required-mark">*</span></label>
                <input id="twitchLinkPanelTitle" type="text" maxLength={100} required disabled={props.busy}
                    value={props.config.twitchLinkPanelTitle ?? ""}
                    onChange={(e) => props.onUpdateConfig("twitchLinkPanelTitle", e.target.value)} />
            </div>

            <div className="input-group">
                <label htmlFor="twitchLinkPanelMessage">Panel-Nachricht <span className="required-mark">*</span></label>
                <textarea id="twitchLinkPanelMessage" maxLength={1000} required disabled={props.busy}
                    value={props.config.twitchLinkPanelMessage ?? ""}
                    onChange={(e) => props.onUpdateConfig("twitchLinkPanelMessage", e.target.value)} />
            </div>

            <div className="input-group">
                <label htmlFor="twitchBroadcasterName">Broadcaster Name <span className="required-mark">*</span></label>
                <input
                    id="twitchBroadcasterName"
                    type="text"
                    disabled={props.busy}
                    placeholder="Your Twitch broadcaster name (e.g. t3rr0rs0ck3)"
                    value={props.config.twitchBroadcasterName ?? ""}
                    required
                    onChange={(e) => props.onUpdateConfig("twitchBroadcasterName", e.target.value)}
                />
                <p className="input-hint">The Twitch channel name to sync followers/subscribers from.</p>
            </div>

            <div className="input-group">
                <label htmlFor="twitchClientId">Twitch Client ID <span className="required-mark">*</span></label>
                <input
                    id="twitchClientId"
                    type="text"
                    disabled={props.busy}
                    placeholder="Your Twitch app client ID"
                    value={props.config.twitchClientId ?? ""}
                    required
                    onChange={(e) => props.onUpdateConfig("twitchClientId", e.target.value)}
                />
                <p className="input-hint">Create an app in the Twitch Developer Console and copy the client ID here.</p>
            </div>

            <div className="input-group">
                <label htmlFor="twitchClientSecret">Twitch Client Secret <span className="required-mark">*</span></label>
                <input
                    id="twitchClientSecret"
                    type="password"
                    disabled={props.busy}
                    placeholder="Your Twitch app client secret"
                    value={props.config.twitchClientSecret ?? ""}
                    required
                    onChange={(e) => props.onUpdateConfig("twitchClientSecret", e.target.value)}
                />
                <p className="input-hint">Used on the server to exchange the OAuth code and refresh the token.</p>
            </div>

            <div className="input-group">
                <label htmlFor="twitchRedirectUri">Twitch Redirect URI <span className="required-mark">*</span></label>
                <input
                    id="twitchRedirectUri"
                    type="text"
                    disabled={props.busy}
                    placeholder="Exact callback URL registered in Twitch"
                    value={props.config.twitchRedirectUri ?? ""}
                    required
                    onChange={(e) => props.onUpdateConfig("twitchRedirectUri", e.target.value)}
                />
                <p className="input-hint">This must exactly match the redirect URL in your Twitch app.</p>
            </div>

            <div className="input-group">
                <label htmlFor="twitchAccessToken">Twitch Access Token</label>
                <input
                    id="twitchAccessToken"
                    type="password"
                    disabled={props.busy}
                    placeholder="Auto-filled via OAuth, or paste a token manually"
                    value={props.config.twitchAccessToken ?? ""}
                    onChange={(e) => props.onUpdateConfig("twitchAccessToken", e.target.value)}
                />
                <p className="input-hint">Auto-filled after OAuth login. Manual token entry still works as a fallback.</p>
            </div>

            <div className="input-group">
                <label htmlFor="twitchRefreshToken">Twitch Refresh Token</label>
                <input
                    id="twitchRefreshToken"
                    type="password"
                    disabled={props.busy}
                    placeholder="Auto-filled by OAuth"
                    value={props.config.twitchRefreshToken ?? ""}
                    onChange={(e) => props.onUpdateConfig("twitchRefreshToken", e.target.value)}
                />
                <p className="input-hint">Keeps the Twitch access token refreshed automatically.</p>
            </div>

            <div className="input-group">
                <label htmlFor="twitchAccessTokenExpiresAt">Token Expiry</label>
                <input
                    id="twitchAccessTokenExpiresAt"
                    type="text"
                    disabled={true}
                    value={
                        props.config.twitchAccessTokenExpiresAt
                            ? new Date(props.config.twitchAccessTokenExpiresAt).toLocaleString("de-DE")
                            : "Not set"
                    }
                />
                <p className="input-hint">Automatically updated when OAuth completes or the token refreshes.</p>
            </div>

            <div className="input-group">
                <button
                    type="button"
                    className="button"
                    disabled={props.busy || !canStartOAuth}
                    onClick={() => window.open("/api/twitch/oauth/start", "_blank", "noopener,noreferrer")}
                >
                    Broadcaster mit Twitch verbinden
                </button>
                <p className="input-hint">
                    Opens Twitch login in a new tab and stores the access token automatically after approval.
                </p>
            </div>

            <div className="input-group">
                <label htmlFor="twitchFollowerRoleName">Follower Role Name</label>
                <input
                    id="twitchFollowerRoleName"
                    type="text"
                    disabled={props.busy}
                    placeholder="Discord role name for followers (leave empty to disable)"
                    value={props.config.twitchFollowerRoleName ?? ""}
                    onChange={(e) => props.onUpdateConfig("twitchFollowerRoleName", e.target.value)}
                />
                <p className="input-hint">Bot will create/manage this role automatically. Leave empty to disable follower role assignment.</p>
            </div>

            <div className="input-group">
                <label htmlFor="twitchSubscriberRoleName">Subscriber Role Name</label>
                <input
                    id="twitchSubscriberRoleName"
                    type="text"
                    disabled={props.busy}
                    placeholder="Discord role name for active subscribers (leave empty to disable)"
                    value={props.config.twitchSubscriberRoleName ?? ""}
                    onChange={(e) => props.onUpdateConfig("twitchSubscriberRoleName", e.target.value)}
                />
                <p className="input-hint">Bot will create/manage this role automatically. Leave empty to disable subscriber role assignment.</p>
            </div>

            <p className="muted">
                Mitglieder verbinden ihr Twitch-Konto über die Buttons im konfigurierten Discord-Kanal. Der Bot synchronisiert ausschließlich diese in SQLite gespeicherten Verknüpfungen einmal pro Stunde und direkt nach einer neuen Verbindung.
            </p>

            <div className="input-group">
                <button type="button" className="button" disabled={props.busy} onClick={props.onSync}>
                    Twitch-Rollen jetzt synchronisieren
                </button>
                <p className="input-hint">
                    Letzter erfolgreicher Sync: {props.syncStatus.lastSuccessfulAt
                        ? new Date(props.syncStatus.lastSuccessfulAt).toLocaleString("de-DE")
                        : "Noch keiner"}
                </p>
                {props.syncStatus.lastError ? <p className="input-hint">Letzter Fehler: {props.syncStatus.lastError}</p> : null}
                <p className="input-hint">
                    Letzter Lauf: {props.syncStatus.followerChanges} Follower- und {props.syncStatus.subscriberChanges} Abonnentenrollen geändert.
                </p>
            </div>

            <div className="input-group">
                <label>Letzte Twitch-Rollenänderungen</label>
                {props.syncStatus.changes.length === 0 ? (
                    <p className="input-hint">Noch keine Rollenänderungen protokolliert.</p>
                ) : (
                    <div className="log-body" style={{ maxHeight: "240px" }}>
                        {props.syncStatus.changes.map((change) => (
                            <div className="log-line" key={change.id ?? `${change.discordUserId}-${change.createdAt}`}>
                                <span className="log-time">{new Date(change.createdAt).toLocaleString("de-DE")}</span>{" "}
                                <span>
                                    Discord {change.discordUserId}: {change.roleType === "follower" ? "Follower" : "Abonnent"}-Rolle {change.action === "added" ? "hinzugefügt" : "entfernt"}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
