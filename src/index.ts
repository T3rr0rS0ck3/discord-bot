import { promises as fs } from "node:fs";
import path from "node:path";
import util from "node:util";
import { AdminConfigStore, type AdminConfig } from "./admin/AdminConfigStore";
import { AdminWebServer } from "./admin/AdminWebServer";
import { BotRuntimeManager } from "./bot/BotRuntimeManager";
import { RuntimeStatusStore } from "./services/RuntimeStatusStore";

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
            communityVotingEnabled: false,
            communityCategoryName: "Community",
            communityVotingChannelName: "kanalnamen-abstimmung",
            communityVotingDurationDays: 7,
            communityEmptyTimeoutSeconds: 60,
            communityMaxChannels: 50,
            discordToken: this.normalizeString(legacyEnvValues.DISCORD_TOKEN) ?? "",
            guildId: this.normalizeString(legacyEnvValues.GUILD_ID),
            adminUiUsername: this.normalizeString(legacyEnvValues.ADMIN_UI_USERNAME) ?? "admin",
            adminUiToken: this.normalizeString(legacyEnvValues.ADMIN_UI_TOKEN) ?? "admin",
            adminUiPort: this.parseNumber(legacyEnvValues.ADMIN_UI_PORT) ?? 8787,
            adminLoginMaxFailures: 5,
            adminLoginBlockMinutes: 15,
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
            welcomeTitle: "👋 Welcome!",
            welcomeReactionPrompt: "React with an emoji below to get the matching role:",
            welcomeReactionInstructions: "Click a reaction to get the role. Click it again to remove the role.",
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
        const runtimeAdminConfig = await adminConfigStore.load(defaultConfig);
        const runtimeStatusStore = new RuntimeStatusStore();
        const botRuntimeManager = new BotRuntimeManager(runtimeAdminConfig, adminConfigStore, runtimeStatusStore);
        let shuttingDown = false;

        const adminWebServer = new AdminWebServer({
            port: botRuntimeManager.getConfig().adminUiPort,
            getAuthConfig: () => ({
                username: botRuntimeManager.getConfig().adminUiUsername
            }),
            verifyAdminPassword: (password) => adminConfigStore.verifyAdminPassword(password),
            getConfig: () => botRuntimeManager.getConfig(),
            getLogs: () => runtimeLogBuffer.getAll(),
            restartBot: async () => {
                await botRuntimeManager.restart();
                console.log("[AdminUI] Bot restarted.");
            },
            getWelcomeChannels: async () => {
                const guildId = botRuntimeManager.getConfig().guildId;
                if (!guildId) {
                    return [];
                }

                const readyClient = botRuntimeManager.getReadyClient();
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
            getDiscordStatus: () => botRuntimeManager.getStatus(),
            getDatabaseStatus: () => adminConfigStore.getDatabaseStatus(),
            getServerEmojis: async () => {
                const guildId = botRuntimeManager.getConfig().guildId;
                if (!guildId) {
                    return [];
                }

                const readyClient = botRuntimeManager.getReadyClient();
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
                await botRuntimeManager.saveConfig(config);
                console.log(`[AdminUI] Configuration saved: ${sqlitePath}`);
            }
        });
        adminWebServer.start();

        const shutdown = async (signal: string): Promise<void> => {
            if (shuttingDown) return;
            shuttingDown = true;
            console.log(`[Shutdown] Received ${signal}. Stopping services...`);
            try {
                await botRuntimeManager.stop();
                await adminWebServer.stop();
                await adminConfigStore.close();
                console.log("[Shutdown] Services stopped cleanly.");
            } catch (error) {
                console.error("[Shutdown] Failed to stop services cleanly:", error instanceof Error ? error.message : String(error));
                process.exitCode = 1;
            }
        };

        process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
        process.once("SIGINT", () => { void shutdown("SIGINT"); });

        await botRuntimeManager.start();
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