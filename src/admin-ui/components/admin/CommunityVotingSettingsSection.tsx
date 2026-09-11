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
        <label htmlFor="communityVotingDurationHours">Dauer einer Abstimmung <span className="required-mark">*</span></label>
        <select id="communityVotingDurationHours" required disabled={props.busy}
            value={props.config.communityVotingDurationHours ?? 168}
            onChange={event => props.onUpdateConfig("communityVotingDurationHours", Number(event.target.value))}>
            <option value={1}>1 Stunde</option>
            <option value={4}>4 Stunden</option>
            <option value={8}>8 Stunden</option>
            <option value={24}>1 Tag</option>
            <option value={72}>3 Tage</option>
            <option value={168}>1 Woche</option>
            <option value={336}>2 Wochen</option>
            <option value={768}>32 Tage (Maximum)</option>
        </select>
        <p>Discord verarbeitet die Dauer als volle Stunden. Nach dem Start bleibt die Dauer der laufenden Umfrage unverändert.</p>
        <p>Ab vier Vorschlägen werden zufällig vier Namen ausgewählt. Nach Ablauf werden alle vier Kandidaten aus dem Vorschlagspool entfernt und der Gewinner zur Kanalnamenliste hinzugefügt.</p>
    </>;
}