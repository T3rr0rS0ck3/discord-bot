import React, { useState } from "react";
import type { AdminConfig } from "../../types";

type UpdateConfigFn = <K extends keyof AdminConfig>(key: K, value: AdminConfig[K]) => void;

type MusicSettingsSectionProps = {
    config: AdminConfig;
    busy: boolean;
    onUpdateConfig: UpdateConfigFn;
};

export function MusicSettingsSection(props: MusicSettingsSectionProps): React.JSX.Element {
    const { config, busy, onUpdateConfig } = props;
    const [showApiKey, setShowApiKey] = useState(false);

    return (
        <>
            <label>Music Role Name <span className="required-mark">*</span></label>
            <input
                type="text"
                placeholder="Enter the role name for music access"
                value={config.musicRoleName}
                required
                disabled={busy}
                onChange={(event) => onUpdateConfig("musicRoleName", event.target.value)}
            />

            <div className="grid2">
                <div>
                    <label>Music Default Volume (0-100)</label>
                    <input
                        type="number"
                        min={0}
                        max={100}
                        placeholder="Choose a default volume level"
                        value={
                            config.musicDefaultVolumePercent === undefined ||
                            Number.isNaN(config.musicDefaultVolumePercent)
                                ? ""
                                : String(config.musicDefaultVolumePercent)
                        }
                        disabled={busy}
                        onChange={(event) => {
                            const raw = event.target.value;
                            onUpdateConfig("musicDefaultVolumePercent", raw === "" ? undefined : Number(raw));
                        }}
                    />
                </div>
                <div>
                    <label>Music YouTube Search Limit (10-100)</label>
                    <input
                        type="number"
                        min={10}
                        max={100}
                        placeholder="Default: 25 results"
                        value={
                            config.musicYoutubeSearchLimit === undefined ||
                            Number.isNaN(config.musicYoutubeSearchLimit)
                                ? ""
                                : String(config.musicYoutubeSearchLimit)
                        }
                        disabled={busy}
                        onChange={(event) => {
                            const raw = event.target.value;
                            onUpdateConfig("musicYoutubeSearchLimit", raw === "" ? undefined : Number(raw));
                        }}
                    />
                </div>
            </div>

            <label className="module-switch setting-switch">
                <input
                    type="checkbox"
                    role="switch"
                    checked={config.musicDebugSearch}
                    disabled={busy}
                    onChange={(event) => onUpdateConfig("musicDebugSearch", event.target.checked)}
                />
                <span className="module-switch-track" aria-hidden="true">
                    <span className="module-switch-thumb"></span>
                </span>
                <span>Music Debug Search: {config.musicDebugSearch ? "Ein" : "Aus"}</span>
            </label>

            <div className="grid2">
                <div>
                    <label>TheAudioDB API Key <span className="required-mark">*</span></label>
                    <div className="secret-field">
                        <input
                            type={showApiKey ? "text" : "password"}
                            placeholder="TheAudioDB key"
                            value={config.audioDbApiKey || "123"}
                            required
                            disabled={busy}
                            onChange={(event) => onUpdateConfig("audioDbApiKey", event.target.value)}
                        />
                        <button
                            className="secret-toggle icon-btn icon-only"
                            type="button"
                            disabled={busy}
                            onClick={() => setShowApiKey(value => !value)}
                            title={showApiKey ? "Hide API key" : "Show API key"}
                            aria-label={showApiKey ? "Hide API key" : "Show API key"}
                        >
                            <i className={`fa-regular ${showApiKey ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true"></i>
                        </button>
                    </div>
                </div>
                <div>
                    <label>TheAudioDB API Version <span className="required-mark">*</span></label>
                    <select
                        value={config.audioDbApiVersion ?? "v1"}
                        required
                        disabled={busy}
                        onChange={(event) => onUpdateConfig("audioDbApiVersion", event.target.value as "v1" | "v2")}
                    >
                        <option value="v1">v1 / Free API</option>
                        <option value="v2">v2 / Premium API</option>
                    </select>
                </div>
            </div>
            <p className="input-hint">v1 uses the key in the URL path. v2 requires a real premium key in the X-API-KEY header; key 123 is the public v1 test key.</p>
        </>
    );
}
