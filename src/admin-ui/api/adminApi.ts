import type {
    AdminConfig,
    ChannelsResponse,
    EmojisResponse,
    LogsResponse,
    LoginResponse,
    RestoreBackupResponse,
    SaveResponse,
    CommunityRuntimeStatus,
    DiscordRuntimeStatus,
    DatabaseStatus,
    TwitchRoleSyncResult,
    TwitchRoleSyncStatus
} from "../types";

async function request<T>(path: string, method = "GET", body?: unknown, timeoutMs = 15_000): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
        response = await fetch(path, {
            method,
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "same-origin",
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal
        });
    } catch (error) {
        if (controller.signal.aborted) {
            throw new Error(`Request timed out after ${timeoutMs / 1000} seconds.`);
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({} as { error?: string }));
        throw new Error(error.error ?? `HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
}

async function download(path: string): Promise<{ blob: Blob; fileName: string }> {
    const response = await fetch(path, { credentials: "same-origin" });
    if (!response.ok) {
        const error = await response.json().catch(() => ({} as { error?: string }));
        throw new Error(error.error ?? `HTTP ${response.status}`);
    }

    const disposition = response.headers.get("content-disposition") ?? "";
    const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? "discord-bot-config.json";
    return { blob: await response.blob(), fileName };
}

export const adminApi = {
    login(username: string, token: string): Promise<LoginResponse> {
        return request<LoginResponse>("/api/login", "POST", { username, token });
    },
    logout(): Promise<{ ok: boolean }> {
        return request<{ ok: boolean }>("/api/logout", "POST", {});
    },
    loadConfig(): Promise<AdminConfig> {
        return request<AdminConfig>("/api/config");
    },
    saveConfig(payload: Record<string, unknown>): Promise<SaveResponse> {
        return request<SaveResponse>("/api/config", "POST", payload);
    },
    restart(): Promise<{ ok: boolean }> {
        return request<{ ok: boolean }>("/api/restart", "POST", {}, 45_000);
    },
    loadChannels(): Promise<ChannelsResponse> {
        return request<ChannelsResponse>("/api/channels");
    },
    loadEmojis(): Promise<EmojisResponse> {
        return request<EmojisResponse>("/api/emojis");
    },
    loadLogs(): Promise<LogsResponse> {
        return request<LogsResponse>("/api/logs");
    },
    loadStatus(): Promise<DiscordRuntimeStatus> {
        return request<DiscordRuntimeStatus>("/api/status");
    },
    loadDatabaseStatus(): Promise<DatabaseStatus> {
        return request<DatabaseStatus>("/api/database-status");
    },
    loadCommunityStatus(): Promise<CommunityRuntimeStatus> {
        return request<CommunityRuntimeStatus>("/api/community/status");
    },
    deleteCommunityChannel(channelId: string): Promise<{ ok: boolean }> {
        return request<{ ok: boolean }>("/api/community/channel/delete", "POST", { channelId });
    },
    loadTwitchSyncStatus(): Promise<TwitchRoleSyncStatus> {
        return request<TwitchRoleSyncStatus>("/api/twitch/sync-status");
    },
    syncTwitchRoles(): Promise<{ ok: boolean; result: TwitchRoleSyncResult }> {
        return request<{ ok: boolean; result: TwitchRoleSyncResult }>("/api/twitch/sync", "POST", {});
    },
    downloadConfigBackup(): Promise<{ blob: Blob; fileName: string }> {
        return download("/api/config/backup");
    },
    restoreConfigBackup(backup: unknown): Promise<RestoreBackupResponse> {
        return request<RestoreBackupResponse>("/api/config/restore", "POST", backup);
    }
};
