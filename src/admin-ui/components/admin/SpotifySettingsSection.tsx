import React from "react";
import type { AdminConfig } from "../../types";

type UpdateConfigFn = <K extends keyof AdminConfig>(key: K, value: AdminConfig[K]) => void;

type SpotifySettingsSectionProps = {
    config: AdminConfig;
    busy: boolean;
    onUpdateConfig: UpdateConfigFn;
};

export function SpotifySettingsSection(props: SpotifySettingsSectionProps): React.JSX.Element {
    const { config, busy, onUpdateConfig } = props;

    return (
        <>
            <label>Spotify Client ID</label>
            <input
                type="text"
                placeholder="Paste the Spotify app client ID"
                value={config.spotifyClientId ?? ""}
                disabled={busy}
                onChange={(event) => onUpdateConfig("spotifyClientId", event.target.value)}
            />
            <label>Spotify Client Secret</label>
            <input
                type="password"
                placeholder="Paste the Spotify app client secret"
                value={config.spotifyClientSecret ?? ""}
                disabled={busy}
                onChange={(event) => onUpdateConfig("spotifyClientSecret", event.target.value)}
            />
            <label>Spotify Redirect URI</label>
            <input
                type="text"
                placeholder="Enter the OAuth callback URL"
                value={config.spotifyRedirectUri ?? ""}
                disabled={busy}
                onChange={(event) => onUpdateConfig("spotifyRedirectUri", event.target.value)}
            />
        </>
    );
}
