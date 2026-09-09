import type {
    AdminConfig,
    ChannelsResponse,
    EmojisResponse,
    LogsResponse,
    LoginResponse,
    SaveResponse,
    DiscordRuntimeStatus
} from "../types";

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const response = await fetch(path, {
        method,
        headers: {
            "Content-Type": "application/json"
        },
        credentials: "same-origin",
        body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({} as { error?: string }));
        throw new Error(error.error ?? `HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
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
        return request<{ ok: boolean }>("/api/restart", "POST", {});
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
    }
};
