import type { AdminConfig, GuildConfig, RestartRelevantState } from "../types";

export const guildConfigKeys: Array<keyof GuildConfig> = [
    "systemEnabled", "musicEnabled", "welcomeEnabled", "twitchEnabled", "communityEnabled", "communityVotingEnabled",
    "communityCategoryName", "communityVotingChannelName", "communityVotingDurationHours", "communityEmptyTimeoutSeconds", "communityMaxChannels",
    "musicRoleName", "musicDefaultVolumePercent", "musicDebugSearch", "musicYoutubeSearchLimit", "audioDbApiKey", "audioDbApiVersion",
    "welcomeChannelId", "welcomeTitle", "welcomeReactionPrompt", "welcomeReactionInstructions", "welcomeRoles",
    "twitchBroadcasterName", "twitchClientId", "twitchClientSecret", "twitchRedirectUri", "twitchAccessToken", "twitchRefreshToken",
    "twitchAccessTokenExpiresAt", "twitchFollowerRoleName", "twitchSubscriberRoleName", "twitchLinkChannelName", "twitchLinkPanelTitle", "twitchLinkPanelMessage"
];

export const restartFieldLabels: Record<keyof RestartRelevantState, string> = {
    systemEnabled: "Modul System",
    musicEnabled: "Modul Musik",
    welcomeEnabled: "Modul Welcome",
    twitchEnabled: "Modul Twitch",
    communityEnabled: "Modul Community",
    communityVotingEnabled: "Modul Kanalnamen-Abstimmung",
    discordToken: "Discord Token",
    guildIds: "Discord Server IDs",
    guildConfigs: "Server configuration",
    musicRoleName: "Music Role",
    musicDefaultVolumePercent: "Music Default Volume",
    musicDebugSearch: "Music Debug Search",
    musicYoutubeSearchLimit: "Music YouTube Search Limit",
    audioDbApiKey: "TheAudioDB API Key",
    audioDbApiVersion: "TheAudioDB API Version"
};

export function normalizeConfig(input: Partial<AdminConfig>): AdminConfig {
    const guildIds = Array.isArray(input.guildIds)
        ? [...new Set(input.guildIds.map(value => String(value).trim()).filter(Boolean))]
        : input.guildId ? [String(input.guildId).trim()].filter(Boolean) : [];
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
        communityVotingDurationHours: Number(input.communityVotingDurationHours ?? ((input.communityVotingDurationDays ?? 7) * 24)),
        communityEmptyTimeoutSeconds: Number(input.communityEmptyTimeoutSeconds ?? 60),
        discordToken: String(input.discordToken ?? ""),
        guildId: guildIds[0] ?? "",
        guildIds,
        guildConfigs: Object.fromEntries(guildIds.map(id => [id, input.guildConfigs?.[id] ?? {}])),
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
        twitchSubscriberRoleName: input.twitchSubscriberRoleName ? String(input.twitchSubscriberRoleName) : "",
        twitchLinkChannelName: String(input.twitchLinkChannelName ?? "twitch-verknuepfung"),
        twitchLinkPanelTitle: String(input.twitchLinkPanelTitle ?? "Twitch-Konto verbinden"),
        twitchLinkPanelMessage: String(input.twitchLinkPanelMessage ?? "Verbinde dein Twitch-Konto, damit deine Follower- und Abonnentenrollen zuverlässig synchronisiert werden können.")
    };
}

export function serializeConfig(cfg: AdminConfig): string {
    const guildIds = [...new Set((cfg.guildIds ?? (cfg.guildId ? [cfg.guildId] : [])).map(value => value.trim()).filter(Boolean))];
    return JSON.stringify({
        ...cfg,
        discordToken: cfg.discordToken.trim(),
        guildId: guildIds[0] ?? "",
        guildIds,
        guildConfigs: cfg.guildConfigs ?? {},
        adminUiUsername: cfg.adminUiUsername.trim(),
        adminUiToken: cfg.adminUiToken.trim(),
        musicRoleName: cfg.musicRoleName.trim(),
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
        twitchSubscriberRoleName: cfg.twitchSubscriberRoleName?.trim() || "",
        twitchLinkChannelName: cfg.twitchLinkChannelName?.trim() || "twitch-verknuepfung",
        twitchLinkPanelTitle: cfg.twitchLinkPanelTitle?.trim() || "Twitch-Konto verbinden",
        twitchLinkPanelMessage: cfg.twitchLinkPanelMessage?.trim() || "Verbinde dein Twitch-Konto, damit deine Follower- und Abonnentenrollen zuverlässig synchronisiert werden können."
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
        guildIds: [...new Set((cfg.guildIds ?? (cfg.guildId ? [cfg.guildId] : [])).map(value => value.trim()).filter(Boolean))].sort().join(","),
        guildConfigs: JSON.stringify(cfg.guildConfigs ?? {}),
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
            audioDbApiVersion: cfg.audioDbApiVersion === "v2" ? "v2" : "v1"
    };
}
