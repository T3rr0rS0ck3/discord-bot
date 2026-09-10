import type { AdminConfig, RestartRelevantState } from "../types";

export const restartFieldLabels: Record<keyof RestartRelevantState, string> = {
    systemEnabled: "Modul System",
    musicEnabled: "Modul Musik",
    welcomeEnabled: "Modul Welcome",
    twitchEnabled: "Modul Twitch",
    communityEnabled: "Modul Community",
    communityVotingEnabled: "Modul Kanalnamen-Abstimmung",
    discordToken: "Discord Token",
    guildId: "Guild ID",
    musicRoleName: "Music Role",
    musicDefaultVolumePercent: "Music Default Volume",
    musicDebugSearch: "Music Debug Search",
    musicYoutubeSearchLimit: "Music YouTube Search Limit",
    audioDbApiKey: "TheAudioDB API Key",
    audioDbApiVersion: "TheAudioDB API Version",
    spotifyClientId: "Spotify Client ID",
    spotifyClientSecret: "Spotify Client Secret",
    spotifyRedirectUri: "Spotify Redirect URI"
};

export function normalizeConfig(input: Partial<AdminConfig>): AdminConfig {
    return {
        systemEnabled: input.systemEnabled === true,
            musicEnabled: input.musicEnabled === true,
            welcomeEnabled: input.welcomeEnabled === true,
            twitchEnabled: input.twitchEnabled === true,
            communityEnabled: input.communityEnabled === true,
            communityVotingEnabled: input.communityVotingEnabled === true,
            communityMaxChannels: Number(input.communityMaxChannels ?? 50),
        communityCategoryName: String(input.communityCategoryName ?? "Community"),
        communityVotingChannelName: String(input.communityVotingChannelName ?? "kanalnamen-abstimmung"),
        communityVotingDurationDays: Number(input.communityVotingDurationDays ?? 7),
        communityEmptyTimeoutSeconds: Number(input.communityEmptyTimeoutSeconds ?? 60),
        discordToken: String(input.discordToken ?? ""),
        guildId: input.guildId ? String(input.guildId) : "",
        adminUiUsername: String(input.adminUiUsername ?? "admin"),
        adminUiToken: String(input.adminUiToken ?? ""),
        adminUiPort: Number(input.adminUiPort ?? 8787),
        adminLoginMaxFailures: Number(input.adminLoginMaxFailures ?? 5),
        adminLoginBlockMinutes: Number(input.adminLoginBlockMinutes ?? 15),
        musicRoleName: String(input.musicRoleName ?? "Music Bot"),
        musicDefaultVolumePercent:
            input.musicDefaultVolumePercent === undefined || input.musicDefaultVolumePercent === null
                ? 50
                : Number(input.musicDefaultVolumePercent),
        musicDebugSearch: input.musicDebugSearch !== false,
        musicYoutubeSearchLimit:
            input.musicYoutubeSearchLimit === undefined || input.musicYoutubeSearchLimit === null
                ? 25
                : Number(input.musicYoutubeSearchLimit),
            audioDbApiKey: input.audioDbApiKey ? String(input.audioDbApiKey) : "123",
            audioDbApiVersion: input.audioDbApiVersion === "v2" ? "v2" : "v1",
        spotifyClientId: input.spotifyClientId ? String(input.spotifyClientId) : "",
        spotifyClientSecret: input.spotifyClientSecret ? String(input.spotifyClientSecret) : "",
        spotifyRedirectUri: input.spotifyRedirectUri ? String(input.spotifyRedirectUri) : "",
        welcomeChannelId: input.welcomeChannelId ? String(input.welcomeChannelId) : "",
        welcomeTitle: String(input.welcomeTitle ?? "👋 Welcome!"),
        welcomeReactionPrompt: String(input.welcomeReactionPrompt ?? "React with an emoji below to get the matching role:"),
        welcomeReactionInstructions: String(input.welcomeReactionInstructions ?? "Click a reaction to get the role. Click it again to remove the role."),
        welcomeRoles: Array.isArray(input.welcomeRoles)
            ? input.welcomeRoles.map((role) => ({
                  emoji: String(role?.emoji ?? ""),
                  name: String(role?.name ?? ""),
                  description: String(role?.description ?? "")
              }))
            : [],
        twitchBroadcasterName: input.twitchBroadcasterName ? String(input.twitchBroadcasterName) : "",
        twitchClientId: input.twitchClientId ? String(input.twitchClientId) : "",
        twitchClientSecret: input.twitchClientSecret ? String(input.twitchClientSecret) : "",
        twitchRedirectUri: input.twitchRedirectUri ? String(input.twitchRedirectUri) : "",
        twitchAccessToken: input.twitchAccessToken ? String(input.twitchAccessToken) : "",
        twitchRefreshToken: input.twitchRefreshToken ? String(input.twitchRefreshToken) : "",
        twitchAccessTokenExpiresAt:
            input.twitchAccessTokenExpiresAt === undefined || input.twitchAccessTokenExpiresAt === null
                ? undefined
                : Number(input.twitchAccessTokenExpiresAt),
        twitchFollowerRoleName: input.twitchFollowerRoleName ? String(input.twitchFollowerRoleName) : "",
        twitchSubscriberRoleName: input.twitchSubscriberRoleName ? String(input.twitchSubscriberRoleName) : ""
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
            audioDbApiKey: cfg.audioDbApiKey?.trim() || "123",
            audioDbApiVersion: cfg.audioDbApiVersion === "v2" ? "v2" : "v1",
        adminUiPort: Number.isNaN(cfg.adminUiPort) ? "" : String(cfg.adminUiPort),
        twitchBroadcasterName: cfg.twitchBroadcasterName?.trim() || "",
        twitchClientId: cfg.twitchClientId?.trim() || "",
        twitchClientSecret: cfg.twitchClientSecret?.trim() || "",
        twitchRedirectUri: cfg.twitchRedirectUri?.trim() || "",
        twitchAccessToken: cfg.twitchAccessToken?.trim() || "",
        twitchRefreshToken: cfg.twitchRefreshToken?.trim() || "",
        twitchAccessTokenExpiresAt:
            cfg.twitchAccessTokenExpiresAt === undefined || Number.isNaN(cfg.twitchAccessTokenExpiresAt)
                ? ""
                : String(cfg.twitchAccessTokenExpiresAt),
        twitchFollowerRoleName: cfg.twitchFollowerRoleName?.trim() || "",
        twitchSubscriberRoleName: cfg.twitchSubscriberRoleName?.trim() || ""
    });
}

export function toRestartRelevantState(cfg: AdminConfig): RestartRelevantState {
    return {
        systemEnabled: cfg.systemEnabled === true,
        musicEnabled: cfg.musicEnabled === true,
        welcomeEnabled: cfg.welcomeEnabled === true,
        twitchEnabled: cfg.twitchEnabled === true,
        communityEnabled: cfg.communityEnabled === true,
        communityVotingEnabled: cfg.communityVotingEnabled === true,
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
            audioDbApiKey: (cfg.audioDbApiKey ?? "").trim(),
            audioDbApiVersion: cfg.audioDbApiVersion === "v2" ? "v2" : "v1",
        spotifyClientId: (cfg.spotifyClientId ?? "").trim(),
        spotifyClientSecret: (cfg.spotifyClientSecret ?? "").trim(),
        spotifyRedirectUri: (cfg.spotifyRedirectUri ?? "").trim()
    };
}
