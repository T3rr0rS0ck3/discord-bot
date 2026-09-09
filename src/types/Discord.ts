import type { Client } from "discord.js";
import type { ICommand } from "../commands/interfaces/ICommand";

export type DiscordBotOptions = {
    token: string;
    guildId?: string;
    commands: ICommand[];
    buttonHandler?: (customId: string, interaction: import("discord.js").ButtonInteraction) => Promise<boolean>;
    onReady?: (client: Client) => Promise<void> | void;
    onStatusChange?: (status: DiscordRuntimeStatus) => void;
};

export type DiscordRuntimeStatus = {
    state: "offline" | "starting" | "online" | "token-invalid" | "guild-unreachable" | "error";
    message: string;
    updatedAt: string;
};

export type SpotifyServiceOptions = {
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
};

export type MusicPlaybackOptions = {
    defaultVolumePercent?: number;
    debugSearch?: boolean;
    youtubeSearchLimit?: number;
    allowedRoleNames?: string[];
    audioDbApiKey?: string;
    audioDbApiVersion?: "v1" | "v2";
};

export type TwitchRoleModuleOptions = {
    guildId?: string;
    broadcasterName?: string;
    clientId?: string;
    clientSecret?: string;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: number;
    followerRoleName?: string;
    subscriberRoleName?: string;
    onTokensUpdated?: (tokens: {
        accessToken: string;
        refreshToken?: string;
        accessTokenExpiresAt?: number;
    }) => Promise<void> | void;
};

export type BotModuleFactoryOptions = {
    systemEnabled?: boolean;
    musicEnabled?: boolean;
    welcomeEnabled?: boolean;
    twitchEnabled?: boolean;
    communityEnabled?: boolean;
    getCommunityChannelNames: () => Promise<string[]>;
    getCommunityState?: (guildId: string) => Promise<{
        categoryId?: string;
        entryId?: string;
        temporaryIds: string[];
    } | undefined>;
    saveCommunityState?: (guildId: string, state: {
        categoryId?: string;
        entryId?: string;
        temporaryIds: string[];
    }) => Promise<void>;
    communityCategoryName?: string;
    communityEmptyTimeoutSeconds?: number;
    communityMaxChannels?: number;

    guildId?: string;
    musicRoleName: string;
    spotifyService: SpotifyServiceOptions;
    musicPlayback: MusicPlaybackOptions;
    welcomeChannelId?: string;
    welcomeRoles?: WelcomeRoleOption[];
    twitchRole?: TwitchRoleModuleOptions;
};

export type MusicBotModuleOptions = {
    guildId?: string;
    musicRoleName: string;
    spotifyService: SpotifyServiceOptions;
    musicPlayback: MusicPlaybackOptions;
};

export type WelcomeRoleOption = {
    name: string;
    emoji: string;
    description: string;
};

export type WelcomeModuleOptions = {
    guildId?: string;
    welcomeChannelId?: string;
    roles: WelcomeRoleOption[];
};

export type BotModuleFactoryOptionsWithWelcome = BotModuleFactoryOptions & {
    welcomeChannelId?: string;
    welcomeRoles?: WelcomeRoleOption[];
};
