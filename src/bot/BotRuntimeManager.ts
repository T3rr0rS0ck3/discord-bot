import { ChannelType, type Client } from "discord.js";
import type { AdminConfig } from "../admin/AdminConfigStore";
import { AdminConfigStore } from "../admin/AdminConfigStore";
import { BotModuleFactory } from "../modules/BotModuleFactory";
import { CommunityModule } from "../modules/CommunityModule";
import { TwitchRoleModule } from "../modules/TwitchRoleModule";
import type { IBotModule } from "../modules/interfaces/IBotModule";
import type { CommunityRuntimeStatus, DiscordRuntimeStatus } from "../types/Discord";
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

    public async getCommunityStatus(): Promise<CommunityRuntimeStatus> {
        const guildId = this.config.guildId;
        if (!guildId) {
            return { configured: false, connected: false, voiceChannels: [] };
        }

        const state = await this.configStore.getCommunityState(guildId);
        const client = this.getReadyClient();
        if (!client) {
            return {
                configured: Boolean(state),
                connected: false,
                guildId,
                category: state?.categoryId ? { id: state.categoryId, exists: false } : undefined,
                voiceChannels: []
            };
        }

        const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
            return { configured: Boolean(state), connected: false, guildId, voiceChannels: [] };
        }

        const category = state?.categoryId ? guild.channels.cache.get(state.categoryId) : undefined;
        const voiceChannels = category
            ? this.collectCommunityVoiceChannels(guild, category.id, state?.entryId, state?.temporaryIds ?? [])
            : [];

        return {
            configured: Boolean(state),
            connected: true,
            guildId,
            category: state?.categoryId ? { id: state.categoryId, name: category?.name, exists: Boolean(category) } : undefined,
            voiceChannels
        };
    }

    private collectCommunityVoiceChannels(
        guild: import("discord.js").Guild,
        categoryId: string,
        entryChannelId: string | undefined,
        temporaryIds: string[]
    ): CommunityRuntimeStatus["voiceChannels"] {
        const result: CommunityRuntimeStatus["voiceChannels"] = [];
        const managedIds = new Set(temporaryIds);
        const channels = Array.from(guild.channels.cache.values());
        for (const channel of channels) {
            const isSupportedVoiceChannel = channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice;
            if (!isSupportedVoiceChannel || channel.parentId !== categoryId || channel.id === entryChannelId) continue;
            result.push({
                id: channel.id,
                name: channel.name,
                memberCount: channel.members.size,
                isManaged: managedIds.has(channel.id)
            });
        }
        return result.sort((left, right) => left.name.localeCompare(right.name, "de"));
    }

    public async deleteCommunityChannel(channelId: string): Promise<void> {
        const module = this.modules.find((item): item is CommunityModule => item instanceof CommunityModule);
        if (!module) throw new Error("Das Community-Modul ist nicht aktiv.");
        await module.deleteManagedChannel(channelId);
    }

    public async saveConfig(config: AdminConfig): Promise<void> {
        await this.configStore.save(config);
        this.config = { ...config, adminUiToken: "" };
        void this.applyRuntimeConfig().catch(error => {
            console.error("[AdminUI] Runtime configuration could not be applied:", error);
        });
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

    public async syncTwitchRoles(): Promise<import("../admin/AdminConfigStore").TwitchRoleSyncResult> {
        const module = this.modules.find((item): item is TwitchRoleModule => item instanceof TwitchRoleModule);
        if (!module) throw new Error("Das Twitch-Modul ist nicht aktiv.");
        const result = await module.syncNow();
        if (!result) throw new Error("Der Twitch-Sync kann erst nach dem Discord-Start ausgeführt werden.");
        return result;
    }

    public async stop(): Promise<void> {
        for (const module of this.modules) {
            if (!module.shutdown) continue;
            try {
                await this.withTimeout(Promise.resolve(module.shutdown()), 10_000, `Shutdown des Moduls ${module.name}`);
            } catch (error) {
                console.error(`[Modules] ${module.name} shutdown did not finish cleanly:`, error);
            }
        }

        this.modules = [];
        if (this.bot) {
            await this.withTimeout(this.bot.stop(), 10_000, "Discord shutdown");
        }
        this.bot = undefined;
    }

    private async withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
        let timer: NodeJS.Timeout | undefined;
        try {
            return await Promise.race([
                operation,
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs / 1000} seconds.`)), timeoutMs);
                })
            ]);
        } finally {
            if (timer) clearTimeout(timer);
        }
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
                    welcomeTitle: this.config.welcomeTitle,
                    welcomeReactionPrompt: this.config.welcomeReactionPrompt,
                    welcomeReactionInstructions: this.config.welcomeReactionInstructions,
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
                    ,twitchLinkChannelName: this.config.twitchLinkChannelName
                    ,twitchLinkPanelTitle: this.config.twitchLinkPanelTitle
                    ,twitchLinkPanelMessage: this.config.twitchLinkPanelMessage
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
            musicPlayback: {
                defaultVolumePercent: this.config.musicDefaultVolumePercent,
                debugSearch: this.config.musicDebugSearch,
                youtubeSearchLimit: this.config.musicYoutubeSearchLimit,
                audioDbApiKey: this.config.audioDbApiKey,
                audioDbApiVersion: this.config.audioDbApiVersion,
                allowedRoleNames: [this.config.musicRoleName]
            },
            welcomeChannelId: this.config.welcomeChannelId,
            welcomeTitle: this.config.welcomeTitle,
            welcomeReactionPrompt: this.config.welcomeReactionPrompt,
            welcomeReactionInstructions: this.config.welcomeReactionInstructions,
            welcomeRoles: this.config.welcomeRoles,
            twitchRole: {
                guildId: this.config.guildId,
                broadcasterName: this.config.twitchBroadcasterName,
                clientId: this.config.twitchClientId,
                clientSecret: this.config.twitchClientSecret,
                redirectUri: this.config.twitchRedirectUri,
                accessToken: this.config.twitchAccessToken,
                refreshToken: this.config.twitchRefreshToken,
                accessTokenExpiresAt: this.config.twitchAccessTokenExpiresAt,
                followerRoleName: this.config.twitchFollowerRoleName,
                subscriberRoleName: this.config.twitchSubscriberRoleName,
                linkChannelName: this.config.twitchLinkChannelName,
                linkPanelTitle: this.config.twitchLinkPanelTitle,
                linkPanelMessage: this.config.twitchLinkPanelMessage,
                createMemberOAuthState: (state, guildId, discordUserId, expiresAt) => this.configStore.createTwitchMemberOAuthState(state, guildId, discordUserId, expiresAt),
                getMemberLinks: (guildId) => this.configStore.getTwitchMemberLinks(guildId),
                deleteMemberLink: (guildId, discordUserId) => this.configStore.deleteTwitchMemberLink(guildId, discordUserId),
                getLinkPanel: (guildId) => this.configStore.getTwitchLinkPanel(guildId),
                saveLinkPanel: (guildId, channelId, messageId) => this.configStore.saveTwitchLinkPanel(guildId, channelId, messageId),
                saveSyncResult: (result) => this.configStore.saveTwitchRoleSyncResult(result),
                addRoleChange: (change) => this.configStore.addTwitchRoleChange(change),
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