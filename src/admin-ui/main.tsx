import React from "react";
import { createRoot } from "react-dom/client";
import { AdminPanel } from "./components/AdminPanel";
import { LoginCard } from "./components/LoginCard";
import { useAdminApp } from "./hooks/useAdminApp";
import type { AuthState } from "./types";

declare global {
    interface Window {
        __ADMIN_INITIAL_AUTH__?: AuthState;
    }
}

function App(): React.JSX.Element {
    const state = useAdminApp(window.__ADMIN_INITIAL_AUTH__ ?? { authenticated: false, username: null });

    if (!state.auth.authenticated) {
        return (
            <LoginCard
                username={state.loginUsername}
                token={state.loginToken}
                loginStatus={state.loginStatus}
                onUsernameChange={state.setLoginUsername}
                onTokenChange={state.setLoginToken}
                onLogin={() => void state.login()}
            />
        );
    }

    return (
        <AdminPanel
            username={state.auth.username}
            config={state.config}
            guildIds={state.guildIds}
            selectedGuildId={state.selectedGuildId}
            toast={state.toast}
            busy={state.busy}
            busyText={state.busyText}
            channels={state.channels}
            emojis={state.emojis}
            logs={state.logs}
            discordStatus={state.discordStatus}
            databaseStatus={state.databaseStatus}
            communityStatus={state.communityStatus}
            communityChannelNames={state.communityChannelNames}
            twitchSyncStatus={state.twitchSyncStatus}
            saveDisabled={state.saveDisabled}
            restartDisabled={state.restartDisabled}
            saveAndRestartDisabled={state.saveAndRestartDisabled}
            onRefreshChannelsAndEmojis={() => void state.refreshChannelsAndEmojis()}
            onUpdateConfig={state.updateConfig}
            onSelectGuild={state.setSelectedGuildId}
            onAddGuild={state.addGuild}
            onRemoveGuild={state.removeGuild}
            onUpdateRole={state.updateRole}
            onAddRole={state.addRole}
            onRemoveRole={state.removeRole}
            onSave={() => void state.saveOnly()}
            onRestart={() => void state.restartOnly()}
            onSaveAndRestart={() => void state.saveAndRestart()}
            onDeleteCommunityChannel={(channelId, channelName) => void state.deleteCommunityChannel(channelId, channelName)}
            onAddCommunityChannelName={state.addCommunityChannelName}
            onRenameCommunityChannelName={state.renameCommunityChannelName}
            onDeleteCommunityChannelName={state.deleteCommunityChannelName}
            onDownloadCommunityChannelNames={state.downloadCommunityChannelNames}
            onImportCommunityChannelNames={state.importCommunityChannelNames}
            onSyncTwitchRoles={() => void state.syncTwitchRoles()}
            onDownloadBackup={() => void state.downloadConfigBackup()}
            onRestoreBackup={file => void state.restoreConfigBackup(file)}
            onLogout={() => void state.logout()}
        />
    );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
