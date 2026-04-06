import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AdminPanel } from "./components/AdminPanel";
import { LoginCard } from "./components/LoginCard";
import { useAdminApp } from "./hooks/useAdminApp";
import type { AuthState } from "./types";

type AdminPage = "dashboard" | "sqlite";

declare global {
    interface Window {
        __ADMIN_INITIAL_AUTH__?: AuthState;
    }
}

function App(): React.JSX.Element {
    const state = useAdminApp(window.__ADMIN_INITIAL_AUTH__ ?? { authenticated: false, username: null });
    const [page, setPage] = useState<AdminPage>(() => {
        const search = new URLSearchParams(window.location.search);
        return search.get("page") === "sqlite" ? "sqlite" : "dashboard";
    });

    useEffect(() => {
        const search = new URLSearchParams(window.location.search);
        if (page === "sqlite") {
            search.set("page", "sqlite");
        } else {
            search.delete("page");
        }

        const nextUrl = `${window.location.pathname}${search.toString() ? `?${search.toString()}` : ""}${window.location.hash}`;
        window.history.replaceState({}, "", nextUrl);
    }, [page]);

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
                activePage={page}
            username={state.auth.username}
            config={state.config}
            status={state.status}
            busy={state.busy}
            busyText={state.busyText}
            channels={state.channels}
            emojis={state.emojis}
            logs={state.logs}
            restartHintText={state.restartHintText}
            hasPendingRestart={state.hasPendingRestart}
            saveDisabled={state.saveDisabled}
            restartDisabled={state.restartDisabled}
            saveAndRestartDisabled={state.saveAndRestartDisabled}
            onRefreshChannelsAndEmojis={() => void state.refreshChannelsAndEmojis()}
            onUpdateConfig={state.updateConfig}
            onUpdateRole={state.updateRole}
            onAddRole={state.addRole}
            onRemoveRole={state.removeRole}
            onSave={() => void state.saveOnly()}
            onRestart={() => void state.restartOnly()}
            onSaveAndRestart={() => void state.saveAndRestart()}
            onLogout={() => void state.logout()}
                onPageChange={setPage}
        />
    );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
