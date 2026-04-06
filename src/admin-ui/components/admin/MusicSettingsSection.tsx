import React from "react";
import type { AdminConfig } from "../../types";

type UpdateConfigFn = <K extends keyof AdminConfig>(key: K, value: AdminConfig[K]) => void;

type MusicSettingsSectionProps = {
    config: AdminConfig;
    busy: boolean;
    onUpdateConfig: UpdateConfigFn;
};

export function MusicSettingsSection(props: MusicSettingsSectionProps): React.JSX.Element {
    const { config, busy, onUpdateConfig } = props;

    return (
        <>
            <label>Music Role Name</label>
            <input
                type="text"
                placeholder="Enter the role name for music access"
                value={config.musicRoleName}
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
                    <label>Music YouTube Search Limit (1-200)</label>
                    <input
                        type="number"
                        min={1}
                        max={200}
                        placeholder="Set the YouTube search result limit"
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

            <label>Music Debug Search</label>
            <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={config.musicDebugSearch}
                disabled={busy}
                onChange={(event) => onUpdateConfig("musicDebugSearch", event.target.checked)}
            />
        </>
    );
}
