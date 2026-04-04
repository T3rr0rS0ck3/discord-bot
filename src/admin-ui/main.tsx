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
            status={state.status}
            busy={state.busy}
            busyText={state.busyText}
            channels={state.channels}
            emojis={state.emojis}
            restartHintText={state.restartHintText}
            hasPendingRestart={state.hasPendingRestart}
            saveDisabled={state.saveDisabled}
            saveAndRestartDisabled={state.saveAndRestartDisabled}
            onRefreshChannelsAndEmojis={() => void state.refreshChannelsAndEmojis()}
            onUpdateConfig={state.updateConfig}
            onUpdateRole={state.updateRole}
            onAddRole={state.addRole}
            onRemoveRole={state.removeRole}
            onSave={() => void state.saveOnly()}
            onSaveAndRestart={() => void state.saveAndRestart()}
            onLogout={() => void state.logout()}
        />
    );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
