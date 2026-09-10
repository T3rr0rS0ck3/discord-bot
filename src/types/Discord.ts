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
    redirectUri?: string;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: number;
    followerRoleName?: string;
    subscriberRoleName?: string;
    linkChannelName?: string;
    linkPanelTitle?: string;
    linkPanelMessage?: string;
    createMemberOAuthState?: (state: string, guildId: string, discordUserId: string, expiresAt: number) => Promise<void>;
    getMemberLinks?: (guildId: string) => Promise<import("../admin/AdminConfigStore").TwitchMemberLink[]>;
    deleteMemberLink?: (guildId: string, discordUserId: string) => Promise<boolean>;
    getLinkPanel?: (guildId: string) => Promise<{ channelId: string; messageId: string } | undefined>;
    saveLinkPanel?: (guildId: string, channelId: string, messageId: string) => Promise<void>;
    saveSyncResult?: (result: import("../admin/AdminConfigStore").TwitchRoleSyncResult) => Promise<void>;
    addRoleChange?: (change: import("../admin/AdminConfigStore").TwitchRoleChange) => Promise<void>;
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
    communityVotingEnabled?: boolean;
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
    communityVotingChannelName?: string;
    communityVotingDurationDays?: number;
    addCommunityNameSuggestion?: (guildId: string, name: string, userId: string) => Promise<void>;
    getCommunityNameSuggestionCount?: (guildId: string) => Promise<number>;
    startCommunityNameVotingRound?: (guildId: string, durationMs: number) => Promise<import("../admin/AdminConfigStore").CommunityNameVotingRound | undefined>;
    getCommunityNameVotingRound?: (guildId: string) => Promise<import("../admin/AdminConfigStore").CommunityNameVotingRound | undefined>;
    voteForCommunityName?: (guildId: string, suggestionId: number, userId: string) => Promise<void>;
    finishCommunityNameVotingRound?: (guildId: string) => Promise<string | undefined>;
    getCommunityNameVotingMessage?: (guildId: string) => Promise<{ channelId: string; messageId: string } | undefined>;
    saveCommunityNameVotingMessage?: (guildId: string, channelId: string, messageId: string) => Promise<void>;

    guildId?: string;
    musicRoleName: string;
    musicPlayback: MusicPlaybackOptions;
    welcomeChannelId?: string;
    welcomeTitle?: string;
    welcomeReactionPrompt?: string;
    welcomeReactionInstructions?: string;
    welcomeRoles?: WelcomeRoleOption[];
    twitchLinkChannelName?: string;
    twitchLinkPanelTitle?: string;
    twitchLinkPanelMessage?: string;
    twitchRole?: TwitchRoleModuleOptions;
};

export type MusicBotModuleOptions = {
    guildId?: string;
    musicRoleName: string;
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
    welcomeTitle?: string;
    welcomeReactionPrompt?: string;
    welcomeReactionInstructions?: string;
    roles: WelcomeRoleOption[];
};

export type BotModuleFactoryOptionsWithWelcome = BotModuleFactoryOptions & {
    welcomeChannelId?: string;
    welcomeRoles?: WelcomeRoleOption[];
};
