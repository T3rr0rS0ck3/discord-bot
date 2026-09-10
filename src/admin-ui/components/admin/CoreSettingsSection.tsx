import React, { useState } from "react";
import type { AdminConfig } from "../../types";

type UpdateConfigFn = <K extends keyof AdminConfig>(key: K, value: AdminConfig[K]) => void;

type CoreSettingsSectionProps = {
    config: AdminConfig;
    busy: boolean;
    onUpdateConfig: UpdateConfigFn;
};

export function CoreSettingsSection(props: CoreSettingsSectionProps): React.JSX.Element {
    const { config, busy, onUpdateConfig } = props;
    const [showAdminPassword, setShowAdminPassword] = useState(false);

    return (
        <>
            <div className="grid2">
                <div>
                    <label>Discord Token <span className="required-mark">*</span></label>
                    <input
                        type="password"
                        placeholder="Paste your bot token here"
                        value={config.discordToken}
                        required
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
                    <label>Admin Username <span className="required-mark">*</span></label>
                    <input
                        type="text"
                        placeholder="Choose the admin login name"
                        value={config.adminUiUsername}
                        required
                        disabled={busy}
                        onChange={(event) => onUpdateConfig("adminUiUsername", event.target.value)}
                    />
                </div>
                <div>
                    <label>Admin Password <span className="required-mark">*</span></label>
                    <div className="secret-field">
                        <input
                            type={showAdminPassword ? "text" : "password"}
                            placeholder="Leave empty to keep the current password"
                            value={config.adminUiToken}
                            disabled={busy}
                            onChange={(event) => onUpdateConfig("adminUiToken", event.target.value)}
                        />
                        <button
                            className="secret-toggle icon-btn icon-only"
                            type="button"
                            disabled={busy}
                            onClick={() => setShowAdminPassword(value => !value)}
                            title={showAdminPassword ? "Hide admin password" : "Show admin password"}
                            aria-label={showAdminPassword ? "Hide admin password" : "Show admin password"}
                        >
                            <i className={`fa-regular ${showAdminPassword ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true"></i>
                        </button>
                    </div>
                </div>
            </div>

            <label>Admin UI Port <span className="required-mark">*</span></label>
            <input
                type="number"
                min={1}
                max={65535}
                placeholder="Enter the UI port"
                value={Number.isNaN(config.adminUiPort) ? "" : String(config.adminUiPort)}
                required
                disabled={busy}
                onChange={(event) => {
                    const raw = event.target.value;
                    onUpdateConfig("adminUiPort", raw === "" ? Number.NaN : Number(raw));
                }}
            />

            <div className="grid2">
                <div>
                    <label>Login-Fehlversuche bis zur Sperre <span className="required-mark">*</span></label>
                    <input
                        type="number"
                        min={1}
                        max={20}
                        step={1}
                        value={props.config.adminLoginMaxFailures ?? 5}
                        required
                        disabled={busy}
                        onChange={(event) => onUpdateConfig("adminLoginMaxFailures", Number(event.target.value))}
                    />
                </div>
                <div>
                    <label>Sperrdauer (Minuten) <span className="required-mark">*</span></label>
                    <input
                        type="number"
                        min={1}
                        max={1440}
                        step={1}
                        value={props.config.adminLoginBlockMinutes ?? 15}
                        required
                        disabled={busy}
                        onChange={(event) => onUpdateConfig("adminLoginBlockMinutes", Number(event.target.value))}
                    />
                </div>
            </div>
        </>
    );
}
