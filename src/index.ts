import { promises as fs } from "node:fs";
import path from "node:path";
import util from "node:util";
import { AdminConfigStore, type AdminConfig } from "./admin/AdminConfigStore";
import { AdminWebServer } from "./admin/AdminWebServer";
import { DiscordBot } from "./bot/DiscordBot";
import { BotModuleFactory } from "./modules/BotModuleFactory";
import { IBotModule } from "./modules/interfaces/IBotModule";
import type { DiscordRuntimeStatus } from "./types/Discord";

type RuntimeLogEntry = {
    timestamp: number;
    level: "log" | "info" | "warn" | "error";
    message: string;
};

class RuntimeLogBuffer {
    private readonly maxEntries: number;
    private readonly entries: RuntimeLogEntry[] = [];

    public constructor(maxEntries = 500) {
        this.maxEntries = maxEntries;
    }

    public push(level: RuntimeLogEntry["level"], args: unknown[]): void {
        const message = args
            .map((arg) => {
                if (typeof arg === "string") {
                    return arg;
                }
                return util.inspect(arg, { depth: 4, colors: false, breakLength: 120 });
            })
            .join(" ");

        this.entries.push({
            timestamp: Date.now(),
            level,
            message
        });

        if (this.entries.length > this.maxEntries) {
            this.entries.splice(0, this.entries.length - this.maxEntries);
        }
    }

    public getAll(): RuntimeLogEntry[] {
        return [...this.entries];
    }
}

export class Startup {
    public static async Start(): Promise<void> {
        const runtimeLogBuffer = new RuntimeLogBuffer(700);
        this.attachConsoleMirror(runtimeLogBuffer);

        const dataDirectory = this.normalizeString(process.env.BOT_DATA_DIR) ?? path.resolve(process.cwd(), "data");
        const sqlitePath = path.resolve(dataDirectory, "bot-config.sqlite");
        const fileEnvValues = await this.readLegacyEnv(path.resolve(process.cwd(), ".env"));
        const processEnvValues = Object.fromEntries(
            Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
        );
        const legacyEnvValues = { ...fileEnvValues, ...processEnvValues };
        const defaultConfig: AdminConfig = {
            systemEnabled: false,
            musicEnabled: false,
            welcomeEnabled: false,
            twitchEnabled: false,
            communityEnabled: false,
            communityCategoryName: "Community",
            communityEmptyTimeoutSeconds: 60,
            communityMaxChannels: 50,
            discordToken: this.normalizeString(legacyEnvValues.DISCORD_TOKEN) ?? "",
            guildId: this.normalizeString(legacyEnvValues.GUILD_ID),
            adminUiUsername: this.normalizeString(legacyEnvValues.ADMIN_UI_USERNAME) ?? "admin",
            adminUiToken: this.normalizeString(legacyEnvValues.ADMIN_UI_TOKEN) ?? "admin",
            adminUiPort: this.parseNumber(legacyEnvValues.ADMIN_UI_PORT) ?? 8787,
            musicRoleName: this.normalizeString(legacyEnvValues.MUSIC_ROLE_NAME) ?? "Music Bot",
            musicDefaultVolumePercent: this.parseNumber(legacyEnvValues.MUSIC_DEFAULT_VOLUME_PERCENT) ?? 50,
            musicDebugSearch: (legacyEnvValues.MUSIC_DEBUG_SEARCH ?? "true").toLowerCase() !== "false",
            musicYoutubeSearchLimit: this.parseNumber(legacyEnvValues.MUSIC_YOUTUBE_SEARCH_LIMIT) ?? 25,
            audioDbApiKey: this.normalizeString(legacyEnvValues.AUDIODB_API_KEY) ?? "123",
            audioDbApiVersion: legacyEnvValues.AUDIODB_API_VERSION === "v2" ? "v2" : "v1",
            spotifyClientId: this.normalizeString(legacyEnvValues.SPOTIFY_CLIENT_ID),
            spotifyClientSecret: this.normalizeString(legacyEnvValues.SPOTIFY_CLIENT_SECRET),
            spotifyRedirectUri: this.normalizeString(legacyEnvValues.SPOTIFY_REDIRECT_URI),
            welcomeChannelId: this.normalizeString(legacyEnvValues.WELCOME_CHANNEL_ID),
            twitchBroadcasterName: this.normalizeString(legacyEnvValues.TWITCH_BROADCASTER_NAME),
            twitchClientId: this.normalizeString(legacyEnvValues.TWITCH_CLIENT_ID),
            twitchClientSecret: this.normalizeString(legacyEnvValues.TWITCH_CLIENT_SECRET),
            twitchRedirectUri: this.normalizeString(legacyEnvValues.TWITCH_REDIRECT_URI),
            twitchAccessToken: this.normalizeString(legacyEnvValues.TWITCH_ACCESS_TOKEN),
            twitchRefreshToken: this.normalizeString(legacyEnvValues.TWITCH_REFRESH_TOKEN),
            twitchAccessTokenExpiresAt: this.parseNumber(legacyEnvValues.TWITCH_ACCESS_TOKEN_EXPIRES_AT),
            twitchFollowerRoleName: this.normalizeString(legacyEnvValues.TWITCH_FOLLOWER_ROLE_NAME),
            twitchSubscriberRoleName: this.normalizeString(legacyEnvValues.TWITCH_SUBSCRIBER_ROLE_NAME),
            welcomeRoles: this.parseWelcomeRoles(legacyEnvValues.WELCOME_ROLES) ?? [
                { emoji: "🎮", name: "Gaming", description: "For gamers and gaming enthusiasts" },
                { emoji: "🎵", name: "Music", description: "For music lovers" }
            ]
        };

        const adminConfigStore = new AdminConfigStore(sqlitePath);
        let runtimeAdminConfig: AdminConfig = await adminConfigStore.load(defaultConfig);
        let modules: IBotModule[] = [];
        let bot: DiscordBot | undefined;
        let discordStatus: DiscordRuntimeStatus = {
            state: "offline",
            message: "Bot is offline.",
            updatedAt: new Date().toISOString()
        };

        const applyRuntimeConfigToModules = async (): Promise<void> => {
            const readyClient = bot?.getReadyClient();

            for (const module of modules) {
                if (!module.applyRuntimeConfig) {
                    continue;
                }

                await module.applyRuntimeConfig(
                    {
                        communityCategoryName: runtimeAdminConfig.communityCategoryName,
                        communityEmptyTimeoutSeconds: runtimeAdminConfig.communityEmptyTimeoutSeconds,
                communityMaxChannels: runtimeAdminConfig.communityMaxChannels,
                        welcomeChannelId: runtimeAdminConfig.welcomeChannelId,
                        welcomeRoles: runtimeAdminConfig.welcomeRoles,
                        twitchBroadcasterName: runtimeAdminConfig.twitchBroadcasterName,
                        twitchClientId: runtimeAdminConfig.twitchClientId,
                        twitchClientSecret: runtimeAdminConfig.twitchClientSecret,
                        twitchRedirectUri: runtimeAdminConfig.twitchRedirectUri,
                        twitchAccessToken: runtimeAdminConfig.twitchAccessToken,
                        twitchRefreshToken: runtimeAdminConfig.twitchRefreshToken,
                        twitchAccessTokenExpiresAt: runtimeAdminConfig.twitchAccessTokenExpiresAt,
                        twitchFollowerRoleName: runtimeAdminConfig.twitchFollowerRoleName,
                        twitchSubscriberRoleName: runtimeAdminConfig.twitchSubscriberRoleName
                    },
                    readyClient
                );
            }

            if (readyClient) {
                console.log("[AdminUI] Runtime configuration was applied directly to the bot.");
            }
        };

        const persistRuntimeConfig = async (config: AdminConfig): Promise<void> => {
            runtimeAdminConfig = config;
            await adminConfigStore.save(config);
            console.log(`[AdminUI] Configuration saved: ${sqlitePath}`);
            await applyRuntimeConfigToModules();
        };

        const startOrRestartBot = async (): Promise<void> => {
            if (!runtimeAdminConfig.discordToken) {
                console.log("[Startup] Discord token is missing in SQLite configuration. Bot will not start.");
                return;
            }

            if (bot) {
                for (const module of modules) {
                    if (module.shutdown) {
                        await module.shutdown();
                    }
                }

                await bot.stop();
                bot = undefined;
            }

            modules = BotModuleFactory.create({
                systemEnabled: runtimeAdminConfig.systemEnabled,
                musicEnabled: runtimeAdminConfig.musicEnabled,
                welcomeEnabled: runtimeAdminConfig.welcomeEnabled,
                twitchEnabled: runtimeAdminConfig.twitchEnabled,
                communityEnabled: runtimeAdminConfig.communityEnabled,
                getCommunityChannelNames: () => adminConfigStore.getCommunityChannelNames(),
                getCommunityState: (guildId) => adminConfigStore.getCommunityState(guildId),
                saveCommunityState: (guildId, state) => adminConfigStore.saveCommunityState(guildId, state),
                communityCategoryName: runtimeAdminConfig.communityCategoryName,
                communityEmptyTimeoutSeconds: runtimeAdminConfig.communityEmptyTimeoutSeconds,
                communityMaxChannels: runtimeAdminConfig.communityMaxChannels,
                guildId: runtimeAdminConfig.guildId,
                musicRoleName: runtimeAdminConfig.musicRoleName,
                spotifyService: {
                    clientId: runtimeAdminConfig.spotifyClientId,
                    clientSecret: runtimeAdminConfig.spotifyClientSecret,
                    redirectUri: runtimeAdminConfig.spotifyRedirectUri
                },
                musicPlayback: {
                    defaultVolumePercent: runtimeAdminConfig.musicDefaultVolumePercent,
                    debugSearch: runtimeAdminConfig.musicDebugSearch,
                    youtubeSearchLimit: runtimeAdminConfig.musicYoutubeSearchLimit,
                    audioDbApiKey: runtimeAdminConfig.audioDbApiKey,
                    audioDbApiVersion: runtimeAdminConfig.audioDbApiVersion,
                    allowedRoleNames: [runtimeAdminConfig.musicRoleName]
                },
                welcomeChannelId: runtimeAdminConfig.welcomeChannelId,
                welcomeRoles: runtimeAdminConfig.welcomeRoles,
                twitchRole: {
                    guildId: runtimeAdminConfig.guildId,
                    broadcasterName: runtimeAdminConfig.twitchBroadcasterName,
                    clientId: runtimeAdminConfig.twitchClientId,
                    clientSecret: runtimeAdminConfig.twitchClientSecret,
                    accessToken: runtimeAdminConfig.twitchAccessToken,
                    refreshToken: runtimeAdminConfig.twitchRefreshToken,
                    accessTokenExpiresAt: runtimeAdminConfig.twitchAccessTokenExpiresAt,
                    followerRoleName: runtimeAdminConfig.twitchFollowerRoleName,
                    subscriberRoleName: runtimeAdminConfig.twitchSubscriberRoleName,
                    onTokensUpdated: async (tokens) => {
                        runtimeAdminConfig = {
                            ...runtimeAdminConfig,
                            twitchAccessToken: tokens.accessToken,
                            twitchRefreshToken: tokens.refreshToken,
                            twitchAccessTokenExpiresAt: tokens.accessTokenExpiresAt
                        };
                        await adminConfigStore.save(runtimeAdminConfig);
                        await applyRuntimeConfigToModules();
                    }
                }
            });

            for (const module of modules) {
                if (module.initialize) {
                    await module.initialize();
                }
            }

            const commands = modules.flatMap((module) => module.getCommands());

            console.log(`[Modules] Active: ${modules.map((module) => module.name).join(", ")}`);

            bot = new DiscordBot({
                token: runtimeAdminConfig.discordToken,
                guildId: runtimeAdminConfig.guildId,
                commands: commands,
                modules: modules,
                onReady: async (client) => {
                    for (const module of modules) {
                        if (module.onReady) {
                            await module.onReady(client);
                        }
                    }
                },
                onStatusChange: (status) => {
                    discordStatus = status;
                },
                buttonHandler: async (customId, interaction) => {
                    for (const module of modules) {
                        if (!module.handleButtonInteraction) {
                            continue;
                        }

                        const handled = await module.handleButtonInteraction(customId, interaction);
                        if (handled) {
                            return true;
                        }
                    }

                    return false;
                }
            });

            await bot.start();
        };

        const adminWebServer = new AdminWebServer({
            port: runtimeAdminConfig.adminUiPort,
            getAuthConfig: () => ({
                username: runtimeAdminConfig.adminUiUsername,
                token: runtimeAdminConfig.adminUiToken
            }),
            getConfig: () => runtimeAdminConfig,
            getLogs: () => runtimeLogBuffer.getAll(),
            restartBot: async () => {
                await startOrRestartBot();
                console.log("[AdminUI] Bot restarted.");
            },
            getWelcomeChannels: async () => {
                const guildId = runtimeAdminConfig.guildId;
                if (!guildId) {
                    return [];
                }

                const readyClient = bot?.getReadyClient();
                if (!readyClient) {
                    return [];
                }

                const guild = readyClient.guilds.cache.get(guildId) ?? await readyClient.guilds.fetch(guildId).catch(() => null);
                if (!guild) {
                    return [];
                }

                await guild.channels.fetch();

                return guild.channels.cache
                    .filter((channel) => channel.isTextBased() && !channel.isDMBased())
                    .map((channel) => ({ id: channel.id, name: `#${channel.name}` }))
                    .sort((a, b) => a.name.localeCompare(b.name, "de"));
            },
            getDiscordStatus: () => bot?.getStatus() ?? discordStatus,
            getServerEmojis: async () => {
                const guildId = runtimeAdminConfig.guildId;
                if (!guildId) {
                    return [];
                }

                const readyClient = bot?.getReadyClient();
                if (!readyClient) {
                    return [];
                }

                const guild = readyClient.guilds.cache.get(guildId) ?? await readyClient.guilds.fetch(guildId).catch(() => null);
                if (!guild) {
                    return [];
                }

                await guild.emojis.fetch();

                return guild.emojis.cache
                    .map((emoji) => ({
                        value: emoji.toString(),
                        label: `${emoji.toString()} ${emoji.name}`
                    }))
                    .sort((a, b) => a.label.localeCompare(b.label, "de"));
            },
            saveConfig: async (config) => {
                await persistRuntimeConfig(config);
            }
        });
        adminWebServer.start();

        await startOrRestartBot();
    }

    private static parseNumber(value: string | undefined): number | undefined {
        if (value === undefined || value.trim() === "") {
            return undefined;
        }

        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }

    private static normalizeString(value: string | undefined): string | undefined {
        if (!value) {
            return undefined;
        }

        const normalized = value.trim();
        return normalized.length > 0 ? normalized : undefined;
    }

    private static async readLegacyEnv(filePath: string): Promise<Record<string, string>> {
        try {
            const content = await fs.readFile(filePath, "utf8");
            const result: Record<string, string> = {};

            for (const line of content.split(/\r?\n/)) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith("#")) {
                    continue;
                }

                const separatorIndex = trimmed.indexOf("=");
                if (separatorIndex <= 0) {
                    continue;
                }

                const key = trimmed.slice(0, separatorIndex).trim();
                const value = trimmed.slice(separatorIndex + 1).trim();
                result[key] = value;
            }

            return result;
        } catch {
            return {};
        }
    }

    private static parseWelcomeRoles(rolesJson: string | undefined) {
        if (!rolesJson) {
            return undefined;
        }

        try {
            const parsed = JSON.parse(rolesJson);
            if (!Array.isArray(parsed)) {
                console.warn("[Welcome] WELCOME_ROLES is not a JSON array. Skipping.");
                return undefined;
            }

            return parsed.map((role: any) => ({
                name: role.name ?? "",
                emoji: role.emoji ?? "",
                description: role.description ?? ""
            }));
        } catch (error) {
            console.error("[Welcome] Failed to parse WELCOME_ROLES:", error);
            return undefined;
        }
    }

    private static attachConsoleMirror(buffer: RuntimeLogBuffer): void {
        const originalLog = console.log;
        const originalInfo = console.info;
        const originalWarn = console.warn;
        const originalError = console.error;

        console.log = ((...args: unknown[]) => {
            buffer.push("log", args);
            originalLog(...args);
        }) as typeof console.log;

        console.info = ((...args: unknown[]) => {
            buffer.push("info", args);
            originalInfo(...args);
        }) as typeof console.info;

        console.warn = ((...args: unknown[]) => {
            buffer.push("warn", args);
            originalWarn(...args);
        }) as typeof console.warn;

        console.error = ((...args: unknown[]) => {
            buffer.push("error", args);
            originalError(...args);
        }) as typeof console.error;
    }
}

void Startup.Start();