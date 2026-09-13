import React, { useState } from "react";
import type { AchievementRecentUnlock, AchievementUserState, AdminConfig, ChannelOption, MemberOption } from "../../types";

export function AchievementSettingsSection(props: {
    config: AdminConfig;
    busy: boolean;
    channels: ChannelOption[];
    members: MemberOption[];
    recent: AchievementRecentUnlock[];
    userState?: AchievementUserState;
    onUpdateConfig: <K extends keyof AdminConfig>(key: K, value: AdminConfig[K]) => void;
    onLoadUser: (userId: string) => void;
}): React.JSX.Element {
    const [userId, setUserId] = useState("");
    const toggles = [
        ["achievementPublicProfilesEnabled", "Öffentliche Nutzerprofile"],
        ["achievementHiddenEnabled", "Geheime Achievements"],
        ["achievementCategoryGeneralEnabled", "Allgemein"],
        ["achievementCategoryMusicEnabled", "Musik"],
        ["achievementCategoryCommunityEnabled", "Community"],
        ["achievementCategoryVotingEnabled", "Abstimmungen"],
        ["achievementCategoryWelcomeEnabled", "Welcome"],
        ["achievementCategoryTwitchEnabled", "Twitch"]
    ] as const;
    return <div>
        <div className="grid">
            <div>
                <label htmlFor="achievementNotificationMode">Benachrichtigung</label>
                <select id="achievementNotificationMode" value={props.config.achievementNotificationMode ?? "dm"} disabled={props.busy}
                    onChange={event => props.onUpdateConfig("achievementNotificationMode", event.target.value as AdminConfig["achievementNotificationMode"])}>
                    <option value="dm">Direktnachricht</option><option value="channel">Kanal</option>
                    <option value="both">Direktnachricht und Kanal</option><option value="silent">Stumm</option>
                </select>
            </div>
            <div>
                <label htmlFor="achievementChannelId">Achievement-Kanal</label>
                <select id="achievementChannelId" value={props.config.achievementChannelId ?? ""} disabled={props.busy}
                    onChange={event => props.onUpdateConfig("achievementChannelId", event.target.value)}>
                    <option value="">Kein Kanal</option>
                    {props.channels.map(channel => <option value={channel.id} key={channel.id}>{channel.name}</option>)}
                </select>
            </div>
        </div>
        <h3>Sichtbarkeit und Kategorien</h3>
        <div className="grid">
            {toggles.map(([key, label]) => <label key={key} htmlFor={key}>
                <input id={key} type="checkbox" role="switch" style={{ width: "auto", marginRight: 8 }} disabled={props.busy}
                    checked={props.config[key] !== false} onChange={event => props.onUpdateConfig(key, event.target.checked)} />
                {label}
            </label>)}
        </div>
        <h3>Letzte Freischaltungen</h3>
        {props.recent.length === 0 ? <p className="muted">Noch keine Freischaltungen auf diesem Server.</p> :
            <div className="status-list">{props.recent.map(item => <div key={`${item.userId}:${item.achievementId}:${item.unlockedAt}`}>
                <strong>{item.achievementId}</strong> · Nutzer {item.userId} · {new Date(item.unlockedAt).toLocaleString("de-DE")}
            </div>)}</div>}
        <h3>Nutzerfortschritt</h3>
        <div className="server-selector-actions">
            <select aria-label="Servermitglied" value={userId} disabled={props.busy || props.members.length === 0}
                onChange={event => setUserId(event.target.value)}>
                <option value="">Mitglied auswählen</option>
                {props.members.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}
            </select>
            <button type="button" disabled={props.busy || !userId} onClick={() => props.onLoadUser(userId)}>Laden</button>
        </div>
        {props.members.length === 0 ? <p className="muted">Keine Servermitglieder verfügbar.</p> : null}
        {props.userState ? <p><strong>{props.userState.unlocks.length}</strong> Medaillen freigeschaltet · <strong>{props.userState.progress.length}</strong> Reihen mit Fortschritt</p> : null}
    </div>;
}