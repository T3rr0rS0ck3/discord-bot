import { promises as fs } from "node:fs";
import path from "node:path";
import { AdminConfigStore, type AdminConfig } from "./admin/AdminConfigStore";
import { AdminWebServer } from "./admin/AdminWebServer";
import { DiscordBot } from "./bot/DiscordBot";
import { BotModuleFactory } from "./modules/BotModuleFactory";
import { IBotModule } from "./modules/interfaces/IBotModule";

export class Startup {
    public static async Start(): Promise<void> {
        const sqlitePath = path.resolve(process.cwd(), "data", "bot-config.sqlite");
        const legacyEnvValues = await this.readLegacyEnv(path.resolve(process.cwd(), ".env"));
        const defaultConfig: AdminConfig = {
            discordToken: this.normalizeString(legacyEnvValues.DISCORD_TOKEN) ?? "",
            guildId: this.normalizeString(legacyEnvValues.GUILD_ID),
            adminUiUsername: this.normalizeString(legacyEnvValues.ADMIN_UI_USERNAME) ?? "admin",
            adminUiToken: this.normalizeString(legacyEnvValues.ADMIN_UI_TOKEN) ?? "admin",
            adminUiPort: this.parseNumber(legacyEnvValues.ADMIN_UI_PORT) ?? 8787,
            musicRoleName: this.normalizeString(legacyEnvValues.MUSIC_ROLE_NAME) ?? "Music Bot",
            musicDefaultVolumePercent: this.parseNumber(legacyEnvValues.MUSIC_DEFAULT_VOLUME_PERCENT),
            musicDebugSearch: (legacyEnvValues.MUSIC_DEBUG_SEARCH ?? "true").toLowerCase() !== "false",
            musicYoutubeSearchLimit: this.parseNumber(legacyEnvValues.MUSIC_YOUTUBE_SEARCH_LIMIT),
            spotifyClientId: this.normalizeString(legacyEnvValues.SPOTIFY_CLIENT_ID),
            spotifyClientSecret: this.normalizeString(legacyEnvValues.SPOTIFY_CLIENT_SECRET),
            spotifyRedirectUri: this.normalizeString(legacyEnvValues.SPOTIFY_REDIRECT_URI),
            welcomeChannelId: this.normalizeString(legacyEnvValues.WELCOME_CHANNEL_ID),
            welcomeRoles: this.parseWelcomeRoles(legacyEnvValues.WELCOME_ROLES) ?? [
                { emoji: "🎮", name: "Gaming", description: "Für Gamer und Gaming-Interessierte" },
                { emoji: "🎵", name: "Music", description: "Für Musik-Liebhaber" }
            ]
        };

        const adminConfigStore = new AdminConfigStore(sqlitePath);
        let runtimeAdminConfig: AdminConfig = await adminConfigStore.load(defaultConfig);
        let modules: IBotModule[] = [];
        let bot: DiscordBot | undefined;

        const startOrRestartBot = async (): Promise<void> => {
            if (!runtimeAdminConfig.discordToken) {
                console.log("[Startup] Discord Token fehlt in SQLite-Konfiguration. Bot wird nicht gestartet.");
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
                    allowedRoleNames: [runtimeAdminConfig.musicRoleName]
                },
                welcomeChannelId: runtimeAdminConfig.welcomeChannelId,
                welcomeRoles: runtimeAdminConfig.welcomeRoles
            });

            for (const module of modules) {
                if (module.initialize) {
                    await module.initialize();
                }
            }

            const commands = modules.flatMap((module) => module.getCommands());

            console.log(`[Modules] Aktiv: ${modules.map((module) => module.name).join(", ")}`);

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
            restartBot: async () => {
                await startOrRestartBot();
                console.log("[AdminUI] Bot wurde neu gestartet.");
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
                runtimeAdminConfig = config;
                await adminConfigStore.save(config);
                console.log(`[AdminUI] Konfiguration gespeichert: ${sqlitePath}`);

                const readyClient = bot?.getReadyClient();
                for (const module of modules) {
                    if (!module.applyRuntimeConfig) {
                        continue;
                    }

                    await module.applyRuntimeConfig(
                        {
                            welcomeChannelId: runtimeAdminConfig.welcomeChannelId,
                            welcomeRoles: runtimeAdminConfig.welcomeRoles
                        },
                        readyClient
                    );
                }

                if (readyClient) {
                    console.log("[AdminUI] Runtime-Konfiguration wurde direkt auf den Bot angewendet.");
                }
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
                console.warn("[Welcome] WELCOME_ROLES ist kein JSON-Array. Überspringe.");
                return undefined;
            }

            return parsed.map((role: any) => ({
                name: role.name ?? "",
                emoji: role.emoji ?? "",
                description: role.description ?? ""
            }));
        } catch (error) {
            console.error("[Welcome] Fehler beim Parsen von WELCOME_ROLES:", error);
            return undefined;
        }
    }
}

void Startup.Start();