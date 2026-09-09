export type RoleConfig = {
    emoji: string;
    name: string;
    description: string;
};

export type AdminConfig = {
    systemEnabled?: boolean;
    musicEnabled?: boolean;
    welcomeEnabled?: boolean;
    twitchEnabled?: boolean;
    communityEnabled?: boolean;
    communityCategoryName?: string;
    communityEmptyTimeoutSeconds?: number;
    communityMaxChannels?: number;

    discordToken: string;
    guildId?: string;
    adminUiUsername: string;
    adminUiToken: string;
    adminUiPort: number;
    musicRoleName: string;
    musicDefaultVolumePercent?: number;
    musicDebugSearch: boolean;
    musicYoutubeSearchLimit?: number;
    audioDbApiKey?: string;
    audioDbApiVersion?: "v1" | "v2";
    spotifyClientId?: string;
    spotifyClientSecret?: string;
    spotifyRedirectUri?: string;
    welcomeChannelId?: string;
    welcomeRoles: RoleConfig[];
    twitchBroadcasterName?: string;
    twitchClientId?: string;
    twitchClientSecret?: string;
    twitchRedirectUri?: string;
    twitchAccessToken?: string;
    twitchRefreshToken?: string;
    twitchAccessTokenExpiresAt?: number;
    twitchFollowerRoleName?: string;
    twitchSubscriberRoleName?: string;
};

export type AuthState = {
    authenticated: boolean;
    username: string | null;
};

export type StatusState = {
    text: string;
    color: string;
};

export type ToastState = {
    id: number;
    text: string;
    tone: "system" | "error";
};

export type EmojiOption = {
    value: string;
    label: string;
    group?: string;
};

export type ChannelOption = {
    id: string;
    name: string;
};

export type RestartRelevantState = {
    systemEnabled: boolean;
    musicEnabled: boolean;
    welcomeEnabled: boolean;
    twitchEnabled: boolean;
    communityEnabled: boolean;
    discordToken: string;
    guildId: string;
    musicRoleName: string;
    musicDefaultVolumePercent: string;
    musicDebugSearch: boolean;
    musicYoutubeSearchLimit: string;
    audioDbApiKey: string;
    audioDbApiVersion: "v1" | "v2";
    spotifyClientId: string;
    spotifyClientSecret: string;
    spotifyRedirectUri: string;
};

export type SaveResponse = {
    config?: Partial<AdminConfig>;
};

export type LoginResponse = {
    ok: boolean;
    username?: string;
};

export type ChannelsResponse = {
    channels: ChannelOption[];
};

export type EmojisResponse = {
    emojis: EmojiOption[];
};

export type LogEntry = {
    timestamp: number;
    level: string;
    message: string;
};

export type LogsResponse = {
    logs: LogEntry[];
};
