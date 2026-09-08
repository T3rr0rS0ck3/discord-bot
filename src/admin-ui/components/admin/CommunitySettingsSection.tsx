import React from "react";
import type { AdminConfig } from "../../types";

export function CommunitySettingsSection(props: {
    config: AdminConfig;
    busy: boolean;
    onUpdateConfig: <K extends keyof AdminConfig>(key: K, value: AdminConfig[K]) => void;
}): React.JSX.Element {
    return <>
        <label htmlFor="communityCategoryName">Kategoriename</label>
        <input id="communityCategoryName" maxLength={100} disabled={props.busy}
            value={props.config.communityCategoryName ?? "Community"}
            onChange={e => props.onUpdateConfig("communityCategoryName", e.target.value)} />
        <label htmlFor="communityMaxChannels">Maximale Anzahl temporärer Sprachkanäle</label>
        <input id="communityMaxChannels" type="number" min={1} max={50} step={1}
            disabled={props.busy} value={props.config.communityMaxChannels ?? 50}
            onChange={e => props.onUpdateConfig("communityMaxChannels", Number(e.target.value))} />
        <p>1–50, Standard: 50. Discord erlaubt 50 Kanäle je Kategorie inklusive Erstellen-Kanal:
            somit bleiben höchstens 49 Plätze für temporäre Kanäle. Leere Kanäle im Timeout zählen mit.
            Bei vollem Limit wird der Beitritt zum Erstellen-Kanal beendet. Bestehende Kanäle bleiben erhalten.</p>
        <label htmlFor="communityEmptyTimeoutSeconds">Leere Sprachkanäle löschen nach (Sekunden)</label>
        <input id="communityEmptyTimeoutSeconds" type="number" min={1} max={86400} step={1}
            disabled={props.busy} value={props.config.communityEmptyTimeoutSeconds ?? 60}
            onChange={e => props.onUpdateConfig("communityEmptyTimeoutSeconds", Number(e.target.value))} />
        <p>Dem Kanal „➕ Sprachkanal erstellen“ beitreten, um einen eigenen Sprachkanal zu erhalten.
            Namen werden zufällig aus der importierten Liste mit 10.000 Namen ausgewählt.
            Standard: 60 Sekunden. Bei erneutem Beitritt wird die Löschung abgebrochen.
            Änderungen werden beim Speichern übernommen. Eine Guild ID muss eingestellt sein.</p>
    </>;
}
