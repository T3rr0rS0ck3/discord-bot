import React from "react";
import type { AdminConfig, CommunityRuntimeStatus } from "../../types";

export function CommunitySettingsSection(props: {
    config: AdminConfig;
    busy: boolean;
    status: CommunityRuntimeStatus;
    onUpdateConfig: <K extends keyof AdminConfig>(key: K, value: AdminConfig[K]) => void;
    onDeleteChannel: (channelId: string, channelName: string) => void;
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
        <div className="log-panel">
            <div className="log-panel-head">
                <span>{props.status.category?.name ?? "Community-Kategorie"}</span>
                <span>{props.status.voiceChannels.length} Sprachkanäle</span>
            </div>
            <div className="log-body">
                {!props.status.connected ? (
                    <div className="log-line">Discord ist derzeit nicht verbunden.</div>
                ) : !props.status.category?.exists ? (
                    <div className="log-line">Die Community-Kategorie ist derzeit nicht verfügbar.</div>
                ) : props.status.voiceChannels.length === 0 ? (
                    <div className="log-line">Aktuell sind keine Sprachkanäle in dieser Kategorie vorhanden.</div>
                ) : (
                    props.status.voiceChannels.map(channel => (
                        <div className="log-line community-channel-row" key={channel.id}>
                            <span className="community-channel-name">Sprachkanal: {channel.name}</span>
                            <span className="log-time community-channel-members">{channel.memberCount} Nutzer</span>
                            {channel.isManaged ? (
                                <button
                                    type="button"
                                    className="del icon-btn icon-only community-channel-delete"
                                    disabled={props.busy || channel.memberCount > 0}
                                    onClick={() => props.onDeleteChannel(channel.id, channel.name)}
                                    title={channel.memberCount > 0 ? "Belegte Sprachkanäle können nicht gelöscht werden" : `Sprachkanal ${channel.name} löschen`}
                                    aria-label={`Sprachkanal ${channel.name} löschen`}
                                >
                                    <i className="fa-solid fa-trash" aria-hidden="true"></i>
                                </button>
                            ) : <span className="community-channel-action-placeholder" aria-hidden="true"></span>}
                        </div>
                    ))
                )}
            </div>
        </div>
    </>;
}
