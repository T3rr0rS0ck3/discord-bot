import { randomUUID } from "node:crypto";
import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChannelType, Client, Guild, GuildMember, TextChannel } from "discord.js";
import type { TwitchRoleModuleOptions } from "../types/Discord";
import { TwitchRoleService, type TwitchOAuthTokenState } from "../services/TwitchRoleService";
import { RoleService } from "../services/RoleService";
import { IBotModule } from "./interfaces/IBotModule";

export class TwitchRoleModule implements IBotModule {
    public readonly name = "twitch";
    private readonly twitchService: TwitchRoleService;
    private readonly onTokensUpdated?: (tokens: TwitchOAuthTokenState) => Promise<void> | void;
    private guildId?: string;
    private followerRoleName?: string;
    private subscriberRoleName?: string;
    private followerRoleId?: string;
    private subscriberRoleId?: string;
    private syncInterval?: NodeJS.Timeout;
    private client?: Client;
    private guild?: Guild;
    private linkChannelName: string;
    private linkPanelTitle: string;
    private linkPanelMessage: string;
    private clientId?: string;
    private redirectUri?: string;

    public constructor(private readonly options: TwitchRoleModuleOptions) {
        this.guildId = options.guildId;
        this.followerRoleName = options.followerRoleName;
        this.subscriberRoleName = options.subscriberRoleName;
        this.linkChannelName = this.normalizeChannelName(options.linkChannelName);
        this.linkPanelTitle = options.linkPanelTitle?.trim() || "Twitch-Konto verbinden";
        this.linkPanelMessage = options.linkPanelMessage?.trim() || "Verbinde dein Twitch-Konto, damit deine Follower- und Abonnentenrollen zuverlässig synchronisiert werden können.";
        this.clientId = options.clientId;
        this.redirectUri = options.redirectUri;
        this.onTokensUpdated = options.onTokensUpdated;
        this.twitchService = new TwitchRoleService({
            broadcasterName: options.broadcasterName,
            clientId: options.clientId,
            clientSecret: options.clientSecret,
            accessToken: options.accessToken,
            refreshToken: options.refreshToken,
            accessTokenExpiresAt: options.accessTokenExpiresAt,
            onTokensUpdated: async (tokens) => {
                if (this.onTokensUpdated) {
                    await this.onTokensUpdated(tokens);
                }
            }
        });
    }

    public getCommands() {
        return [];
    }

    public initialize(): void {
        if (!this.followerRoleName && !this.subscriberRoleName) {
            console.log("[TwitchRole] No roles configured. Twitch role sync is disabled.");
            return;
        }

        this.startSyncLoopIfReady();
    }

    public async shutdown(): Promise<void> {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = undefined;
        }
    }

    public async onReady(client: Client): Promise<void> {
        this.client = client;

        if (!this.guildId) {
            return;
        }

        // Ensure roles exist
        const guild = client.guilds.cache.get(this.guildId) ?? (await client.guilds.fetch(this.guildId).catch(() => null));
        if (!guild) {
            return;
        }
        this.guild = guild;

        if (this.followerRoleName) {
            const followerRole = await RoleService.ensureRole(guild, {
                name: this.followerRoleName,
                reason: "Twitch follower role (auto-created)"
            });
            this.followerRoleId = followerRole?.id;
            if (followerRole) {
                console.log(`[TwitchRole] Follower role ensured: ${this.followerRoleName} (${this.followerRoleId})`);
            }
        }

        if (this.subscriberRoleName) {
            const subscriberRole = await RoleService.ensureRole(guild, {
                name: this.subscriberRoleName,
                reason: "Twitch subscriber role (auto-created)"
            });
            this.subscriberRoleId = subscriberRole?.id;
            if (subscriberRole) {
                console.log(`[TwitchRole] Subscriber role ensured: ${this.subscriberRoleName} (${this.subscriberRoleId})`);
            }
        }

        this.startSyncLoopIfReady();
        await this.ensureLinkPanel();
        void this.syncRoles();
    }

    public async applyRuntimeConfig(
        config: {
            twitchBroadcasterName?: string;
            twitchClientId?: string;
            twitchClientSecret?: string;
            twitchAccessToken?: string;
            twitchRefreshToken?: string;
            twitchAccessTokenExpiresAt?: number;
            twitchFollowerRoleName?: string;
            twitchSubscriberRoleName?: string;
            twitchLinkChannelName?: string;
            twitchLinkPanelTitle?: string;
            twitchLinkPanelMessage?: string;
        }
    ): Promise<void> {
        if (config.twitchBroadcasterName !== undefined) {
            this.twitchService.updateConfig({ broadcasterName: config.twitchBroadcasterName });
        }

        this.twitchService.updateConfig({
            clientId: config.twitchClientId,
            clientSecret: config.twitchClientSecret,
            accessToken: config.twitchAccessToken,
            refreshToken: config.twitchRefreshToken,
            accessTokenExpiresAt: config.twitchAccessTokenExpiresAt
        });
        this.clientId = config.twitchClientId ?? this.clientId;

        this.followerRoleName = config.twitchFollowerRoleName ?? this.followerRoleName;
        this.subscriberRoleName = config.twitchSubscriberRoleName ?? this.subscriberRoleName;
        this.linkChannelName = this.normalizeChannelName(config.twitchLinkChannelName ?? this.linkChannelName);
        this.linkPanelTitle = config.twitchLinkPanelTitle?.trim() || this.linkPanelTitle;
        this.linkPanelMessage = config.twitchLinkPanelMessage?.trim() || this.linkPanelMessage;

        this.startSyncLoopIfReady();
        if (this.guild) await this.ensureLinkPanel();
        if (this.client && (this.followerRoleId || this.subscriberRoleId)) {
            void this.syncRoles();
        }
    }

    public async handleButtonInteraction(customId: string, interaction: ButtonInteraction): Promise<boolean> {
        if (!["twitch-role:link", "twitch-role:unlink"].includes(customId)) return false;
        if (!interaction.guildId || interaction.guildId !== this.guildId) {
            await interaction.reply({ content: "Diese Twitch-Verknüpfung gehört nicht zu diesem Server.", ephemeral: true });
            return true;
        }

        if (customId === "twitch-role:unlink") {
            const removed = await this.options.deleteMemberLink?.(interaction.guildId, interaction.user.id) ?? false;
            if (interaction.member instanceof GuildMember) await this.removeManagedRoles(interaction.member);
            await interaction.reply({ content: removed ? "Deine Twitch-Verknüpfung wurde entfernt." : "Du hattest keine Twitch-Verknüpfung.", ephemeral: true });
            return true;
        }

        if (!this.clientId || !this.redirectUri || !this.options.createMemberOAuthState) {
            await interaction.reply({ content: "Twitch OAuth ist noch nicht vollständig konfiguriert.", ephemeral: true });
            return true;
        }
        const state = randomUUID();
        await this.options.createMemberOAuthState(state, interaction.guildId, interaction.user.id, Date.now() + 10 * 60 * 1000);
        const url = new URL("https://id.twitch.tv/oauth2/authorize");
        url.searchParams.set("response_type", "code");
        url.searchParams.set("client_id", this.clientId);
        url.searchParams.set("redirect_uri", this.redirectUri);
        url.searchParams.set("state", state);
        await interaction.reply({
            content: "Öffne Twitch, um dein Konto mit diesem Discord-Mitglied zu verknüpfen. Der Link ist zehn Minuten gültig.",
            components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Mit Twitch verbinden").setURL(url.toString()))],
            ephemeral: true
        });
        return true;
    }

    private startSyncLoopIfReady(): void {
        if (this.syncInterval) {
            return;
        }

        if (!this.client) {
            return;
        }

        if (!this.twitchService.isConfigured()) {
            console.log("[TwitchRole] Twitch OAuth is not configured yet. Waiting for tokens.");
            return;
        }

        if (!this.followerRoleName && !this.subscriberRoleName) {
            return;
        }

        console.log("[TwitchRole] Initialized. Will create roles on bot ready and sync every hour.");
        this.syncInterval = setInterval(() => {
            void this.syncRoles();
        }, 60 * 60 * 1000) as NodeJS.Timeout;
    }

    private async syncRoles(): Promise<void> {
        if (!this.guildId || !this.client) {
            return;
        }

        const guild = this.client.guilds.cache.get(this.guildId);
        if (!guild) {
            console.log("[TwitchRole] Guild not found. Skipping sync.");
            return;
        }

        try {
            // Fetch members with error handling for larger guilds
            try {
                await guild.members.fetch();
            } catch (err) {
                if (
                    err instanceof Error &&
                    (err.message.includes("Members didn't arrive in time") || err.message.includes("GuildMembersTimeout"))
                ) {
                    console.log(
                        "[TwitchRole] Guild member fetch timed out. Using cached members only. This is normal for large guilds."
                    );
                } else {
                }
            }

            const followers = await this.twitchService.getFollowerUserIds();
            const subscribers = await this.twitchService.getSubscriberUserIds();
            const links = await this.options.getMemberLinks?.(this.guildId) ?? [];

            let updatedFollowers = 0;
            let updatedSubscribers = 0;
            let errors = 0;

            for (const link of links) {
                try {
                    const member = guild.members.cache.get(link.discordUserId) ?? await guild.members.fetch(link.discordUserId).catch(() => null);
                    if (!member) continue;

                    // Check subscriber status (more restrictive)
                    const isSubscriber = subscribers.has(link.twitchUserId);
                    if (this.subscriberRoleId) {
                        const hasRole = member.roles.cache.has(this.subscriberRoleId);
                        if (isSubscriber && !hasRole) {
                            await member.roles.add(this.subscriberRoleId);
                            updatedSubscribers++;
                        } else if (!isSubscriber && hasRole) {
                            await member.roles.remove(this.subscriberRoleId);
                            updatedSubscribers++;
                        }
                    }

                    // Check follower status (less restrictive)
                    const isFollower = followers.has(link.twitchUserId);
                    if (this.followerRoleId) {
                        const hasRole = member.roles.cache.has(this.followerRoleId);
                        if (isFollower && !hasRole) {
                            await member.roles.add(this.followerRoleId);
                            updatedFollowers++;
                        } else if (!isFollower && hasRole) {
                            await member.roles.remove(this.followerRoleId);
                            updatedFollowers++;
                        }
                    }
                } catch (err) {
                    console.error(`[TwitchRole] Error syncing roles for member ${link.discordUserId}:`, err);
                    errors++;
                }
            }

            console.log(
                `[TwitchRole] Sync complete. Followers: ${updatedFollowers}, Subscribers: ${updatedSubscribers}, Errors: ${errors}`
            );
        } catch (err) {
            console.error("[TwitchRole] Sync failed:", err);
        }
    }

    public async syncNow(): Promise<void> {
        await this.syncRoles();
    }

    private async ensureLinkPanel(): Promise<void> {
        if (!this.guild || !this.guildId) return;
        await this.guild.channels.fetch();
        const saved = await this.options.getLinkPanel?.(this.guildId);
        let channel = saved?.channelId
            ? this.guild.channels.cache.get(saved.channelId) ?? await this.guild.channels.fetch(saved.channelId).catch(() => null)
            : undefined;
        if (channel?.type === ChannelType.GuildText && channel.name !== this.linkChannelName) {
            channel = await channel.setName(this.linkChannelName, "Twitch link channel configuration updated");
        }
        if (!channel) channel = this.guild.channels.cache.find(item => item.type === ChannelType.GuildText && item.name === this.linkChannelName);
        if (!channel) {
            channel = await this.guild.channels.create({ name: this.linkChannelName, type: ChannelType.GuildText, reason: "Twitch member linking module" });
        }
        if (channel.type !== ChannelType.GuildText) return;
        const textChannel = channel as TextChannel;
        const payload = {
            content: `# ${this.linkPanelTitle}\n${this.linkPanelMessage}`,
            components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId("twitch-role:link").setLabel("Twitch verbinden").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("twitch-role:unlink").setLabel("Verbindung trennen").setStyle(ButtonStyle.Secondary)
            )]
        };
        const existing = saved?.channelId === textChannel.id ? await textChannel.messages.fetch(saved.messageId).catch(() => undefined) : undefined;
        const message = existing ? await existing.edit(payload) : await textChannel.send(payload);
        await this.options.saveLinkPanel?.(this.guildId, textChannel.id, message.id);
    }

    private async removeManagedRoles(member: GuildMember): Promise<void> {
        if (this.followerRoleId && member.roles.cache.has(this.followerRoleId)) await member.roles.remove(this.followerRoleId);
        if (this.subscriberRoleId && member.roles.cache.has(this.subscriberRoleId)) await member.roles.remove(this.subscriberRoleId);
    }

    private normalizeChannelName(value: string | undefined): string {
        return (value?.trim().toLowerCase().replace(/[^a-z0-9äöüß-]+/g, "-").replace(/^-+|-+$/g, "") || "twitch-verknuepfung").slice(0, 100);
    }
}
