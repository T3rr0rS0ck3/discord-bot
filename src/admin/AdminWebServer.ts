import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import http, { IncomingMessage, Server, ServerResponse } from "node:http";
import path from "node:path";
import type { AdminConfig, DatabaseStatus, TwitchRoleSyncResult, TwitchRoleSyncStatus } from "./AdminConfigStore";
import type { CommunityRuntimeStatus, DiscordRuntimeStatus } from "../types/Discord";

type AdminWebServerOptions = {
    port: number;
    getAuthConfig: () => { username: string };
    verifyAdminPassword: (password: string) => Promise<boolean>;
    getConfig: () => AdminConfig;
    getLogs: () => Array<{ timestamp: number; level: string; message: string }>;
    saveConfig: (config: AdminConfig) => Promise<void>;
    restartBot: () => Promise<void>;
    getServerEmojis: () => Promise<Array<{ value: string; label: string }>>;
    getWelcomeChannels: () => Promise<Array<{ id: string; name: string }>>;
    getDiscordStatus: () => DiscordRuntimeStatus;
    getDatabaseStatus: () => Promise<DatabaseStatus>;
    getCommunityStatus: () => Promise<CommunityRuntimeStatus>;
    deleteCommunityChannel: (channelId: string) => Promise<void>;
    consumeTwitchMemberOAuthState: (state: string) => Promise<{ guildId: string; discordUserId: string } | undefined>;
    saveTwitchMemberLink: (link: import("./AdminConfigStore").TwitchMemberLink) => Promise<void>;
    syncTwitchRoles: () => Promise<TwitchRoleSyncResult>;
    getTwitchRoleSyncStatus: () => Promise<TwitchRoleSyncStatus>;
};

type ConfigBackup = {
    format: "discord-bot-config";
    version: 1;
    exportedAt: string;
    config: AdminConfig;
};

export class AdminWebServer {
    private readonly options: AdminWebServerOptions;
    private readonly adminAppBundlePath: string;
    private unicodeEmojisCache?: Array<{ value: string; label: string; group: string }>;
    private unicodeEmojiLoadFailed = false;
    private readonly sessions = new Map<string, { username: string; expiresAt: number }>();
    private readonly twitchOAuthStates = new Map<string, { createdAt: number }>();
    private readonly loginAttempts = new Map<string, { failures: number; firstFailureAt: number; blockedUntil: number }>();
    private readonly sessionTtlMs = 8 * 60 * 60 * 1000;
    private readonly twitchStateTtlMs = 10 * 60 * 1000;
    private readonly loginAttemptWindowMs = 15 * 60 * 1000;
    private server?: Server;

    public constructor(options: AdminWebServerOptions) {
        this.options = options;
        this.adminAppBundlePath = path.resolve(process.cwd(), "dist", "admin", "app.js");
    }

    public start(): void {
        const server = http.createServer(async (req, res) => {
            try {
                await this.route(req, res);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (req.url?.startsWith("/api/")) {
                    console.warn(`[AdminUI] Request rejected: ${message}`);
                    this.sendJson(res, 400, { error: message });
                    return;
                }

                console.error("[AdminUI] Internal error:", error);
                this.sendJson(res, 500, { error: "Internal Server Error" });
            }
        });

        server.on("error", (error: NodeJS.ErrnoException) => {
            if (error.code === "EADDRINUSE") {
                console.error(
                    `[AdminUI] Port ${this.options.port} is already in use. Admin UI was not started.`
                );
                return;
            }

            console.error("[AdminUI] Server error:", error);
        });

        const bindHost = (process.env.ADMIN_UI_HOST ?? "127.0.0.1").trim() || "127.0.0.1";
        this.server = server;
        server.listen(this.options.port, bindHost, () => {
            console.log(`[AdminUI] Running at http://${bindHost}:${this.options.port}`);
        });
    }

    public async stop(): Promise<void> {
        if (!this.server) return;
        const server = this.server;
        this.server = undefined;
        await new Promise<void>((resolve) => server.close(() => resolve()));
        console.log("[AdminUI] Server stopped.");
    }

    private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
        const authenticatedUser = this.getAuthenticatedUsername(req);

        if (req.method === "GET" && url.pathname === "/") {
            this.sendHtml(res, this.renderHtml(authenticatedUser));
            return;
        }

        if (req.method === "GET" && url.pathname === "/health") {
            this.sendJson(res, 200, {
                status: "ok",
                service: "discord-bot-admin",
                timestamp: new Date().toISOString()
            });
            return;
        }

                if (req.method === "GET" && url.pathname === "/admin/app.js") {
                        await this.sendJavaScriptFile(res, this.adminAppBundlePath);
                        return;
        }

        if (req.method === "GET" && url.pathname === "/api/session") {
            this.sendJson(res, 200, {
                authenticated: Boolean(authenticatedUser),
                username: authenticatedUser ?? null
            });
            return;
        }

        if (req.method === "GET" && url.pathname === "/api/status") {
            if (!authenticatedUser) {
                this.sendJson(res, 401, { error: "Unauthorized" });
                return;
            }
            this.sendJson(res, 200, this.options.getDiscordStatus());
            return;
        }

        if (req.method === "GET" && url.pathname === "/api/database-status") {
            if (!authenticatedUser) {
                this.sendJson(res, 401, { error: "Unauthorized" });
                return;
            }
            this.sendJson(res, 200, await this.options.getDatabaseStatus());
            return;
        }

        if (req.method === "GET" && url.pathname === "/api/community/status") {
            if (!authenticatedUser) {
                this.sendJson(res, 401, { error: "Unauthorized" });
                return;
            }
            this.sendJson(res, 200, await this.options.getCommunityStatus());
            return;
        }

        if (req.method === "POST" && url.pathname === "/api/community/channel/delete") {
            if (!authenticatedUser) {
                this.sendJson(res, 401, { error: "Unauthorized" });
                return;
            }
            const body = JSON.parse(await this.readBody(req)) as { channelId?: string };
            const channelId = String(body.channelId ?? "").trim();
            if (!/^\d+$/.test(channelId)) throw new Error("Ungültige Sprachkanal-ID.");
            await this.options.deleteCommunityChannel(channelId);
            this.sendJson(res, 200, { ok: true });
            return;
        }

        if (req.method === "POST" && url.pathname === "/api/login") {
            const clientKey = req.socket.remoteAddress ?? "unknown";
            const retryAfterSeconds = this.getLoginRetryAfterSeconds(clientKey);
            if (retryAfterSeconds > 0) {
                res.setHeader("Retry-After", String(retryAfterSeconds));
                this.sendJson(res, 429, { error: `Too many failed login attempts. Try again in ${retryAfterSeconds} seconds.` });
                return;
            }

            const body = await this.readBody(req);
            const parsed = JSON.parse(body) as { username?: string; token?: string };
            const username = String(parsed.username ?? "").trim();
            const token = String(parsed.token ?? "").trim();
            const auth = this.options.getAuthConfig();

            const passwordMatches = await this.options.verifyAdminPassword(token);
            if (username !== auth.username || !passwordMatches) {
                const blockedForSeconds = this.recordLoginFailure(clientKey);
                if (blockedForSeconds > 0) {
                    res.setHeader("Retry-After", String(blockedForSeconds));
                    this.sendJson(res, 429, { error: `Too many failed login attempts. Try again in ${blockedForSeconds} seconds.` });
                    return;
                }
                this.sendJson(res, 401, { error: "Invalid credentials" });
                return;
            }

            this.loginAttempts.delete(clientKey);
            const sessionId = this.createSession(username);
            this.setSessionCookie(res, sessionId);
            this.sendJson(res, 200, { ok: true, username });
            return;
        }

        if (req.method === "POST" && url.pathname === "/api/logout") {
            const sessionId = this.getSessionIdFromRequest(req);
            if (sessionId) {
                this.sessions.delete(sessionId);
            }
            this.clearSessionCookie(res);
            this.sendJson(res, 200, { ok: true });
            return;
        }

        if (req.method === "GET" && url.pathname === "/api/twitch/oauth/start") {
            if (!authenticatedUser) {
                this.sendJson(res, 401, { error: "Unauthorized" });
                return;
            }

            const config = this.options.getConfig();
            const twitchConfig = this.getTwitchOAuthConfig(config);
            if (!twitchConfig) {
                this.sendJson(res, 400, {
                    error: "Twitch OAuth is not configured. Set Twitch Client ID, Client Secret, and Redirect URI first."
                });
                return;
            }

            const state = randomUUID();
            this.twitchOAuthStates.set(state, { createdAt: Date.now() });
            this.pruneExpiredTwitchOAuthStates();

            res.writeHead(302, {
                Location: this.buildTwitchAuthorizeUrl(twitchConfig, state),
                "Cache-Control": "no-store"
            });
            res.end();
            return;
        }

        if (req.method === "GET" && url.pathname === "/api/twitch/oauth/callback") {
            await this.handleTwitchOAuthCallback(res, url);
            return;
        }

        if (url.pathname === "/admin/sqlite" || url.pathname.startsWith("/admin/sqlite/")) {
            if (!authenticatedUser) {
                this.sendJson(res, 401, { error: "Unauthorized" });
                return;
            }

            await this.proxyToSqliteWeb(req, res, url);
            return;
        }

        if (url.pathname.startsWith("/api/") && !authenticatedUser) {
            this.sendJson(res, 401, { error: "Unauthorized" });
            return;
        }

        if (req.method === "GET" && url.pathname === "/api/channels") {
            const channels = await this.options.getWelcomeChannels();
            this.sendJson(res, 200, { channels });
            return;
        }

        if (req.method === "GET" && url.pathname === "/api/emojis") {
            const serverEmojis = (await this.options.getServerEmojis()).map((emoji) => ({
                ...emoji,
                group: "Server Emojis"
            }));
                        const unicodeEmojis = await this.getUnicodeEmojis();

                        const fallbackEmojis = [
                            { value: "🎮", label: "🎮 Gaming", group: "Activities" },
                            { value: "🎵", label: "🎵 Music", group: "Objects" },
                            { value: "🎬", label: "🎬 Movies", group: "Objects" },
                            { value: "📚", label: "📚 Learning", group: "Objects" },
                            { value: "🎉", label: "🎉 Events", group: "Activities" },
                            { value: "✅", label: "✅ Verified", group: "Symbols" }
                        ];

                        const seen = new Set<string>();
                        const emojis = [...serverEmojis, ...(unicodeEmojis.length > 0 ? unicodeEmojis : fallbackEmojis)].filter((emoji) => {
                                if (seen.has(emoji.value)) {
                                        return false;
                                }
                                seen.add(emoji.value);
                                return true;
                        });

                        this.sendJson(res, 200, { emojis });
                        return;
        }

        if (req.method === "GET" && url.pathname === "/api/config") {
            this.sendJson(res, 200, { ...this.options.getConfig(), adminUiToken: "" });
            return;
        }

        if (req.method === "GET" && url.pathname === "/api/config/backup") {
            const backup: ConfigBackup = {
                format: "discord-bot-config",
                version: 1,
                exportedAt: new Date().toISOString(),
                config: { ...this.options.getConfig(), adminUiToken: "" }
            };
            const date = backup.exportedAt.slice(0, 10);
            this.sendDownloadJson(res, `discord-bot-config-${date}.json`, backup);
            return;
        }

        if (req.method === "POST" && url.pathname === "/api/config/restore") {
            const body = await this.readBody(req);
            const backup = JSON.parse(body) as Partial<ConfigBackup>;
            if (backup.format !== "discord-bot-config" || backup.version !== 1 || !backup.config || typeof backup.config !== "object") {
                this.sendJson(res, 400, { error: "Invalid or unsupported configuration backup." });
                return;
            }

            const validationErrors = this.validateConfigInput(backup.config, true);
            if (validationErrors.length > 0) {
                this.sendJson(res, 400, { error: validationErrors.join(" ") });
                return;
            }

            const next = this.normalize(backup.config);
            const restartInfo = this.getRestartRequirement(this.options.getConfig(), next);
            await this.options.saveConfig(next);
            this.sendJson(res, 200, {
                ok: true,
                config: { ...next, adminUiToken: "" },
                restartRequired: restartInfo.required,
                restartFields: restartInfo.fields
            });
            return;
        }

        if (req.method === "GET" && url.pathname === "/api/logs") {
            const logs = this.options.getLogs();
            this.sendJson(res, 200, { logs: logs.slice(-300) });
            return;
        }

        if (req.method === "GET" && url.pathname === "/api/twitch/sync-status") {
            this.sendJson(res, 200, await this.options.getTwitchRoleSyncStatus());
            return;
        }

        if (req.method === "POST" && url.pathname === "/api/twitch/sync") {
            const result = await this.options.syncTwitchRoles();
            if (!result.successful) {
                this.sendJson(res, 502, { error: result.error ?? "Twitch-Synchronisierung fehlgeschlagen.", result });
                return;
            }
            this.sendJson(res, 200, { ok: true, result });
            return;
        }

        if (req.method === "POST" && url.pathname === "/api/config") {
            const body = await this.readBody(req);
            const parsed = JSON.parse(body) as Partial<AdminConfig>;
            const validationErrors = this.validateConfigInput(parsed, true);
            if (validationErrors.length > 0) {
                this.sendJson(res, 400, { error: validationErrors.join(" ") });
                return;
            }
            const next = this.normalize(parsed);
          const restartInfo = this.getRestartRequirement(this.options.getConfig(), next);
            await this.options.saveConfig(next);
          this.sendJson(res, 200, {
            ok: true,
            restartRequired: restartInfo.required,
            restartFields: restartInfo.fields,
            config: { ...next, adminUiToken: "" }
          });
          return;
        }

        if (req.method === "POST" && url.pathname === "/api/restart") {
          await this.options.restartBot();
          this.sendJson(res, 200, { ok: true });
            return;
        }

        this.sendJson(res, 404, { error: "Not Found" });
    }

    private normalize(input: Partial<AdminConfig>): AdminConfig {
        const roles = Array.isArray(input.welcomeRoles)
            ? input.welcomeRoles
                  .map((role) => ({
                      name: String(role?.name ?? "").trim(),
                      emoji: String(role?.emoji ?? "").trim(),
                      description: String(role?.description ?? "").trim()
                  }))
                  .filter((role) => role.name.length > 0 && role.emoji.length > 0)
            : [];

        return {
            systemEnabled: input.systemEnabled === true,
            musicEnabled: input.musicEnabled === true,
            welcomeEnabled: input.welcomeEnabled === true,
            twitchEnabled: input.twitchEnabled === true,
            communityEnabled: input.communityEnabled === true,
            communityVotingEnabled: input.communityVotingEnabled === true,
            communityMaxChannels: Math.floor(this.normalizeNumber(input.communityMaxChannels, 1, 50) ?? 50),
            communityCategoryName: String(input.communityCategoryName ?? "Community").trim().slice(0, 100) || "Community",
            communityVotingChannelName: String(input.communityVotingChannelName ?? "kanalnamen-abstimmung").trim().slice(0, 100) || "kanalnamen-abstimmung",
            communityVotingDurationDays: Math.floor(this.normalizeNumber(input.communityVotingDurationDays, 1, 30) ?? 7),
            communityEmptyTimeoutSeconds: Math.floor(this.normalizeNumber(input.communityEmptyTimeoutSeconds, 1, 86400) ?? 60),
            discordToken: String(input.discordToken ?? "").trim(),
            guildId: this.normalizeString(input.guildId),
            adminUiUsername: String(input.adminUiUsername ?? "admin").trim() || "admin",
            adminUiToken: String(input.adminUiToken ?? "").trim(),
            adminUiPort: this.normalizeNumber(input.adminUiPort, 1, 65535) ?? 8787,
            adminLoginMaxFailures: Math.floor(this.normalizeNumber(input.adminLoginMaxFailures, 1, 20) ?? 5),
            adminLoginBlockMinutes: Math.floor(this.normalizeNumber(input.adminLoginBlockMinutes, 1, 1440) ?? 15),
            musicRoleName: String(input.musicRoleName ?? "Music Bot").trim() || "Music Bot",
            musicDefaultVolumePercent: this.normalizeNumber(input.musicDefaultVolumePercent, 0, 100) ?? 50,
            musicDebugSearch: input.musicDebugSearch === undefined ? true : Boolean(input.musicDebugSearch),
            musicYoutubeSearchLimit: this.normalizeNumber(input.musicYoutubeSearchLimit, 10, 100) ?? 25,
            audioDbApiKey: this.normalizeString(input.audioDbApiKey) ?? "123",
            audioDbApiVersion: input.audioDbApiVersion === "v2" ? "v2" : "v1",
            welcomeChannelId: this.normalizeString(input.welcomeChannelId),
            welcomeTitle: String(input.welcomeTitle ?? "👋 Welcome!").trim().slice(0, 100) || "👋 Welcome!",
            welcomeReactionPrompt: String(input.welcomeReactionPrompt ?? "React with an emoji below to get the matching role:").trim().slice(0, 1000) || "React with an emoji below to get the matching role:",
            welcomeReactionInstructions: String(input.welcomeReactionInstructions ?? "Click a reaction to get the role. Click it again to remove the role.").trim().slice(0, 1000) || "Click a reaction to get the role. Click it again to remove the role.",
            welcomeRoles: roles,
            twitchBroadcasterName: this.normalizeString(input.twitchBroadcasterName),
            twitchClientId: this.normalizeString(input.twitchClientId),
            twitchClientSecret: this.normalizeString(input.twitchClientSecret),
            twitchRedirectUri: this.normalizeString(input.twitchRedirectUri),
            twitchAccessToken: this.normalizeString(input.twitchAccessToken),
            twitchRefreshToken: this.normalizeString(input.twitchRefreshToken),
            twitchAccessTokenExpiresAt: this.normalizeNumber(input.twitchAccessTokenExpiresAt, 1, Number.MAX_SAFE_INTEGER),
            twitchFollowerRoleName: this.normalizeString(input.twitchFollowerRoleName),
            twitchSubscriberRoleName: this.normalizeString(input.twitchSubscriberRoleName),
            twitchLinkChannelName: String(input.twitchLinkChannelName ?? "twitch-verknuepfung").trim().toLowerCase().replace(/[^a-z0-9äöüß-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "twitch-verknuepfung",
            twitchLinkPanelTitle: String(input.twitchLinkPanelTitle ?? "Twitch-Konto verbinden").trim().slice(0, 100) || "Twitch-Konto verbinden",
            twitchLinkPanelMessage: String(input.twitchLinkPanelMessage ?? "Verbinde dein Twitch-Konto, damit deine Follower- und Abonnentenrollen zuverlässig synchronisiert werden können.").trim().slice(0, 1000) || "Verbinde dein Twitch-Konto, damit deine Follower- und Abonnentenrollen zuverlässig synchronisiert werden können."
        };
    }

    private validateConfigInput(input: Partial<AdminConfig>, allowUnchangedAdminPassword = false): string[] {
        const errors: string[] = [];
        const required = (value: unknown, label: string): void => {
            if (String(value ?? "").trim().length === 0) errors.push(`${label} is required.`);
        };
        const integerInRange = (value: unknown, min: number, max: number, label: string): void => {
            const parsed = Number(value);
            if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
                errors.push(`${label} must be an integer between ${min} and ${max}.`);
            }
        };

        required(input.discordToken, "Discord Token");
        required(input.adminUiUsername, "Admin Username");
        if (!allowUnchangedAdminPassword || String(input.adminUiToken ?? "").trim()) {
            required(input.adminUiToken, "Admin Password");
        }
        integerInRange(input.adminUiPort, 1, 65535, "Admin UI Port");
        integerInRange(input.adminLoginMaxFailures, 1, 20, "Admin Login Failure Limit");
        integerInRange(input.adminLoginBlockMinutes, 1, 1440, "Admin Login Block Duration");

        if (input.musicEnabled === true) {
            required(input.musicRoleName, "Music Role Name");
            required(input.audioDbApiKey, "TheAudioDB API Key");
            if (input.audioDbApiVersion !== "v1" && input.audioDbApiVersion !== "v2") {
                errors.push("TheAudioDB API Version must be v1 or v2.");
            }
        }

        if (input.communityEnabled === true) {
            required(input.communityCategoryName, "Community Category Name");
            integerInRange(input.communityMaxChannels, 1, 50, "Community Channel Limit");
            integerInRange(input.communityEmptyTimeoutSeconds, 1, 86400, "Community Empty Timeout");
        }

        if (input.communityVotingEnabled === true) {
            required(input.communityVotingChannelName, "Community Voting Channel Name");
            integerInRange(input.communityVotingDurationDays, 1, 30, "Community Voting Duration");
        }

        if (input.welcomeEnabled === true) {
            required(input.welcomeChannelId, "Welcome Channel");
            required(input.welcomeTitle, "Welcome Title");
            required(input.welcomeReactionPrompt, "Welcome Reaction Prompt");
            required(input.welcomeReactionInstructions, "Welcome Reaction Instructions");
            if (!Array.isArray(input.welcomeRoles) || input.welcomeRoles.length === 0) {
                errors.push("At least one Welcome Role is required.");
            } else {
                input.welcomeRoles.forEach((role, index) => {
                    required(role?.emoji, `Welcome Role ${index + 1} Emoji`);
                    required(role?.name, `Welcome Role ${index + 1} Name`);
                    required(role?.description, `Welcome Role ${index + 1} Description`);
                });
            }
        }

        if (input.twitchEnabled === true) {
            required(input.twitchBroadcasterName, "Twitch Broadcaster Name");
            required(input.twitchClientId, "Twitch Client ID");
            required(input.twitchClientSecret, "Twitch Client Secret");
            required(input.twitchRedirectUri, "Twitch Redirect URI");
            required(input.twitchLinkChannelName, "Twitch Link Channel Name");
            required(input.twitchLinkPanelTitle, "Twitch Link Panel Title");
            required(input.twitchLinkPanelMessage, "Twitch Link Panel Message");
            if (!String(input.twitchFollowerRoleName ?? "").trim() && !String(input.twitchSubscriberRoleName ?? "").trim()) {
                errors.push("At least one Twitch role name is required.");
            }
        }

        return errors;
    }

    private getTwitchOAuthConfig(config: AdminConfig): { clientId: string; clientSecret: string; redirectUri: string } | null {
        const clientId = (config.twitchClientId ?? "").trim();
        const clientSecret = (config.twitchClientSecret ?? "").trim();
        const redirectUri = (config.twitchRedirectUri ?? "").trim();

        if (!clientId || !clientSecret || !redirectUri) {
            return null;
        }

        return { clientId, clientSecret, redirectUri };
    }

    private buildTwitchAuthorizeUrl(
        config: { clientId: string; clientSecret: string; redirectUri: string },
        state: string
    ): string {
        const url = new URL("https://id.twitch.tv/oauth2/authorize");
        url.searchParams.set("response_type", "code");
        url.searchParams.set("client_id", config.clientId);
        url.searchParams.set("redirect_uri", config.redirectUri);
        url.searchParams.set("scope", "moderator:read:followers channel:read:subscriptions");
        url.searchParams.set("state", state);
        return url.toString();
    }

    private pruneExpiredTwitchOAuthStates(): void {
        const now = Date.now();
        for (const [state, entry] of this.twitchOAuthStates.entries()) {
            if (entry.createdAt + this.twitchStateTtlMs <= now) {
                this.twitchOAuthStates.delete(state);
            }
        }
    }

    private async handleTwitchOAuthCallback(res: ServerResponse, url: URL): Promise<void> {
        const error = url.searchParams.get("error");
        if (error) {
            const description = url.searchParams.get("error_description") ?? "Twitch denied the login request.";
            this.sendHtml(res, this.renderSimpleHtml("Twitch OAuth Failed", this.escapeHtml(description)));
            return;
        }

        const code = url.searchParams.get("code") ?? "";
        const state = url.searchParams.get("state") ?? "";
        if (!code || !state) {
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            res.end(this.renderSimpleHtml("Twitch OAuth Failed", this.escapeHtml("Missing OAuth code or state.")));
            return;
        }

        const memberState = await this.options.consumeTwitchMemberOAuthState(state);
        if (memberState) {
            const config = this.options.getConfig();
            const twitchConfig = this.getTwitchOAuthConfig(config);
            if (!twitchConfig) {
                res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
                res.end(this.renderSimpleHtml("Twitch-Verknüpfung fehlgeschlagen", this.escapeHtml("Twitch OAuth ist nicht vollständig konfiguriert.")));
                return;
            }
            try {
                const tokenResult = await this.exchangeTwitchCodeForTokens(code, twitchConfig);
                const profile = await this.fetchTwitchProfile(tokenResult.accessToken, twitchConfig.clientId);
                await this.options.saveTwitchMemberLink({
                    guildId: memberState.guildId,
                    discordUserId: memberState.discordUserId,
                    twitchUserId: profile.id,
                    twitchLogin: profile.login,
                    twitchDisplayName: profile.displayName ?? profile.login,
                    linkedAt: Date.now()
                });
                await this.options.syncTwitchRoles();
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end(this.renderSimpleHtml("Twitch-Konto verbunden", `Twitch-Konto <strong>${this.escapeHtml(profile.displayName ?? profile.login)}</strong> wurde zuverlässig mit deinem Discord-Mitglied verknüpft. Du kannst diesen Tab schließen.`));
            } catch (oauthError) {
                const message = oauthError instanceof Error ? oauthError.message : String(oauthError);
                res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
                res.end(this.renderSimpleHtml("Twitch-Verknüpfung fehlgeschlagen", this.escapeHtml(message)));
            }
            return;
        }

        this.pruneExpiredTwitchOAuthStates();
        if (!this.twitchOAuthStates.has(state)) {
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            res.end(this.renderSimpleHtml("Twitch OAuth Failed", this.escapeHtml("OAuth state expired or is invalid.")));
            return;
        }
        this.twitchOAuthStates.delete(state);

        const config = this.options.getConfig();
        const twitchConfig = this.getTwitchOAuthConfig(config);
        if (!twitchConfig) {
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            res.end(this.renderSimpleHtml("Twitch OAuth Failed", this.escapeHtml("Twitch OAuth is not fully configured.")));
            return;
        }

        try {
            const tokenResult = await this.exchangeTwitchCodeForTokens(code, twitchConfig);
            const profile = await this.fetchTwitchProfile(tokenResult.accessToken, twitchConfig.clientId);

            const next: AdminConfig = {
                ...config,
                twitchBroadcasterName: profile.login,
                twitchClientId: twitchConfig.clientId,
                twitchClientSecret: twitchConfig.clientSecret,
                twitchRedirectUri: twitchConfig.redirectUri,
                twitchAccessToken: tokenResult.accessToken,
                twitchRefreshToken: tokenResult.refreshToken,
                twitchAccessTokenExpiresAt: Date.now() + tokenResult.expiresIn * 1000
            };

            await this.options.saveConfig(next);
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                this.renderSimpleHtml(
                    "Twitch OAuth Connected",
                    `Twitch account <strong>${this.escapeHtml(profile.displayName ?? profile.login)}</strong> was connected successfully. You can close this tab.`
                )
            );
        } catch (oauthError) {
            const message = oauthError instanceof Error ? oauthError.message : String(oauthError);
            res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
            res.end(this.renderSimpleHtml("Twitch OAuth Failed", this.escapeHtml(message)));
        }
    }

    private async exchangeTwitchCodeForTokens(
        code: string,
        config: { clientId: string; clientSecret: string; redirectUri: string }
    ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
        const body = new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code,
            grant_type: "authorization_code",
            redirect_uri: config.redirectUri
        });

        const response = await fetch("https://id.twitch.tv/oauth2/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body
        });

        if (!response.ok) {
            throw new Error(`Twitch token exchange failed with HTTP ${response.status}`);
        }

        const payload = (await response.json()) as {
            access_token?: string;
            refresh_token?: string;
            expires_in?: number;
        };

        if (!payload.access_token || !payload.refresh_token || !payload.expires_in) {
            throw new Error("Twitch token exchange returned incomplete data.");
        }

        return {
            accessToken: payload.access_token,
            refreshToken: payload.refresh_token,
            expiresIn: payload.expires_in
        };
    }

    private async fetchTwitchProfile(
        accessToken: string,
        clientId: string
    ): Promise<{ id: string; login: string; displayName?: string }> {
        const response = await fetch("https://api.twitch.tv/helix/users", {
            headers: {
                "Client-ID": clientId,
                Authorization: `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`Twitch profile lookup failed with HTTP ${response.status}`);
        }

        const payload = (await response.json()) as { data?: Array<{ id?: string; login?: string; display_name?: string }> };
        const user = payload.data?.[0];
        if (!user?.id || !user.login) {
            throw new Error("Twitch profile lookup returned no user.");
        }

        return {
            id: user.id,
            login: user.login,
            displayName: user.display_name
        };
    }

    private renderSimpleHtml(title: string, message: string): string {
        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${this.escapeHtml(title)}</title>
  <style>
    body { font-family: Segoe UI, Tahoma, sans-serif; background:#0b1022; color:#f8fafc; margin:0; display:grid; place-items:center; min-height:100vh; }
    .card { max-width: 640px; background:#131a33; border:1px solid #2a3558; border-radius:16px; padding:24px; box-shadow:0 12px 36px rgba(0,0,0,.35); }
    h1 { margin:0 0 10px; font-size:28px; }
    p { color:#c8d1ea; line-height:1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${this.escapeHtml(title)}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
    }

    private escapeHtml(value: string): string {
        return value
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    private getRestartRequirement(previous: AdminConfig, next: AdminConfig): { required: boolean; fields: string[] } {
      const fields: Array<{ key: keyof AdminConfig; label: string }> = [
        { key: "systemEnabled", label: "Modul System" },
        { key: "musicEnabled", label: "Modul Musik" },
        { key: "welcomeEnabled", label: "Modul Welcome" },
        { key: "twitchEnabled", label: "Modul Twitch" },
        { key: "communityEnabled", label: "Modul Community" },
        { key: "communityVotingEnabled", label: "Modul Kanalnamen-Abstimmung" },
        { key: "discordToken", label: "Discord Token" },
        { key: "guildId", label: "Guild ID" },
                { key: "musicRoleName", label: "Music Role" },
        { key: "musicDefaultVolumePercent", label: "Music Default Volume" },
        { key: "musicDebugSearch", label: "Music Debug Search" },
                { key: "musicYoutubeSearchLimit", label: "Music YouTube Search Limit" }
      ];

      const changed = fields
        .filter((field) => (previous[field.key] ?? null) !== (next[field.key] ?? null))
        .map((field) => field.label);

      return {
        required: changed.length > 0,
        fields: changed
      };
    }

    private normalizeString(value: unknown): string | undefined {
        const text = String(value ?? "").trim();
        return text.length > 0 ? text : undefined;
    }

    private async proxyToSqliteWeb(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
        const upstreamPath = url.pathname.replace(/^\/admin\/sqlite/, "") || "/";
        const upstreamUrl = new URL(`${upstreamPath}${url.search}`, "http://sqlite-web:8080");
        const headers = { ...req.headers };
        const forwardedHost = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").trim();
        const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "http").trim() || "http";
        if (forwardedHost.length > 0) {
            headers["x-forwarded-host"] = forwardedHost;
        }
        headers["x-forwarded-proto"] = forwardedProto;
        headers["x-forwarded-prefix"] = "/admin/sqlite";
        delete headers["accept-encoding"];

        await new Promise<void>((resolve) => {
            const proxyReq = http.request(
                upstreamUrl,
                {
                    method: req.method,
                    headers
                },
                (proxyRes) => {
                    const contentType = String(proxyRes.headers["content-type"] ?? "");
                    const isHtml = contentType.includes("text/html");
                    const responseHeaders = { ...proxyRes.headers };
                    const locationHeader = responseHeaders.location;

                    if (locationHeader !== undefined) {
                        const locationValue = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader;
                        responseHeaders.location = this.rewriteSqliteWebLocation(String(locationValue));
                    }

                    if (!isHtml) {
                        res.writeHead(proxyRes.statusCode ?? 502, responseHeaders);
                        proxyRes.pipe(res);
                        proxyRes.on("end", () => resolve());
                        return;
                    }

                    const chunks: Buffer[] = [];
                    proxyRes.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
                    proxyRes.on("end", () => {
                        const body = Buffer.concat(chunks).toString("utf8");
                        const rewrittenBody = this.rewriteSqliteWebHtml(body);
                        if (responseHeaders["content-length"] !== undefined) {
                            responseHeaders["content-length"] = Buffer.byteLength(rewrittenBody).toString();
                        }
                        res.writeHead(proxyRes.statusCode ?? 502, responseHeaders);
                        res.end(rewrittenBody);
                        resolve();
                    });
                }
            );

            proxyReq.on("error", (error) => {
                console.error("[AdminUI] SQLite proxy error:", error);
                if (!res.headersSent) {
                    this.sendJson(res, 502, { error: "SQLite UI unavailable" });
                } else {
                    res.end();
                }
                resolve();
            });

            if (req.method === "GET" || req.method === "HEAD") {
                proxyReq.end();
                return;
            }

            req.pipe(proxyReq);
        });
    }

    private rewriteSqliteWebLocation(location: string): string {
        const basePath = "/admin/sqlite";
        const addPrefix = (inputPath: string): string => {
            const normalized = inputPath.startsWith("/") ? inputPath : `/${inputPath}`;
            if (normalized === basePath || normalized.startsWith(`${basePath}/`)) {
                return normalized;
            }

            return `${basePath}${normalized}`;
        };

        if (!location) {
            return location;
        }

        if (location.startsWith("http://") || location.startsWith("https://")) {
            try {
                const parsed = new URL(location);
                const isInternalSqliteHost = parsed.hostname === "sqlite-web"
                    || parsed.hostname === "localhost"
                    || parsed.hostname === "127.0.0.1";

                if (!isInternalSqliteHost) {
                    return location;
                }

                return `${addPrefix(parsed.pathname)}${parsed.search}${parsed.hash}`;
            } catch {
                return location;
            }
        }

        if (location.startsWith("/")) {
            return addPrefix(location);
        }

        return addPrefix(location);
    }

    private rewriteSqliteWebHtml(html: string): string {
                const darkThemeStyles = `
<style>
    body.sqlite-dark {
        background: #060812 !important;
        color: #eef2ff !important;
    }
    body.sqlite-dark .container-fluid,
    body.sqlite-dark .page-header,
    body.sqlite-dark .row,
    body.sqlite-dark .col-3,
    body.sqlite-dark .col-9 {
        background: transparent !important;
        color: inherit !important;
    }
    body.sqlite-dark a,
    body.sqlite-dark .nav-link,
    body.sqlite-dark .btn,
    body.sqlite-dark .table,
    body.sqlite-dark label,
    body.sqlite-dark input,
    body.sqlite-dark textarea,
    body.sqlite-dark select,
    body.sqlite-dark h1,
    body.sqlite-dark h3,
    body.sqlite-dark p,
    body.sqlite-dark th,
    body.sqlite-dark td {
        color: inherit !important;
    }
    body.sqlite-dark .table,
    body.sqlite-dark .table-striped tbody tr:nth-of-type(odd),
    body.sqlite-dark .table-striped tbody tr:nth-of-type(even) {
        background-color: #0f1428 !important;
        color: #eef2ff !important;
    }
    body.sqlite-dark .table-striped tbody tr:nth-of-type(odd) {
        background-color: #131a33 !important;
    }
    body.sqlite-dark .form-control,
    body.sqlite-dark .form-select,
    body.sqlite-dark textarea,
    body.sqlite-dark input {
        background: #0b1124 !important;
        border-color: #344166 !important;
        color: #eef2ff !important;
    }
    body.sqlite-dark .btn-primary {
        background: linear-gradient(135deg, #b05cff, #7c3aed) !important;
        border-color: #8f47ef !important;
    }
    body.sqlite-dark .btn-secondary {
        background: #232b45 !important;
        border-color: #3b4668 !important;
    }
    body.sqlite-dark .nav-pills .nav-link.active,
    body.sqlite-dark .nav-pills .show > .nav-link {
        background: rgba(176, 92, 255, .18) !important;
        border-color: rgba(176, 92, 255, .5) !important;
    }
    body.sqlite-dark hr { border-color: rgba(148, 163, 184, .18) !important; }
    body.sqlite-dark .page-header { border-bottom: 1px solid rgba(148, 163, 184, .18) !important; }
    body.sqlite-dark .table td,
    body.sqlite-dark .table th { border-color: rgba(148, 163, 184, .12) !important; }
</style>`;

                return html
                    .replace(/<body([^>]*)>/i, (_match, attributes: string) => {
                        const existingClassMatch = String(attributes).match(/class=(['"])(.*?)\1/i);
                        if (existingClassMatch) {
                            const nextClasses = `${existingClassMatch[2]} sqlite-dark`.trim();
                            return `<body${String(attributes).replace(/class=(['"])(.*?)\1/i, `class="${nextClasses}"`)}>`;
                        }

                        return `<body${attributes} class="sqlite-dark">`;
                    })
                        .replace("</head>", `${darkThemeStyles}</head>`)
            .replace(/(href|src|action)=(['"])\/(?!admin\/sqlite\/)/g, '$1=$2/admin/sqlite/')
            .replace(/url\((['"]?)\/(?!admin\/sqlite\/)/g, 'url($1/admin/sqlite/');
    }

    private async getUnicodeEmojis(): Promise<Array<{ value: string; label: string; group: string }>> {
        if (this.unicodeEmojisCache) {
            return this.unicodeEmojisCache;
        }

        if (this.unicodeEmojiLoadFailed) {
            return [];
        }

        try {
            const filePath = path.resolve(process.cwd(), "node_modules", "emojibase-data", "en", "data.json");
            const raw = await fs.readFile(filePath, "utf8");
            const parsed = JSON.parse(raw) as Array<{ emoji?: string; annotation?: string; label?: string; group?: number }>;

            const seen = new Set<string>();
            this.unicodeEmojisCache = parsed
                .filter((item) => typeof item.emoji === "string" && item.emoji.length > 0)
                .map((item) => {
                    const value = item.emoji as string;
                    const annotation = String(item.annotation ?? item.label ?? "").trim();
                    return {
                        value,
                        label: annotation.length > 0 ? `${value} ${annotation}` : value,
                        group: this.mapUnicodeEmojiGroup(item.group)
                    };
                })
                .filter((item) => {
                    if (seen.has(item.value)) {
                        return false;
                    }

                    seen.add(item.value);
                    return true;
                });

            return this.unicodeEmojisCache;
        } catch (error) {
            this.unicodeEmojiLoadFailed = true;
            console.warn("[AdminUI] Failed to load Unicode emoji dataset:", error);
            return [];
        }
    }

    private mapUnicodeEmojiGroup(group?: number): string {
        switch (group) {
            case 0:
                return "Smileys & Emotion";
            case 1:
                return "People & Body";
            case 2:
                return "Components";
            case 3:
                return "Animals & Nature";
            case 4:
                return "Food & Drink";
            case 5:
                return "Travel & Places";
            case 6:
                return "Activities";
            case 7:
                return "Objects";
            case 8:
                return "Symbols";
            case 9:
                return "Flags";
            default:
                return "Other";
        }
    }

    private normalizeNumber(value: unknown, min: number, max: number): number | undefined {
        if (value === undefined || value === null || value === "") {
            return undefined;
        }

        const num = Number(value);
        if (!Number.isFinite(num)) {
            return undefined;
        }

        if (num < min || num > max) {
            return undefined;
        }

        return num;
    }

    private createSession(username: string): string {
        const sessionId = randomUUID();
        this.sessions.set(sessionId, {
            username,
            expiresAt: Date.now() + this.sessionTtlMs
        });
        return sessionId;
    }

    private getLoginRetryAfterSeconds(clientKey: string, now = Date.now()): number {
        const state = this.loginAttempts.get(clientKey);
        if (!state) return 0;
        if (state.blockedUntil > now) return Math.max(1, Math.ceil((state.blockedUntil - now) / 1000));
        if (now - state.firstFailureAt >= this.loginAttemptWindowMs) this.loginAttempts.delete(clientKey);
        return 0;
    }

    private recordLoginFailure(clientKey: string, now = Date.now()): number {
        const current = this.loginAttempts.get(clientKey);
        const state = !current || now - current.firstFailureAt >= this.loginAttemptWindowMs
            ? { failures: 0, firstFailureAt: now, blockedUntil: 0 }
            : current;
        state.failures += 1;
        const config = this.options.getConfig();
        const maxFailures = Math.max(1, Math.min(20, Math.floor(config.adminLoginMaxFailures ?? 5)));
        const blockMs = Math.max(1, Math.min(1440, Math.floor(config.adminLoginBlockMinutes ?? 15))) * 60 * 1000;
        if (state.failures >= maxFailures) state.blockedUntil = now + blockMs;
        this.loginAttempts.set(clientKey, state);
        return state.blockedUntil > now ? Math.ceil((state.blockedUntil - now) / 1000) : 0;
    }

    private getAuthenticatedUsername(req: IncomingMessage): string | null {
        const sessionId = this.getSessionIdFromRequest(req);
        if (!sessionId) {
            return null;
        }

        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }

        if (session.expiresAt <= Date.now()) {
            this.sessions.delete(sessionId);
            return null;
        }

        return session.username;
    }

    private getSessionIdFromRequest(req: IncomingMessage): string | null {
        const cookieHeader = req.headers.cookie;
        if (!cookieHeader) {
            return null;
        }

        const pairs = cookieHeader.split(";").map((entry) => entry.trim());
        for (const pair of pairs) {
            const [name, ...rest] = pair.split("=");
            if (name === "admin_session") {
                return decodeURIComponent(rest.join("="));
            }
        }

        return null;
    }

    private setSessionCookie(res: ServerResponse, sessionId: string): void {
        res.setHeader(
            "Set-Cookie",
            `admin_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(
                this.sessionTtlMs / 1000
            )}`
        );
    }

    private clearSessionCookie(res: ServerResponse): void {
        res.setHeader("Set-Cookie", "admin_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
    }

    private readBody(req: IncomingMessage): Promise<string> {
        return new Promise((resolve, reject) => {
            let raw = "";
            req.setEncoding("utf8");
            req.on("data", (chunk) => {
                raw += chunk;
            });
            req.on("end", () => resolve(raw));
            req.on("error", reject);
        });
    }

    private sendJson(res: ServerResponse, status: number, payload: unknown): void {
        const body = JSON.stringify(payload);
        res.writeHead(status, {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": Buffer.byteLength(body)
        });
        res.end(body);
    }

    private sendDownloadJson(res: ServerResponse, fileName: string, payload: unknown): void {
        const body = JSON.stringify(payload, null, 2);
        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="${fileName}"`,
            "Cache-Control": "no-store",
            "Content-Length": Buffer.byteLength(body)
        });
        res.end(body);
    }

    private sendHtml(res: ServerResponse, html: string): void {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
    }

    private async sendJavaScriptFile(res: ServerResponse, filePath: string): Promise<void> {
        try {
            const content = await fs.readFile(filePath);
            res.writeHead(200, {
                "Content-Type": "application/javascript; charset=utf-8",
                "Content-Length": content.length,
                "Cache-Control": "no-store"
            });
            res.end(content);
        } catch {
            const fallback = "console.error('Admin UI bundle is missing. Please run npm run build.');";
            res.writeHead(500, {
                "Content-Type": "application/javascript; charset=utf-8",
                "Content-Length": Buffer.byteLength(fallback)
            });
            res.end(fallback);
        }
    }

    private renderHtml(authenticatedUser: string | null): string {
        const initialAuthState = authenticatedUser
            ? JSON.stringify({ authenticated: true, username: authenticatedUser })
            : JSON.stringify({ authenticated: false, username: null });

        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Discord Bot Admin</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" />
  <style>
        :root {
            --bg:#060812;
            --bg2:#0b1022;
            --card:#0f1428;
            --card2:#131a33;
            --ink:#f8fafc;
            --muted:#9aa3bd;
            --line:#2a3558;
            --accent:#b05cff;
            --accent2:#7c3aed;
            --ok:#7bf1bf;
            --danger:#ef5a86;
        }
    * { box-sizing: border-box; }
        body {
            margin:0;
            font-family: "Segoe UI", Tahoma, sans-serif;
            color: var(--ink);
            background:
                radial-gradient(900px 500px at 78% -8%, rgba(124,58,237,.36), transparent 70%),
                radial-gradient(700px 420px at 20% 8%, rgba(176,92,255,.18), transparent 65%),
                linear-gradient(160deg, var(--bg2), var(--bg));
            min-height: 100vh;
        }
        .site-shell { max-width: 1220px; margin: 0 auto; padding: 18px 18px 30px; }
        .site-header {
            display:flex;
            align-items:center;
            justify-content:space-between;
            border: 1px solid var(--line);
            border-radius: 16px;
            padding: 10px 14px;
            background: rgba(8,11,22,.76);
            backdrop-filter: blur(8px);
            margin-bottom: 26px;
        }
        .brand-wrap { display:flex; align-items:center; gap:10px; }
        .brand-logo { width:34px; height:34px; border-radius:9px; border:1px solid rgba(255,255,255,.18); }
        .brand-title { font-weight:700; letter-spacing:.2px; }
        .brand-badge {
            margin-left:10px;
            font-size:11px;
            color:#d0d6ee;
            border:1px solid var(--line);
            border-radius:999px;
            padding:3px 8px;
            background: rgba(28,34,59,.65);
        }
        .header-links { display:flex; gap:10px; align-items:center; }
        .header-tab {
            border:1px solid rgba(150,168,217,.35);
            background: rgba(24,31,53,.62);
            color:#d8def4;
            height:34px;
            padding:0 12px;
            border-radius:10px;
            display:inline-flex;
            align-items:center;
            justify-content:center;
        }
        .header-tab.active {
            border-color: rgba(194,132,252,.55);
            color:#ffffff;
            background: rgba(62,40,95,.42);
        }
        .header-tab:hover {
            border-color: rgba(194,132,252,.55);
            color:#ffffff;
            background: rgba(62,40,95,.42);
        }
        .header-links a {
            color:#b6c0df;
            text-decoration:none;
            font-size:13px;
            display:inline-flex;
            align-items:center;
            height:34px;
            padding:0 4px;
        }
        .header-links a:hover { color:#ffffff; }
        .header-icon-action {
            border:1px solid rgba(150,168,217,.35);
            background: rgba(24,31,53,.62);
            color:#d8def4;
            width:34px;
            height:34px;
            border-radius:10px;
            display:inline-flex;
            align-items:center;
            justify-content:center;
            padding:0;
        }
        .header-icon-action:hover {
            border-color: rgba(194,132,252,.55);
            color:#ffffff;
            background: rgba(62,40,95,.42);
        }
        .wrap { max-width: 1040px; margin: 0 auto; }
        .card {
            background:
                linear-gradient(180deg, rgba(19,26,51,.86), rgba(14,20,40,.9));
            border: 1px solid var(--line);
            border-radius: 16px;
            padding: 20px;
            margin-bottom: 16px;
            box-shadow: 0 12px 36px rgba(0,0,0,.35);
        }
        h1 { margin: 0 0 10px; font-size: 36px; line-height: 1.15; }
        h1 strong { color: var(--accent); }
    p { color: var(--muted); }
        label { display:block; font-size: 12px; text-transform: uppercase; letter-spacing:.4px; color: #94a2c9; margin: 12px 0 6px; }
        .required-mark { color:#dc3545 !important; font-weight:800; }
        .discord-status {
            display:flex;
            align-items:center;
            gap:8px;
            width:max-content;
            max-width:100%;
            margin:14px 0;
            padding:8px 12px;
            border:1px solid;
            border-radius:6px;
            font-size:13px;
        }
        .discord-status-dot { width:9px; height:9px; border-radius:50%; background:currentColor; flex:0 0 auto; }
        .discord-status-online { color:#146c43; background:#d1e7dd; border-color:#a3cfbb; }
        .discord-status-starting { color:#084298; background:#cfe2ff; border-color:#9ec5fe; }
        .discord-status-token-invalid, .discord-status-guild-unreachable, .discord-status-error { color:#842029; background:#f8d7da; border-color:#f1aeb5; }
        .discord-status-offline { color:#41464b; background:#e2e3e5; border-color:#c4c8cb; }
        .database-status { color:#6c757d; font-size:12px; margin:8px 0 14px; }
        input, select, textarea {
            width:100%;
            padding:11px 12px;
            border-radius:11px;
            border:1px solid #344166;
            background:#0b1124;
            color:var(--ink);
            outline:none;
            transition:border-color .2s, box-shadow .2s;
        }
        input:focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(176,92,255,.22); }
        textarea { min-height:82px; resize:vertical; font:inherit; }
        .welcome-copy-fields { margin-top:14px; }
        .welcome-preview { margin-top:16px; padding:14px; border:1px solid #344166; border-left:4px solid #5865f2; border-radius:8px; background:#111827; color:#f2f3f5; overflow-wrap:anywhere; }
        .welcome-preview-label { margin-bottom:10px; color:#aeb7d4; font-size:11px; font-weight:700; text-transform:uppercase; }
        .welcome-preview h3 { margin:0 0 12px; font-size:20px; letter-spacing:0; }
        .welcome-preview p { margin:0 0 12px; white-space:pre-wrap; }
        .welcome-preview-roles { display:grid; gap:6px; margin-bottom:12px; }
        .welcome-preview-instructions { color:#c4c9d4; margin-bottom:0 !important; }
        .emoji-dropdown { position:relative; width:100%; }
        .emoji-trigger {
            width:100%;
            min-height:42px;
            display:flex;
            align-items:center;
            justify-content:space-between;
            border-radius:11px;
            border:1px solid #344166;
            background:#0b1124;
            color:var(--ink);
            padding:10px 12px;
            text-align:left;
        }
        .emoji-trigger:hover { border-color:#4d5f94; }
        .emoji-trigger:focus-visible { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(176,92,255,.22); outline:none; }
        .emoji-trigger .emoji-trigger-label {
            overflow:hidden;
            text-overflow:ellipsis;
            white-space:nowrap;
            max-width:calc(100% - 20px);
        }
        .emoji-panel {
            position:absolute;
            top:calc(100% + 6px);
            left:0;
            width:min(300px, 82vw);
            z-index:35;
            border:1px solid #3a4670;
            border-radius:12px;
            background:#0a1123;
            box-shadow:0 18px 32px rgba(0,0,0,.5);
            padding:8px;
        }
        .emoji-search-input { margin-bottom:8px; }
        .emoji-groups { max-height:260px; overflow:auto; padding-right:3px; }
        .emoji-group-title { color:#9ca9cf; font-size:11px; text-transform:uppercase; letter-spacing:.4px; margin:8px 2px 4px; }
        .emoji-option {
            width:100%;
            display:block;
            text-align:left;
            background:transparent;
            color:var(--ink);
            border:1px solid transparent;
            border-radius:8px;
            padding:6px 8px;
            margin-bottom:2px;
            font-weight:500;
        }
        .emoji-option:hover { border-color:#405086; background:rgba(53,67,112,.35); }
        .emoji-option.active { border-color:#7c3aed; background:rgba(124,58,237,.22); }
        .emoji-empty { color:#9aa3bd; font-size:12px; padding:6px 4px; }
        button {
            border:1px solid transparent;
            border-radius:11px;
            padding:10px 14px;
            cursor:pointer;
            font-weight:600;
            transition: transform .12s ease, filter .2s ease;
        }
        button:hover { transform: translateY(-1px); }
        button:disabled { opacity:0.45; cursor:not-allowed; filter:saturate(0.2); transform:none; }
    .row { display:grid; grid-template-columns: minmax(150px, 0.75fr) 1fr 1fr auto; gap:8px; margin-bottom:8px; }
    .welcome-role-row > * { min-width:0; }
    .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
        .add { background: linear-gradient(135deg, #4f46e5, #7c3aed); color:white; }
        .save { background: linear-gradient(135deg, var(--accent), var(--accent2)); color:white; }
        .del { background: linear-gradient(135deg, #fb7185, #e11d48); color:white; }
        .icon-btn { display:inline-flex; align-items:center; gap:8px; }
        .icon-btn i { font-size: 13px; }
        .icon-only { width:38px; height:38px; justify-content:center; padding:0; }
        .status { margin-top:10px; min-height:20px; }
        .muted { color:var(--muted); font-size:12px; }
        .log-panel {
            margin-top:16px;
            border:1px solid #2f3d67;
            border-radius:12px;
            background:#090f20;
            overflow:hidden;
        }
        .log-panel-head {
            display:flex;
            align-items:center;
            justify-content:space-between;
            padding:10px 12px;
            border-bottom:1px solid #2f3d67;
            color:#c7d0eb;
            font-size:12px;
            text-transform:uppercase;
            letter-spacing:.4px;
        }
        .log-body {
            max-height:280px;
            overflow:auto;
            font-family: Consolas, "Courier New", monospace;
            font-size:12px;
            line-height:1.45;
            padding:8px 12px;
            white-space:pre-wrap;
            color:#d5ddf5;
            scrollbar-width: thin;
            scrollbar-color: #55649a #0b1225;
        }
        .log-body::-webkit-scrollbar { width: 10px; }
        .log-body::-webkit-scrollbar-track {
            background:#0b1225;
            border-left:1px solid rgba(92,110,164,.22);
            border-radius:8px;
        }
        .log-body::-webkit-scrollbar-thumb {
            background: linear-gradient(180deg, #4c5d96, #3a4673);
            border:1px solid rgba(131,151,214,.35);
            border-radius:8px;
        }
        .log-body::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(180deg, #655fc6, #4d469e);
            border-color: rgba(178,145,255,.55);
        }
        .log-line { padding:2px 0; border-bottom:1px dashed rgba(120,136,184,.16); }
        .log-line:last-child { border-bottom:none; }
        .community-channel-row {
            display:grid;
            grid-template-columns:minmax(0, 1fr) auto 38px;
            align-items:center;
            gap:10px;
            min-height:42px;
        }
        .community-channel-name { min-width:0; overflow-wrap:anywhere; }
        .community-channel-members { white-space:nowrap; text-align:right; }
        .community-channel-delete { justify-self:end; }
        .community-channel-action-placeholder { width:38px; }
        .log-level { display:inline-block; min-width:52px; font-weight:700; }
        .log-level.log, .log-level.info { color:#b7c3ea; }
        .log-level.warn { color:#f3d077; }
        .log-level.error { color:#f49ab4; }
        .region {
            position:relative;
            z-index:0;
            border:1px solid #2f3d67;
            border-radius:12px;
            background:#0a1123;
            margin-top:12px;
            overflow:visible;
        }
        .region:has(.emoji-dropdown.is-open) { z-index:50; }
        .region-summary {
            display:flex;
            align-items:center;
            gap:10px;
            cursor:pointer;
            user-select:none;
            list-style:none;
            padding:10px 12px;
            color:#d7def4;
            font-weight:700;
            border-bottom:1px solid rgba(120,136,184,.22);
        }
        .region-title { min-width:0; }
        .region-status {
            color:#93a2c9;
            font-size:12px;
            font-weight:600;
            margin-left:auto;
            padding-right:18px;
            white-space:nowrap;
        }
        .module-switch {
            display:inline-flex;
            flex:0 0 auto;
            align-items:center;
            cursor:pointer;
        }
        .module-switch input {
            position:absolute;
            width:1px;
            height:1px;
            opacity:0;
            pointer-events:none;
        }
        .module-switch-track {
            position:relative;
            display:inline-flex;
            align-items:center;
            width:38px;
            height:22px;
            padding:2px;
            border:1px solid #4a5a86;
            border-radius:999px;
            background:#18223f;
            transition:background .18s ease, border-color .18s ease;
        }
        .module-switch-thumb {
            width:16px;
            height:16px;
            border-radius:50%;
            background:#9aa8ca;
            box-shadow:0 1px 3px rgba(0,0,0,.35);
            transition:transform .18s ease, background .18s ease;
        }
        .module-switch input:checked + .module-switch-track {
            border-color:#5ee6b0;
            background:#164c4a;
        }
        .module-switch input:checked + .module-switch-track .module-switch-thumb {
            background:#7bf1bf;
            transform:translateX(16px);
        }
        .module-switch input:focus-visible + .module-switch-track {
            outline:2px solid #b05cff;
            outline-offset:2px;
        }
        .setting-switch {
            display:flex;
            align-items:center;
            gap:12px;
            width:max-content;
            margin:16px 0 10px;
            text-transform:none;
            letter-spacing:0;
            color:#d7def4;
            cursor:pointer;
        }
        .setting-switch > span:last-child { margin-left:4px; }
        .secret-field { position:relative; display:block; width:100%; }
        .secret-field input { display:block; width:100%; padding-right:48px; }
        .secret-toggle {
            position:absolute;
            right:4px;
            top:50%;
            width:36px;
            height:36px;
            background:transparent;
            color:#9aa8ca;
            transform:translateY(-50%);
        }
        .secret-toggle:hover { color:#f8fafc; background:rgba(124,58,237,.18); transform:translateY(-50%); }
        .region-summary::-webkit-details-marker { display:none; }
        .region-summary::after {
            content:"▾";
            float:right;
            color:#93a2c9;
            transition:transform .2s ease;
        }
        .region:not([open]) .region-summary::after { transform:rotate(-90deg); }
        .region-content { padding:10px 12px 12px; }
        .region-content { position:relative; z-index:1; }
        .settings-subsection {
            margin-top:18px;
            padding-top:16px;
            border-top:1px solid rgba(120,136,184,.22);
        }
        .settings-subsection h2 {
            margin:0 0 12px;
            color:#d7def4;
            font-size:15px;
        }
        @media (max-width: 560px) {
            .region-summary { flex-wrap:wrap; }
            .region-status { margin-left:0; padding-right:18px; }
            .region-title { flex:1 1 auto; }
        }
        .sqlite-browser-frame {
            overflow:hidden;
            border:1px solid #2f3d67;
            border-radius:16px;
            background:#070b16;
            min-height: 760px;
        }
        .sqlite-browser-frame iframe {
            display:block;
            width:100%;
            height: calc(100vh - 240px);
            min-height: 760px;
            border:0;
            background:#070b16;
        }
    .loading-overlay { position:absolute; inset:0; display:none; align-items:center; justify-content:center; background:rgba(2,6,23,.82); border-radius:14px; z-index:20; }
    .loading-overlay.active { display:flex; }
        .admin-toast-stack {
            position:fixed;
            bottom:24px;
            left:50%;
            transform:translateX(-50%);
            z-index:100;
            width:min(760px, calc(100vw - 48px));
            display:flex;
            flex-direction:column;
            gap:12px;
            pointer-events:none;
        }
        .admin-toast {
            width:100%;
            display:flex;
            align-items:center;
            gap:10px;
            min-height:76px;
            padding:20px 24px;
            border:1px solid;
            border-left-width:4px;
            border-radius:4px;
            box-shadow:0 8px 22px rgba(17,45,78,.18);
            font-size:16px;
            line-height:1.5;
            animation:toast-in .18s ease-out;
        }
        .admin-toast-system { background:#cfe2ff; border-color:#9ec5fe; color:#084298; }
        .admin-toast-error { background:#f8d7da; border-color:#f1aeb5; color:#842029; }
        .admin-toast.admin-toast-restart {
            background-color:#fff3cd !important;
            background-image:none !important;
            border-color:#ffda6a;
            color:#664d03;
            opacity:1;
            backdrop-filter:none;
        }
        .admin-toast-icon { font-size:22px; flex:0 0 auto; }
        @keyframes toast-in {
            from { opacity:0; transform:translateY(8px); }
            to { opacity:1; transform:translateY(0); }
        }
        @media (max-width:560px) {
            .admin-toast-stack {
                bottom:12px;
                width:calc(100vw - 24px);
            }
        }
    .loading-box { display:flex; flex-direction:column; align-items:center; gap:10px; color:#e5e7eb; }
        .spinner { width:34px; height:34px; border:4px solid rgba(148,163,184,.3); border-top-color:var(--accent); border-radius:999px; animation:spin 0.85s linear infinite; }
        @media (max-width: 900px) {
            .header-links { display:none; }
            h1 { font-size: 30px; }
            .grid2 { grid-template-columns: 1fr; }
        }
        @media (max-width: 680px) {
            .admin-toast-stack { width:calc(100vw - 24px); }
            .admin-toast { min-height:64px; padding:16px 18px; font-size:14px; }
            .welcome-role-row { grid-template-columns:1fr auto; }
            .welcome-role-row .emoji-dropdown,
            .welcome-role-row input { grid-column:1 / -1; }
            .welcome-role-row .del { grid-column:2; justify-self:end; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>
    window.__ADMIN_INITIAL_AUTH__ = ${initialAuthState};
  </script>
    <script src="admin/app.js" defer></script>
</body>
</html>`;
    }
}
