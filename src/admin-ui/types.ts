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
    communityVotingEnabled?: boolean;
    communityCategoryName?: string;
    communityVotingChannelName?: string;
    communityVotingDurationDays?: number;
    communityEmptyTimeoutSeconds?: number;
    communityMaxChannels?: number;

    discordToken: string;
    guildId?: string;
    adminUiUsername: string;
    adminUiToken: string;
    adminUiPort: number;
    adminLoginMaxFailures?: number;
    adminLoginBlockMinutes?: number;
    musicRoleName: string;
    musicDefaultVolumePercent?: number;
    musicDebugSearch: boolean;
    musicYoutubeSearchLimit?: number;
    audioDbApiKey?: string;
    audioDbApiVersion?: "v1" | "v2";
    welcomeChannelId?: string;
    welcomeTitle?: string;
    welcomeReactionPrompt?: string;
    welcomeReactionInstructions?: string;
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
    twitchLinkChannelName?: string;
    twitchLinkPanelTitle?: string;
    twitchLinkPanelMessage?: string;
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
    tone: "system" | "error" | "restart";
};

export type DiscordRuntimeStatus = {
    state: "offline" | "starting" | "online" | "token-invalid" | "guild-unreachable" | "error";
    message: string;
    updatedAt: string;
};

export type DatabaseStatus = {
    schemaVersion: number;
    latestMigration: string | null;
    appliedMigrations: string[];
};

export type CommunityRuntimeStatus = {
    configured: boolean;
    connected: boolean;
    guildId?: string;
    category?: { id: string; name?: string; exists: boolean };
    voiceChannels: Array<{ id: string; name: string; memberCount: number; isManaged: boolean }>;
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
    communityVotingEnabled: boolean;
    discordToken: string;
    guildId: string;
    musicRoleName: string;
    musicDefaultVolumePercent: string;
    musicDebugSearch: boolean;
    musicYoutubeSearchLimit: string;
    audioDbApiKey: string;
    audioDbApiVersion: "v1" | "v2";
};

export type SaveResponse = {
    config?: Partial<AdminConfig>;
};

export type RestoreBackupResponse = SaveResponse & {
    ok: boolean;
    restartRequired: boolean;
    restartFields: string[];
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

export type CommunityNamesResponse = {
    names: string[];
};

export type LogEntry = {
    timestamp: number;
    level: string;
    message: string;
};

export type LogsResponse = {
    logs: LogEntry[];
};

export type TwitchRoleChange = {
    id?: number;
    guildId: string;
    discordUserId: string;
    twitchUserId: string;
    roleType: "follower" | "subscriber";
    action: "added" | "removed";
    createdAt: number;
};

export type TwitchRoleSyncResult = {
    guildId: string;
    attemptedAt: number;
    successful: boolean;
    error?: string;
    followerChanges: number;
    subscriberChanges: number;
};

export type TwitchRoleSyncStatus = {
    lastAttemptAt?: number;
    lastSuccessfulAt?: number;
    lastError?: string;
    followerChanges: number;
    subscriberChanges: number;
    changes: TwitchRoleChange[];
};
