import React from "react";
import type { AdminConfig } from "../../types";

type UpdateConfigFn = <K extends keyof AdminConfig>(key: K, value: AdminConfig[K]) => void;

type CoreSettingsSectionProps = {
    config: AdminConfig;
    busy: boolean;
    onUpdateConfig: UpdateConfigFn;
};

export function CoreSettingsSection(props: CoreSettingsSectionProps): React.JSX.Element {
    const { config, busy, onUpdateConfig } = props;

    return (
        <>
            <div className="grid2">
                <div>
                    <label>Discord Token</label>
                    <input
                        type="password"
                        placeholder="Paste your bot token here"
                        value={config.discordToken}
                        disabled={busy}
                        onChange={(event) => onUpdateConfig("discordToken", event.target.value)}
                    />
                </div>
                <div>
                    <label>Guild ID</label>
                    <input
                        type="text"
                        placeholder="Enter the Discord server ID (optional)"
                        value={config.guildId ?? ""}
                        disabled={busy}
                        onChange={(event) => onUpdateConfig("guildId", event.target.value)}
                    />
                </div>
            </div>

            <div className="grid2">
                <div>
                    <label>Admin Username</label>
                    <input
                        type="text"
                        placeholder="Choose the admin login name"
                        value={config.adminUiUsername}
                        disabled={busy}
                        onChange={(event) => onUpdateConfig("adminUiUsername", event.target.value)}
                    />
                </div>
                <div>
                    <label>Admin Password</label>
                    <input
                        type="password"
                        placeholder="Choose a secure admin password"
                        value={config.adminUiToken}
                        disabled={busy}
                        onChange={(event) => onUpdateConfig("adminUiToken", event.target.value)}
                    />
                </div>
            </div>

            <label>Admin UI Port</label>
            <input
                type="number"
                min={1}
                max={65535}
                placeholder="Enter the UI port"
                value={Number.isNaN(config.adminUiPort) ? "" : String(config.adminUiPort)}
                disabled={busy}
                onChange={(event) => {
                    const raw = event.target.value;
                    onUpdateConfig("adminUiPort", raw === "" ? Number.NaN : Number(raw));
                }}
            />
        </>
    );
}
