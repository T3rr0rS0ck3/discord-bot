import type { Client } from "discord.js";
import type { AdminConfig } from "../admin/AdminConfigStore";
import { AdminConfigStore } from "../admin/AdminConfigStore";
import { BotModuleFactory } from "../modules/BotModuleFactory";
import type { IBotModule } from "../modules/interfaces/IBotModule";
import type { DiscordRuntimeStatus } from "../types/Discord";
import { RuntimeStatusStore } from "../services/RuntimeStatusStore";
import { DiscordBot } from "./DiscordBot";

export class BotRuntimeManager {
    private config: AdminConfig;
    private modules: IBotModule[] = [];
    private bot?: DiscordBot;

    public constructor(
        initialConfig: AdminConfig,
        private readonly configStore: AdminConfigStore,
        private readonly statusStore: RuntimeStatusStore
    ) {
        this.config = initialConfig;
    }

    public getConfig(): AdminConfig {
        return this.config;
    }

    public getReadyClient(): Client | undefined {
        return this.bot?.getReadyClient();
    }

    public getStatus(): DiscordRuntimeStatus {
        return this.bot?.getStatus() ?? this.statusStore.get();
    }

    public async saveConfig(config: AdminConfig): Promise<void> {
        await this.configStore.save(config);
        this.config = { ...config, adminUiToken: "" };
        await this.applyRuntimeConfig();
    }

    public async start(): Promise<void> {
        await this.stop();

        if (!this.config.discordToken) {
            console.log("[Startup] Discord token is missing in SQLite configuration. Bot will not start.");
            return;
        }

        this.modules = this.createModules();

        for (const module of this.modules) {
            await module.initialize?.();
        }

        const commands = this.modules.flatMap((module) => module.getCommands());
        console.log(`[Modules] Active: ${this.modules.map((module) => module.name).join(", ")}`);

        this.bot = new DiscordBot({
            token: this.config.discordToken,
            guildId: this.config.guildId,
            commands,
            modules: this.modules,
            onReady: async (client) => {
                for (const module of this.modules) {
                    await module.onReady?.(client);
                }
            },
            onStatusChange: (status) => this.statusStore.set(status),
            buttonHandler: async (customId, interaction) => {
                for (const module of this.modules) {
                    if (await module.handleButtonInteraction?.(customId, interaction)) {
                        return true;
                    }
                }

                return false;
            }
        });

        await this.bot.start();
    }

    public async restart(): Promise<void> {
        await this.start();
    }

    public async stop(): Promise<void> {
        for (const module of this.modules) {
            await module.shutdown?.();
        }

        this.modules = [];
        await this.bot?.stop();
        this.bot = undefined;
    }

    private async applyRuntimeConfig(): Promise<void> {
        const readyClient = this.getReadyClient();

        for (const module of this.modules) {
            await module.applyRuntimeConfig?.(
                {
                    communityCategoryName: this.config.communityCategoryName,
                    communityEmptyTimeoutSeconds: this.config.communityEmptyTimeoutSeconds,
                    communityMaxChannels: this.config.communityMaxChannels,
                    communityVotingChannelName: this.config.communityVotingChannelName,
                    communityVotingDurationDays: this.config.communityVotingDurationDays,
                    welcomeChannelId: this.config.welcomeChannelId,
                    welcomeRoles: this.config.welcomeRoles,
                    twitchBroadcasterName: this.config.twitchBroadcasterName,
                    twitchClientId: this.config.twitchClientId,
                    twitchClientSecret: this.config.twitchClientSecret,
                    twitchRedirectUri: this.config.twitchRedirectUri,
                    twitchAccessToken: this.config.twitchAccessToken,
                    twitchRefreshToken: this.config.twitchRefreshToken,
                    twitchAccessTokenExpiresAt: this.config.twitchAccessTokenExpiresAt,
                    twitchFollowerRoleName: this.config.twitchFollowerRoleName,
                    twitchSubscriberRoleName: this.config.twitchSubscriberRoleName
                },
                readyClient
            );
        }

        if (readyClient) {
            console.log("[AdminUI] Runtime configuration was applied directly to the bot.");
        }
    }

    private createModules(): IBotModule[] {
        return BotModuleFactory.create({
            systemEnabled: this.config.systemEnabled,
            musicEnabled: this.config.musicEnabled,
            welcomeEnabled: this.config.welcomeEnabled,
            twitchEnabled: this.config.twitchEnabled,
            communityEnabled: this.config.communityEnabled,
            communityVotingEnabled: this.config.communityVotingEnabled,
            getCommunityChannelNames: () => this.configStore.getCommunityChannelNames(),
            getCommunityState: (guildId) => this.configStore.getCommunityState(guildId),
            saveCommunityState: (guildId, state) => this.configStore.saveCommunityState(guildId, state),
            communityCategoryName: this.config.communityCategoryName,
            communityEmptyTimeoutSeconds: this.config.communityEmptyTimeoutSeconds,
            communityMaxChannels: this.config.communityMaxChannels,
            communityVotingChannelName: this.config.communityVotingChannelName,
            communityVotingDurationDays: this.config.communityVotingDurationDays,
            addCommunityNameSuggestion: (guildId, name, userId) => this.configStore.addCommunityNameSuggestion(guildId, name, userId),
            getCommunityNameSuggestionCount: (guildId) => this.configStore.getCommunityNameSuggestionCount(guildId),
            startCommunityNameVotingRound: (guildId, durationMs) => this.configStore.startCommunityNameVotingRound(guildId, durationMs),
            getCommunityNameVotingRound: (guildId) => this.configStore.getCommunityNameVotingRound(guildId),
            voteForCommunityName: (guildId, suggestionId, userId) => this.configStore.voteForCommunityName(guildId, suggestionId, userId),
            finishCommunityNameVotingRound: (guildId) => this.configStore.finishCommunityNameVotingRound(guildId),
            getCommunityNameVotingMessage: (guildId) => this.configStore.getCommunityNameVotingMessage(guildId),
            saveCommunityNameVotingMessage: (guildId, channelId, messageId) => this.configStore.saveCommunityNameVotingMessage(guildId, channelId, messageId),
            guildId: this.config.guildId,
            musicRoleName: this.config.musicRoleName,
            spotifyService: {
                clientId: this.config.spotifyClientId,
                clientSecret: this.config.spotifyClientSecret,
                redirectUri: this.config.spotifyRedirectUri
            },
            musicPlayback: {
                defaultVolumePercent: this.config.musicDefaultVolumePercent,
                debugSearch: this.config.musicDebugSearch,
                youtubeSearchLimit: this.config.musicYoutubeSearchLimit,
                audioDbApiKey: this.config.audioDbApiKey,
                audioDbApiVersion: this.config.audioDbApiVersion,
                allowedRoleNames: [this.config.musicRoleName]
            },
            welcomeChannelId: this.config.welcomeChannelId,
            welcomeRoles: this.config.welcomeRoles,
            twitchRole: {
                guildId: this.config.guildId,
                broadcasterName: this.config.twitchBroadcasterName,
                clientId: this.config.twitchClientId,
                clientSecret: this.config.twitchClientSecret,
                accessToken: this.config.twitchAccessToken,
                refreshToken: this.config.twitchRefreshToken,
                accessTokenExpiresAt: this.config.twitchAccessTokenExpiresAt,
                followerRoleName: this.config.twitchFollowerRoleName,
                subscriberRoleName: this.config.twitchSubscriberRoleName,
                onTokensUpdated: async (tokens) => {
                    this.config = {
                        ...this.config,
                        twitchAccessToken: tokens.accessToken,
                        twitchRefreshToken: tokens.refreshToken,
                        twitchAccessTokenExpiresAt: tokens.accessTokenExpiresAt
                    };
                    await this.configStore.save(this.config);
                    await this.applyRuntimeConfig();
                }
            }
        });
    }
}