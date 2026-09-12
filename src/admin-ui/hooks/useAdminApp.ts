import { useEffect, useMemo, useRef, useState } from "react";
import { adminApi } from "../api/adminApi";
import type {
    AdminConfig,
    AuthState,
    ChannelOption,
    CommunityRuntimeStatus,
    DatabaseStatus,
    DiscordRuntimeStatus,
    EmojiOption,
    LogEntry,
    RestartRelevantState,
    RoleConfig,
    StatusState,
    ToastState,
    TwitchRoleSyncStatus
} from "../types";
import {
    normalizeConfig,
    guildConfigKeys,
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
    const [selectedGuildId, setSelectedGuildId] = useState("");
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
    const [communityStatus, setCommunityStatus] = useState<CommunityRuntimeStatus>({
        configured: false,
        connected: false,
        voiceChannels: []
    });
    const [communityChannelNames, setCommunityChannelNames] = useState<string[]>([]);
    const [twitchSyncStatus, setTwitchSyncStatus] = useState<TwitchRoleSyncStatus>({
        followerChanges: 0,
        subscriberChanges: 0,
        changes: []
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

    const selectedConfig = useMemo<AdminConfig | null>(() => {
        if (!config || !selectedGuildId) return config;
        return { ...config, ...config.guildConfigs?.[selectedGuildId], guildId: selectedGuildId };
    }, [config, selectedGuildId]);

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
        const [cfgResult, channelsResult, emojisResult, communityNamesResult] = await Promise.all([
            adminApi.loadConfig(),
            adminApi.loadChannels(),
            adminApi.loadEmojis(),
            adminApi.loadCommunityChannelNames()
        ]);

        const normalized = normalizeConfig(cfgResult);
        setConfig(normalized);
        setSelectedGuildId(current => normalized.guildIds?.includes(current) ? current : normalized.guildIds?.[0] ?? "");
        setChannels(Array.isArray(channelsResult.channels) ? channelsResult.channels : []);
        setEmojis(Array.isArray(emojisResult.emojis) ? emojisResult.emojis : []);
        setCommunityChannelNames(Array.isArray(communityNamesResult.names) ? communityNamesResult.names : []);

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
        if (!auth.authenticated || !selectedGuildId) return;
        let cancelled = false;
        void Promise.all([adminApi.loadChannels(selectedGuildId), adminApi.loadEmojis(selectedGuildId)])
            .then(([channelsResult, emojisResult]) => {
                if (cancelled) return;
                setChannels(Array.isArray(channelsResult.channels) ? channelsResult.channels : []);
                setEmojis(Array.isArray(emojisResult.emojis) ? emojisResult.emojis : []);
            })
            .catch(() => undefined);
        return () => { cancelled = true; };
    }, [auth.authenticated, selectedGuildId]);

    useEffect(() => {
        if (!auth.authenticated || busy) {
            return;
        }

        let cancelled = false;
        let polling = false;

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

        const loadCommunityStatus = async () => {
            try {
                const result = await adminApi.loadCommunityStatus(selectedGuildId);
                if (!cancelled) setCommunityStatus(result);
            } catch {
                // Community can be disabled while the rest of the dashboard remains available.
            }
        };

        const loadTwitchSyncStatus = async () => {
            try {
                const result = await adminApi.loadTwitchSyncStatus(selectedGuildId);
                if (!cancelled) setTwitchSyncStatus(result);
            } catch {
                // Twitch can be disabled while the rest of the dashboard remains available.
            }
        };

        const poll = async () => {
            if (polling) return;
            polling = true;
            try {
                await Promise.allSettled([
                    loadLogs(),
                    loadStatus(),
                    loadDatabaseStatus(),
                    loadCommunityStatus(),
                    loadTwitchSyncStatus()
                ]);
            } finally {
                polling = false;
            }
        };

        void poll();
        const timer = setInterval(() => {
            void poll();
        }, 2000);

        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [auth.authenticated, busy, selectedGuildId]);

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
                adminApi.loadChannels(selectedGuildId),
                adminApi.loadEmojis(selectedGuildId)
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
            if (selectedGuildId && guildConfigKeys.includes(key as keyof import("../types").GuildConfig)) {
                return {
                    ...prev,
                    guildConfigs: {
                        ...prev.guildConfigs,
                        [selectedGuildId]: { ...prev.guildConfigs?.[selectedGuildId], [key]: value }
                    }
                };
            }
            return { ...prev, [key]: value };
        });
    }

    function addGuild(guildId: string): void {
        if (!/^\d{17,20}$/.test(guildId)) return;
        setConfig(prev => {
            if (!prev || prev.guildIds?.includes(guildId)) return prev;
            const profile = Object.fromEntries(guildConfigKeys.map(key => [key, prev[key]]));
            return { ...prev, guildIds: [...(prev.guildIds ?? []), guildId], guildConfigs: { ...prev.guildConfigs, [guildId]: profile } };
        });
        setSelectedGuildId(guildId);
    }

    function removeGuild(guildId: string): void {
        setConfig(prev => {
            if (!prev) return prev;
            const guildIds = (prev.guildIds ?? []).filter(id => id !== guildId);
            const guildConfigs = { ...prev.guildConfigs };
            delete guildConfigs[guildId];
            setSelectedGuildId(guildIds[0] ?? "");
            return { ...prev, guildId: guildIds[0], guildIds, guildConfigs };
        });
    }

    function updateRole(index: number, patch: Partial<RoleConfig>): void {
        setConfig((prev) => {
            if (!prev) {
                return prev;
            }

            const roles = selectedGuildId ? (prev.guildConfigs?.[selectedGuildId]?.welcomeRoles ?? prev.welcomeRoles) : prev.welcomeRoles;
            const nextRoles = roles.map((role, roleIndex) =>
                roleIndex === index ? { ...role, ...patch } : role
            );
            if (selectedGuildId) return { ...prev, guildConfigs: { ...prev.guildConfigs, [selectedGuildId]: { ...prev.guildConfigs?.[selectedGuildId], welcomeRoles: nextRoles } } };
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
                ...(selectedGuildId
                    ? { guildConfigs: { ...prev.guildConfigs, [selectedGuildId]: { ...prev.guildConfigs?.[selectedGuildId], welcomeRoles: [...(prev.guildConfigs?.[selectedGuildId]?.welcomeRoles ?? prev.welcomeRoles), { emoji: "", name: "", description: "" }] } } }
                    : { welcomeRoles: [...prev.welcomeRoles, { emoji: "", name: "", description: "" }] })
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
                ...(selectedGuildId
                    ? { guildConfigs: { ...prev.guildConfigs, [selectedGuildId]: { ...prev.guildConfigs?.[selectedGuildId], welcomeRoles: (prev.guildConfigs?.[selectedGuildId]?.welcomeRoles ?? prev.welcomeRoles).filter((_, roleIndex) => roleIndex !== index) } } }
                    : { welcomeRoles: prev.welcomeRoles.filter((_, roleIndex) => roleIndex !== index) })
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

    async function syncTwitchRoles(): Promise<void> {
        try {
            setBusyText("Synchronisiere Twitch-Rollen...");
            setBusy(true);
            const response = await adminApi.syncTwitchRoles(selectedGuildId);
            const latest = await adminApi.loadTwitchSyncStatus(selectedGuildId);
            setTwitchSyncStatus(latest);
            const changes = response.result.followerChanges + response.result.subscriberChanges;
            setStatus({ text: `Twitch-Synchronisierung abgeschlossen: ${changes} Rollenänderungen.`, color: "#86efac" });
            showToast(`Twitch-Synchronisierung abgeschlossen: ${changes} Rollenänderungen.`, "system");
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setStatus({ text: message, color: "#fca5a5" });
            showToast(message, "error");
            try { setTwitchSyncStatus(await adminApi.loadTwitchSyncStatus(selectedGuildId)); } catch { }
        } finally {
            setBusy(false);
        }
    }

    async function deleteCommunityChannel(channelId: string, channelName: string): Promise<void> {
        if (!window.confirm(`Den leeren Community-Sprachkanal „${channelName}“ jetzt löschen?`)) return;
        try {
            setBusyText("Lösche Community-Sprachkanal...");
            setBusy(true);
            await adminApi.deleteCommunityChannel(channelId, selectedGuildId);
            setCommunityStatus(await adminApi.loadCommunityStatus(selectedGuildId));
            const message = `Community-Sprachkanal „${channelName}“ gelöscht.`;
            setStatus({ text: message, color: "#86efac" });
            showToast(message, "system");
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setStatus({ text: message, color: "#fca5a5" });
            showToast(message, "error");
        } finally {
            setBusy(false);
        }
    }

    async function addCommunityChannelName(name: string): Promise<void> {
        try {
            const result = await adminApi.addCommunityChannelName(name);
            setCommunityChannelNames(result.names);
            showToast(`Community-Kanalname „${name.trim()}“ hinzugefügt.`, "system");
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            showToast(message, "error");
            throw error;
        }
    }

    async function renameCommunityChannelName(currentName: string, nextName: string): Promise<void> {
        try {
            const result = await adminApi.renameCommunityChannelName(currentName, nextName);
            setCommunityChannelNames(result.names);
            showToast(`Community-Kanalname „${currentName}“ umbenannt.`, "system");
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            showToast(message, "error");
            throw error;
        }
    }

    async function deleteCommunityChannelName(name: string): Promise<void> {
        if (!window.confirm(`Community-Kanalname „${name}“ wirklich löschen?`)) return;
        try {
            const result = await adminApi.deleteCommunityChannelName(name);
            setCommunityChannelNames(result.names);
            showToast(`Community-Kanalname „${name}“ gelöscht.`, "system");
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            showToast(message, "error");
        }
    }

    async function downloadCommunityChannelNames(): Promise<void> {
        try {
            const result = await adminApi.downloadCommunityChannelNames();
            const url = URL.createObjectURL(result.blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = result.fileName;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
            showToast("Community-Kanalnamen exportiert.", "system");
        } catch (error) {
            showToast(error instanceof Error ? error.message : String(error), "error");
        }
    }

    async function importCommunityChannelNames(file: File): Promise<void> {
        try {
            const payload = JSON.parse(await file.text()) as unknown;
            const result = await adminApi.importCommunityChannelNames(payload);
            setCommunityChannelNames(result.names);
            showToast(`${result.names.length} Community-Kanalnamen importiert.`, "system");
        } catch (error) {
            const message = error instanceof SyntaxError
                ? "Die ausgewählte Datei enthält kein gültiges JSON."
                : error instanceof Error ? error.message : String(error);
            showToast(message, "error");
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
        config: selectedConfig,
        guildIds: config?.guildIds ?? [],
        selectedGuildId,
        setSelectedGuildId,
        addGuild,
        removeGuild,
        status,
        toast: visibleToasts,
        busy,
        busyText,
        channels,
        emojis,
        logs,
        discordStatus,
        databaseStatus,
        communityStatus,
        communityChannelNames,
        twitchSyncStatus,
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
        deleteCommunityChannel,
        addCommunityChannelName,
        renameCommunityChannelName,
        deleteCommunityChannelName,
        downloadCommunityChannelNames,
        importCommunityChannelNames,
        syncTwitchRoles,
        downloadConfigBackup,
        restoreConfigBackup
    };
}
