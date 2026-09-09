import React from "react";
import type { AdminConfig } from "../../types";

export function CommunitySettingsSection(props: {
    config: AdminConfig;
    busy: boolean;
    onUpdateConfig: <K extends keyof AdminConfig>(key: K, value: AdminConfig[K]) => void;
}): React.JSX.Element {
    return <>
        <label htmlFor="communityCategoryName">Kategoriename <span className="required-mark">*</span></label>
        <input id="communityCategoryName" maxLength={100} disabled={props.busy}
            value={props.config.communityCategoryName ?? "Community"}
            required onChange={e => props.onUpdateConfig("communityCategoryName", e.target.value)} />
        <label htmlFor="communityMaxChannels">Maximale Anzahl temporärer Sprachkanäle (1-50) <span className="required-mark">*</span></label>
        <input id="communityMaxChannels" type="number" min={1} max={50} step={1}
            required disabled={props.busy} value={props.config.communityMaxChannels ?? 50}
            onChange={e => props.onUpdateConfig("communityMaxChannels", Number(e.target.value))} />
        <p>Standard: 50.</p>
        <label htmlFor="communityEmptyTimeoutSeconds">Leere Sprachkanäle löschen nach (Sekunden) <span className="required-mark">*</span></label>
        <input id="communityEmptyTimeoutSeconds" type="number" min={1} max={86400} step={1}
            required disabled={props.busy} value={props.config.communityEmptyTimeoutSeconds ?? 60}
            onChange={e => props.onUpdateConfig("communityEmptyTimeoutSeconds", Number(e.target.value))} />
        <p>Dem Kanal „➕ Sprachkanal erstellen“ beitreten, um einen eigenen Sprachkanal zu erhalten.</p>
    </>;
}
