export type RoleConfig = {
    emoji: string;
    name: string;
    description: string;
};

export type AdminConfig = {
    discordToken: string;
    guildId?: string;
    adminUiUsername: string;
    adminUiToken: string;
    adminUiPort: number;
    musicRoleName: string;
    musicDefaultVolumePercent?: number;
    musicDebugSearch: boolean;
    musicYoutubeSearchLimit?: number;
    spotifyClientId?: string;
    spotifyClientSecret?: string;
    spotifyRedirectUri?: string;
    welcomeChannelId?: string;
    welcomeRoles: RoleConfig[];
};

export type AuthState = {
    authenticated: boolean;
    username: string | null;
};

export type StatusState = {
    text: string;
    color: string;
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
    discordToken: string;
    guildId: string;
    musicRoleName: string;
    musicDefaultVolumePercent: string;
    musicDebugSearch: boolean;
    musicYoutubeSearchLimit: string;
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
