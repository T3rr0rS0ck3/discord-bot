import { useEffect, useMemo, useRef, useState } from "react";
import { adminApi } from "../api/adminApi";
import type {
    AdminConfig,
    AuthState,
    ChannelOption,
    DatabaseStatus,
    DiscordRuntimeStatus,
    EmojiOption,
    LogEntry,
    RestartRelevantState,
    RoleConfig,
    StatusState,
    ToastState
} from "../types";
import {
    normalizeConfig,
    restartFieldLabels,
    serializeConfig,
    toRestartRelevantState
} from "../utils/config";

const pendingRestartStorageKey = "discord-bot-admin-pending-restart";

export function useAdminApp(initialAuth: AuthState) {
    const [auth, setAuth] = useState<AuthState>(initialAuth);
    const [loginUsername, setLoginUsername] = useState("");
    const [loginToken, setLoginToken] = useState("");
    const [loginStatus, setLoginStatus] = useState<StatusState>({ text: "", color: "#fca5a5" });

    const [config, setConfig] = useState<AdminConfig | null>(null);
    const [status, setStatus] = useState<StatusState>({ text: "", color: "#86efac" });
    const [toasts, setToasts] = useState<ToastState[]>([]);
    const toastTimersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());
    const nextToastIdRef = useRef(0);
    const [busy, setBusy] = useState(false);
    const [busyText, setBusyText] = useState("Restarting bot...");

    const [initialSnapshot, setInitialSnapshot] = useState("");
    const [restartBaseline, setRestartBaseline] = useState<RestartRelevantState | null>(null);
    const [persistedRestartLabels, setPersistedRestartLabels] = useState<string[]>(() => {
        try {
            const value = JSON.parse(localStorage.getItem(pendingRestartStorageKey) ?? "[]");
            return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
        } catch {
            return [];
        }
    });

    const [channels, setChannels] = useState<ChannelOption[]>([]);
    const [emojis, setEmojis] = useState<EmojiOption[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [discordStatus, setDiscordStatus] = useState<DiscordRuntimeStatus>({
        state: "offline",
        message: "Bot is offline.",
        updatedAt: new Date().toISOString()
    });
    const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus>({
        schemaVersion: 0,
        latestMigration: null,
        appliedMigrations: []
    });

    const changedRestartLabels = useMemo(() => {
        if (!config || !restartBaseline) {
            return [];
        }

        const current = toRestartRelevantState(config);
        const changed: string[] = [];

        for (const key of Object.keys(restartFieldLabels) as Array<keyof RestartRelevantState>) {
            if ((restartBaseline[key] ?? "") !== (current[key] ?? "")) {
                changed.push(restartFieldLabels[key]);
            }
        }

        return changed;
    }, [config, restartBaseline]);

    const hasUnsavedChanges = useMemo(() => {
        if (!config) {
            return false;
        }
        return serializeConfig(config) !== initialSnapshot;
    }, [config, initialSnapshot]);

    const pendingRestartLabels = [...new Set([...persistedRestartLabels, ...changedRestartLabels])];
    const hasPendingRestart = pendingRestartLabels.length > 0;
    const restartHintText = hasPendingRestart
        ? `Restart required for: ${pendingRestartLabels.join(", ")}`
        : "";
    const visibleToasts = useMemo<ToastState[]>(() => {
        if (!hasPendingRestart) {
            return toasts;
        }

        return [
            ...toasts,
            {
                id: -1,
                text: restartHintText,
                tone: "restart"
            }
        ];
    }, [hasPendingRestart, restartHintText, toasts]);

    const saveDisabled = busy || !config || !hasUnsavedChanges;
    const restartDisabled = busy || !config;
    const saveAndRestartDisabled = busy || !config || (!hasUnsavedChanges && !hasPendingRestart);

    function showToast(text: string, tone: ToastState["tone"]): void {
        const id = nextToastIdRef.current++;
        setToasts((current) => [...current, { id, text, tone }]);
        const timer = setTimeout(() => {
            setToasts((current) => current.filter((toast) => toast.id !== id));
            toastTimersRef.current.delete(id);
        }, 6000);
        toastTimersRef.current.set(id, timer);
    }

    function rememberPendingRestart(labels: string[]): void {
        const uniqueLabels = [...new Set(labels)];
        setPersistedRestartLabels(uniqueLabels);
        localStorage.setItem(pendingRestartStorageKey, JSON.stringify(uniqueLabels));
    }

    function clearPendingRestart(): void {
        setPersistedRestartLabels([]);
        localStorage.removeItem(pendingRestartStorageKey);
    }

    async function loadConfigAndMetadata(showLoadedStatus: boolean): Promise<void> {
        const [cfgResult, channelsResult, emojisResult] = await Promise.all([
            adminApi.loadConfig(),
            adminApi.loadChannels(),
            adminApi.loadEmojis()
        ]);

        const normalized = normalizeConfig(cfgResult);
        setConfig(normalized);
        setChannels(Array.isArray(channelsResult.channels) ? channelsResult.channels : []);
        setEmojis(Array.isArray(emojisResult.emojis) ? emojisResult.emojis : []);

        setInitialSnapshot(serializeConfig(normalized));
        setRestartBaseline(toRestartRelevantState(normalized));

        if (showLoadedStatus) {
            setStatus({ text: "Configuration loaded.", color: "#86efac" });
            showToast("Configuration loaded.", "system");
        }
    }

    useEffect(() => {
        if (!auth.authenticated) {
            setConfig(null);
            setInitialSnapshot("");
            setRestartBaseline(null);
            setLogs([]);
            return;
        }

        void (async () => {
            try {
                await loadConfigAndMetadata(true);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                setStatus({ text: message, color: "#fca5a5" });
                showToast(message, "error");
            }
        })();
    }, [auth.authenticated]);

    useEffect(() => {
        if (!auth.authenticated) {
            return;
        }

        let cancelled = false;

        const loadLogs = async () => {
            try {
                const result = await adminApi.loadLogs();
                if (!cancelled) {
                    setLogs(Array.isArray(result.logs) ? result.logs : []);
                }
            } catch {
                // Keep UI responsive even if logs endpoint is temporarily unavailable.
            }
        };

        const loadStatus = async () => {
            try {
                const result = await adminApi.loadStatus();
                if (!cancelled) setDiscordStatus(result);
            } catch {
                if (!cancelled) setDiscordStatus({ state: "error", message: "Status unavailable.", updatedAt: new Date().toISOString() });
            }
        };

        const loadDatabaseStatus = async () => {
            try {
                const result = await adminApi.loadDatabaseStatus();
                if (!cancelled) setDatabaseStatus(result);
            } catch {
                // Keep the dashboard usable if the status endpoint is temporarily unavailable.
            }
        };

        void loadLogs();
        void loadStatus();
        void loadDatabaseStatus();
        const timer = setInterval(() => {
            void loadLogs();
            void loadStatus();
            void loadDatabaseStatus();
        }, 2000);

        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [auth.authenticated]);

    async function login(): Promise<void> {
        try {
            const result = await adminApi.login(loginUsername.trim(), loginToken.trim());
            setAuth({ authenticated: true, username: result.username ?? loginUsername.trim() });
            setLoginStatus({ text: "Sign-in successful.", color: "#86efac" });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setLoginStatus({ text: message, color: "#fca5a5" });
        }
    }

    async function logout(): Promise<void> {
        try {
            await adminApi.logout();
            setAuth({ authenticated: false, username: null });
            setStatus({ text: "", color: "#86efac" });
            setLoginStatus({ text: "", color: "#fca5a5" });
            setLoginUsername("");
            setLoginToken("");
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setStatus({ text: message, color: "#fca5a5" });
        }
    }

    async function refreshChannelsAndEmojis(): Promise<void> {
        if (!config) {
            return;
        }

        try {
            const [channelsResult, emojisResult] = await Promise.all([
                adminApi.loadChannels(),
                adminApi.loadEmojis()
            ]);
            setChannels(Array.isArray(channelsResult.channels) ? channelsResult.channels : []);
            setEmojis(Array.isArray(emojisResult.emojis) ? emojisResult.emojis : []);
            setStatus({ text: "Channel and emoji list refreshed.", color: "#86efac" });
            showToast("Channel and emoji list refreshed.", "system");
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setStatus({ text: message, color: "#fca5a5" });
            showToast(message, "error");
        }
    }

    async function saveConfig(restartAfterSave: boolean): Promise<void> {
        if (!config) {
            return;
        }

        const payload = JSON.parse(serializeConfig(config)) as Record<string, unknown>;
        const saveResult = await adminApi.saveConfig(payload);

        const savedConfig = saveResult.config ? normalizeConfig(saveResult.config) : config;
        setConfig(savedConfig);
        setInitialSnapshot(serializeConfig(savedConfig));

        if (restartAfterSave) {
            await adminApi.restart();
            setRestartBaseline(toRestartRelevantState(savedConfig));
            clearPendingRestart();
            setStatus({ text: "Saved and bot restarted.", color: "#86efac" });
            showToast("Configuration saved and bot restarted.", "system");
            return;
        }

        const pendingAfterSave = (() => {
            if (!restartBaseline) {
                return false;
            }
            const current = toRestartRelevantState(savedConfig);
            for (const key of Object.keys(restartFieldLabels) as Array<keyof RestartRelevantState>) {
                if ((restartBaseline[key] ?? "") !== (current[key] ?? "")) {
                    return true;
                }
            }
            return false;
        })();

        if (pendingAfterSave) {
            const current = toRestartRelevantState(savedConfig);
            const labels = (Object.keys(restartFieldLabels) as Array<keyof RestartRelevantState>)
                .filter((key) => (restartBaseline?.[key] ?? "") !== (current[key] ?? ""))
                .map((key) => restartFieldLabels[key]);
            rememberPendingRestart(labels);
        }

        setStatus({
            text: "Configuration saved.",
            color: "#86efac"
        });
        showToast("Configuration saved.", "system");
    }

    function updateConfig<K extends keyof AdminConfig>(key: K, value: AdminConfig[K]): void {
        setConfig((prev) => {
            if (!prev) {
                return prev;
            }
            return { ...prev, [key]: value };
        });
    }

    function updateRole(index: number, patch: Partial<RoleConfig>): void {
        setConfig((prev) => {
            if (!prev) {
                return prev;
            }

            const nextRoles = prev.welcomeRoles.map((role, roleIndex) =>
                roleIndex === index ? { ...role, ...patch } : role
            );

            return { ...prev, welcomeRoles: nextRoles };
        });
    }

    function addRole(): void {
        setConfig((prev) => {
            if (!prev) {
                return prev;
            }
            return {
                ...prev,
                welcomeRoles: [...prev.welcomeRoles, { emoji: "", name: "", description: "" }]
            };
        });
    }

    function removeRole(index: number): void {
        setConfig((prev) => {
            if (!prev) {
                return prev;
            }
            return {
                ...prev,
                welcomeRoles: prev.welcomeRoles.filter((_, roleIndex) => roleIndex !== index)
            };
        });
    }

    async function saveOnly(): Promise<void> {
        try {
            await saveConfig(false);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setStatus({ text: message, color: "#fca5a5" });
            showToast(message, "error");
        }
    }

    async function restartOnly(): Promise<void> {
        if (!config) {
            return;
        }

        try {
            setBusyText("Restarting bot...");
            setBusy(true);
            await adminApi.restart();
            setRestartBaseline(toRestartRelevantState(config));
            clearPendingRestart();
            setStatus({ text: "Bot restarted.", color: "#86efac" });
            showToast("Bot restarted.", "system");
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setStatus({ text: message, color: "#fca5a5" });
            showToast(message, "error");
        } finally {
            setBusy(false);
        }
    }

    async function saveAndRestart(): Promise<void> {
        try {
            setBusyText("Restarting bot...");
            setBusy(true);
            await saveConfig(true);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setStatus({ text: message, color: "#fca5a5" });
            showToast(message, "error");
        } finally {
            setBusy(false);
        }
    }

    async function downloadConfigBackup(): Promise<void> {
        try {
            setBusyText("Creating configuration backup...");
            setBusy(true);
            const result = await adminApi.downloadConfigBackup();
            const url = URL.createObjectURL(result.blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = result.fileName;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
            setStatus({ text: "Configuration backup downloaded.", color: "#86efac" });
            showToast("Configuration backup downloaded.", "system");
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setStatus({ text: message, color: "#fca5a5" });
            showToast(message, "error");
        } finally {
            setBusy(false);
        }
    }

    async function restoreConfigBackup(file: File): Promise<void> {
        try {
            setBusyText("Restoring configuration backup...");
            setBusy(true);
            const raw = await file.text();
            const backup = JSON.parse(raw) as unknown;
            const result = await adminApi.restoreConfigBackup(backup);
            if (!result.config) throw new Error("The restored backup did not return a configuration.");

            const restored = normalizeConfig(result.config);
            setConfig(restored);
            setInitialSnapshot(serializeConfig(restored));
            setStatus({
                text: "Backup restored.",
                color: "#86efac"
            });
            if (result.restartRequired) {
                rememberPendingRestart(result.restartFields);
            }
            showToast("Backup restored.", "system");
        } catch (error) {
            const message = error instanceof SyntaxError
                ? "The selected file is not valid JSON."
                : error instanceof Error ? error.message : String(error);
            setStatus({ text: message, color: "#fca5a5" });
            showToast(message, "error");
        } finally {
            setBusy(false);
        }
    }

    return {
        auth,
        loginUsername,
        loginToken,
        loginStatus,
        config,
        status,
        toast: visibleToasts,
        busy,
        busyText,
        channels,
        emojis,
        logs,
        discordStatus,
        databaseStatus,
        saveDisabled,
        restartDisabled,
        saveAndRestartDisabled,
        setLoginUsername,
        setLoginToken,
        login,
        logout,
        refreshChannelsAndEmojis,
        updateConfig,
        updateRole,
        addRole,
        removeRole,
        saveOnly,
        restartOnly,
        saveAndRestart,
        downloadConfigBackup,
        restoreConfigBackup
    };
}
