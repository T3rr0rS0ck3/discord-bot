import type { AdminConfig, RestartRelevantState } from "../types";

export const restartFieldLabels: Record<keyof RestartRelevantState, string> = {
    discordToken: "Discord Token",
    guildId: "Guild ID",
    musicRoleName: "Music Role",
    musicDefaultVolumePercent: "Music Default Volume",
    musicDebugSearch: "Music Debug Search",
    musicYoutubeSearchLimit: "Music YouTube Search Limit",
    spotifyClientId: "Spotify Client ID",
    spotifyClientSecret: "Spotify Client Secret",
    spotifyRedirectUri: "Spotify Redirect URI"
};

export function normalizeConfig(input: Partial<AdminConfig>): AdminConfig {
    return {
        discordToken: String(input.discordToken ?? ""),
        guildId: input.guildId ? String(input.guildId) : "",
        adminUiUsername: String(input.adminUiUsername ?? "admin"),
        adminUiToken: String(input.adminUiToken ?? ""),
        adminUiPort: Number(input.adminUiPort ?? 8787),
        musicRoleName: String(input.musicRoleName ?? "Music Bot"),
        musicDefaultVolumePercent:
            input.musicDefaultVolumePercent === undefined || input.musicDefaultVolumePercent === null
                ? undefined
                : Number(input.musicDefaultVolumePercent),
        musicDebugSearch: input.musicDebugSearch !== false,
        musicYoutubeSearchLimit:
            input.musicYoutubeSearchLimit === undefined || input.musicYoutubeSearchLimit === null
                ? undefined
                : Number(input.musicYoutubeSearchLimit),
        spotifyClientId: input.spotifyClientId ? String(input.spotifyClientId) : "",
        spotifyClientSecret: input.spotifyClientSecret ? String(input.spotifyClientSecret) : "",
        spotifyRedirectUri: input.spotifyRedirectUri ? String(input.spotifyRedirectUri) : "",
        welcomeChannelId: input.welcomeChannelId ? String(input.welcomeChannelId) : "",
        welcomeRoles: Array.isArray(input.welcomeRoles)
            ? input.welcomeRoles.map((role) => ({
                  emoji: String(role?.emoji ?? ""),
                  name: String(role?.name ?? ""),
                  description: String(role?.description ?? "")
              }))
            : []
    };
}

export function serializeConfig(cfg: AdminConfig): string {
    return JSON.stringify({
        ...cfg,
        discordToken: cfg.discordToken.trim(),
        guildId: cfg.guildId?.trim() || "",
        adminUiUsername: cfg.adminUiUsername.trim(),
        adminUiToken: cfg.adminUiToken.trim(),
        musicRoleName: cfg.musicRoleName.trim(),
        spotifyClientId: cfg.spotifyClientId?.trim() || "",
        spotifyClientSecret: cfg.spotifyClientSecret?.trim() || "",
        spotifyRedirectUri: cfg.spotifyRedirectUri?.trim() || "",
        welcomeChannelId: cfg.welcomeChannelId?.trim() || "",
        welcomeRoles: cfg.welcomeRoles.map((role) => ({
            emoji: role.emoji.trim(),
            name: role.name.trim(),
            description: role.description.trim()
        })),
        musicDefaultVolumePercent:
            cfg.musicDefaultVolumePercent === undefined || Number.isNaN(cfg.musicDefaultVolumePercent)
                ? ""
                : String(cfg.musicDefaultVolumePercent),
        musicYoutubeSearchLimit:
            cfg.musicYoutubeSearchLimit === undefined || Number.isNaN(cfg.musicYoutubeSearchLimit)
                ? ""
                : String(cfg.musicYoutubeSearchLimit),
        adminUiPort: Number.isNaN(cfg.adminUiPort) ? "" : String(cfg.adminUiPort)
    });
}

export function toRestartRelevantState(cfg: AdminConfig): RestartRelevantState {
    return {
        discordToken: cfg.discordToken.trim(),
        guildId: (cfg.guildId ?? "").trim(),
        musicRoleName: cfg.musicRoleName.trim(),
        musicDefaultVolumePercent:
            cfg.musicDefaultVolumePercent === undefined || Number.isNaN(cfg.musicDefaultVolumePercent)
                ? ""
                : String(cfg.musicDefaultVolumePercent),
        musicDebugSearch: cfg.musicDebugSearch,
        musicYoutubeSearchLimit:
            cfg.musicYoutubeSearchLimit === undefined || Number.isNaN(cfg.musicYoutubeSearchLimit)
                ? ""
                : String(cfg.musicYoutubeSearchLimit),
        spotifyClientId: (cfg.spotifyClientId ?? "").trim(),
        spotifyClientSecret: (cfg.spotifyClientSecret ?? "").trim(),
        spotifyRedirectUri: (cfg.spotifyRedirectUri ?? "").trim()
    };
}
