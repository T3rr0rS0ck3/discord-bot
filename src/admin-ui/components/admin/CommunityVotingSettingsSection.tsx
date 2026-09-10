import React from "react";
import type { AdminConfig } from "../../types";

export function CommunityVotingSettingsSection(props: {
    config: AdminConfig;
    busy: boolean;
    onUpdateConfig: <K extends keyof AdminConfig>(key: K, value: AdminConfig[K]) => void;
}): React.JSX.Element {
    return <>
        <label htmlFor="communityVotingChannelName">Discord-Textkanal <span className="required-mark">*</span></label>
        <input id="communityVotingChannelName" maxLength={100} disabled={props.busy}
            value={props.config.communityVotingChannelName ?? "kanalnamen-abstimmung"}
            required onChange={event => props.onUpdateConfig("communityVotingChannelName", event.target.value)} />
        <label htmlFor="communityVotingDurationDays">Dauer einer Abstimmung (Tage) <span className="required-mark">*</span></label>
        <input id="communityVotingDurationDays" type="number" min={1} max={30} step={1}
            required disabled={props.busy} value={props.config.communityVotingDurationDays ?? 7}
            onChange={event => props.onUpdateConfig("communityVotingDurationDays", Number(event.target.value))} />
        <p>Ab vier Vorschlägen werden zufällig vier Namen ausgewählt. Nach Ablauf werden alle vier Kandidaten aus dem Vorschlagspool entfernt und der Gewinner zur Kanalnamenliste hinzugefügt.</p>
    </>;
}