import React from "react";
import type { AdminConfig } from "../../types";

const modules = [
    ["systemEnabled", "System", "Ping, Sprachkanal beitreten und Nachrichten löschen"],
    ["musicEnabled", "Musik", "Wiedergabe, Player und TheAudioDB-Metadaten"],
    ["welcomeEnabled", "Welcome", "Willkommensnachricht und Role-Select-Rollenauswahl"],
    ["twitchEnabled", "Twitch", "Follower- und Abonnentenrollen synchronisieren"],
    ["communityEnabled", "Community", "Temporäre Sprachkanäle erstellen und aufräumen"]
] as const;

export function ModuleSettingsSection(props: {
    config: AdminConfig;
    busy: boolean;
    onUpdateConfig: <K extends keyof AdminConfig>(key: K, value: AdminConfig[K]) => void;
}): React.JSX.Element {
    return <>
        {modules.map(([key, label, description]) => <div key={key}>
            <label htmlFor={key}>
                <input id={key} type="checkbox" role="switch" style={{ width: "auto", marginRight: 8 }}
                    checked={props.config[key] !== false} disabled={props.busy}
                    onChange={event => props.onUpdateConfig(key, event.target.checked)} />
                {label} — {props.config[key] !== false ? "Ein" : "Aus"}
            </label>
            <p>{description}</p>
        </div>)}
        <p>Mit „Save and restart“ anwenden. Die Auswahl wird in SQLite gespeichert.
            Eingeschaltete Module benötigen weiterhin ihre jeweiligen Einstellungen.
            Vorhandene Kanäle und Rollen bleiben beim Abschalten erhalten.
            Bei ausgeschalteter Community werden temporäre Kanäle nicht aufgeräumt.</p>
    </>;
}
