import type { Client } from "discord.js";
import type { ICommand } from "../commands/interfaces/ICommand";

export type DiscordBotOptions = {
    token: string;
    guildId?: string;
    commands: ICommand[];
    buttonHandler?: (customId: string, interaction: import("discord.js").ButtonInteraction) => Promise<boolean>;
    onReady?: (client: Client) => Promise<void> | void;
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
};

export type BotModuleFactoryOptions = {
    guildId?: string;
    musicRoleName: string;
    spotifyService: SpotifyServiceOptions;
    musicPlayback: MusicPlaybackOptions;
    welcomeChannelId?: string;
    welcomeRoles?: WelcomeRoleOption[];
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
