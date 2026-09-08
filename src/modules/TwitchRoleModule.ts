import { Client } from "discord.js";
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

    public constructor(options: TwitchRoleModuleOptions) {
        this.guildId = options.guildId;
        this.followerRoleName = options.followerRoleName;
        this.subscriberRoleName = options.subscriberRoleName;
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

        this.followerRoleName = config.twitchFollowerRoleName ?? this.followerRoleName;
        this.subscriberRoleName = config.twitchSubscriberRoleName ?? this.subscriberRoleName;

        this.startSyncLoopIfReady();
        if (this.client && (this.followerRoleId || this.subscriberRoleId)) {
            void this.syncRoles();
        }
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
                    throw err;
                }
            }

            const followers = await this.twitchService.getFollowerNames();
            const subscribers = await this.twitchService.getSubscriberNames();

            let updatedFollowers = 0;
            let updatedSubscribers = 0;
            let errors = 0;

            for (const member of guild.members.cache.values()) {
                try {
                    const connectedAccounts = (member.user as any).connectedAccounts as Array<{
                        type: string;
                        name: string;
                    }> | undefined;
                    const twitchAccount = connectedAccounts?.find((acc) => acc.type === "twitch");

                    if (!twitchAccount) {
                        // No Twitch account connected, remove both roles
                        if (this.followerRoleId && member.roles.cache.has(this.followerRoleId)) {
                            await member.roles.remove(this.followerRoleId);
                            updatedFollowers++;
                        }
                        if (this.subscriberRoleId && member.roles.cache.has(this.subscriberRoleId)) {
                            await member.roles.remove(this.subscriberRoleId);
                            updatedSubscribers++;
                        }
                        continue;
                    }

                    const twitchName = twitchAccount.name.toLowerCase();

                    // Check subscriber status (more restrictive)
                    const isSubscriber = subscribers.has(twitchName);
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
                    const isFollower = followers.has(twitchName);
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
                    console.error(`[TwitchRole] Error syncing roles for member ${member.id}:`, err);
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
}
