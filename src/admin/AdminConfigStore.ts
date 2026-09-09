import path from "node:path";
import { communityChannelNamesSeedSql } from "./migrations/communityChannelNames";
import sqlite3 from "sqlite3";
import { open, type Database } from "sqlite";
import type { WelcomeRoleOption } from "../types/Discord";

export type AdminConfig = {
    systemEnabled?: boolean;
    musicEnabled?: boolean;
    welcomeEnabled?: boolean;
    twitchEnabled?: boolean;
    communityEnabled?: boolean;
    communityCategoryName?: string;
    communityEmptyTimeoutSeconds?: number;
    communityMaxChannels?: number;

    discordToken: string;
    guildId?: string;
    adminUiUsername: string;
    adminUiToken: string;
    adminUiPort: number;
    musicRoleName: string;
    musicDefaultVolumePercent?: number;
    musicDebugSearch: boolean;
    musicYoutubeSearchLimit?: number;
    audioDbApiKey?: string;
    audioDbApiVersion?: "v1" | "v2";
    spotifyClientId?: string;
    spotifyClientSecret?: string;
    spotifyRedirectUri?: string;
    welcomeChannelId?: string;
    welcomeRoles: WelcomeRoleOption[];
    twitchBroadcasterName?: string;
    twitchClientId?: string;
    twitchClientSecret?: string;
    twitchRedirectUri?: string;
    twitchAccessToken?: string;
    twitchRefreshToken?: string;
    twitchAccessTokenExpiresAt?: number;
    twitchFollowerRoleName?: string;
    twitchSubscriberRoleName?: string;
};

export type CommunityState = {
    categoryId?: string;
    entryId?: string;
    temporaryIds: string[];
};

export class AdminConfigStore {
    private readonly filePath: string;
    private db?: Database;

    public constructor(filePath: string) {
        this.filePath = filePath;
    }

    public async initialize(defaults: AdminConfig): Promise<void> {
        await this.ensureDb();
        await this.db!.exec(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        `);

        await this.db!.exec(`
            CREATE TABLE IF NOT EXISTS roles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                emoji TEXT NOT NULL,
                description TEXT NOT NULL,
                sort_order INTEGER NOT NULL
            );
        `);

        await this.db!.exec(`
            CREATE TABLE IF NOT EXISTS community_state (
                guild_id TEXT PRIMARY KEY,
                category_id TEXT,
                entry_id TEXT,
                temporary_ids TEXT NOT NULL
            );
        `);

        for (const [key, value] of Object.entries(defaults).filter(([key]) => key !== "welcomeRoles")) {
            await this.db!.run(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                key,
                this.serializeForDb(value)
            );
        }

        await this.migrateRoles(defaults.welcomeRoles);
        await this.initializeCommunityNames();
    }

    public async load(defaults: AdminConfig): Promise<AdminConfig> {
        await this.initialize(defaults);
        const rows = (await this.db!.all<{ key: string; value: string }[]>(
            "SELECT key, value FROM settings"
        )) as Array<{ key: string; value: string }>;

        const loaded: Partial<AdminConfig> = {};
        for (const row of rows) {
            (loaded as Record<string, unknown>)[row.key] = JSON.parse(row.value);
        }

        const roles = await this.loadRoles();

        return this.normalize({
            ...defaults,
            ...loaded,
            welcomeRoles: roles.length > 0 ? roles : defaults.welcomeRoles
        });
    }

    public async initializeCommunityNames(): Promise<void> {
        await this.ensureDb();
        await this.db!.exec(`
            CREATE TABLE IF NOT EXISTS community_channel_names (
                name TEXT PRIMARY KEY CHECK(length(name) BETWEEN 1 AND 100)
            );
            CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY);
        `);
        // Seed once, atomically. Repeated deployments preserve edits in SQLite.
        await this.db!.exec("BEGIN IMMEDIATE");
        try {
            const applied = await this.db!.get("SELECT id FROM schema_migrations WHERE id = ?", "community-names-v1");
            if (!applied) {
                await this.db!.exec(communityChannelNamesSeedSql);
                await this.db!.run("INSERT INTO schema_migrations (id) VALUES (?)", "community-names-v1");
            }
            await this.db!.exec("COMMIT");
        } catch (error) {
            await this.db!.exec("ROLLBACK");
            throw error;
        }
    }

    public async getCommunityChannelNames(): Promise<string[]> {
        await this.ensureDb();
        const rows = await this.db!.all<Array<{ name: string }>>("SELECT name FROM community_channel_names ORDER BY name");
        return rows.map(row => row.name);
    }

    public async getCommunityState(guildId: string): Promise<CommunityState | undefined> {
        await this.ensureDb();
        const row = await this.db!.get<{ category_id?: string; entry_id?: string; temporary_ids: string }>(
            "SELECT category_id, entry_id, temporary_ids FROM community_state WHERE guild_id = ?",
            guildId
        );
        if (!row) return undefined;

        const temporaryIds = JSON.parse(row.temporary_ids);
        if (!Array.isArray(temporaryIds) || !temporaryIds.every(id => typeof id === "string" && /^\d+$/.test(id))) {
            throw new Error(`Invalid community state for guild ${guildId}`);
        }

        return { categoryId: row.category_id, entryId: row.entry_id, temporaryIds };
    }

    public async saveCommunityState(guildId: string, state: CommunityState): Promise<void> {
        await this.ensureDb();
        await this.db!.run(
            `INSERT INTO community_state (guild_id, category_id, entry_id, temporary_ids)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(guild_id) DO UPDATE SET
                category_id = excluded.category_id,
                entry_id = excluded.entry_id,
                temporary_ids = excluded.temporary_ids`,
            guildId,
            state.categoryId ?? null,
            state.entryId ?? null,
            JSON.stringify(state.temporaryIds)
        );
    }

    public async save(config: AdminConfig): Promise<void> {
        await this.ensureDb();
        const normalized = this.normalize(config);

        for (const [key, value] of Object.entries(normalized).filter(([key]) => key !== "welcomeRoles")) {
            await this.db!.run(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                key,
                this.serializeForDb(value)
            );
        }

        await this.db!.run("DELETE FROM settings WHERE key = ?", "welcomeRoles");
        await this.saveRoles(normalized.welcomeRoles);
    }

    public async close(): Promise<void> {
        if (!this.db) return;
        await this.db.close();
        this.db = undefined;
    }

    private normalize(input: Partial<AdminConfig>): AdminConfig {
        const roles = this.normalizeRoles(input.welcomeRoles);

        const discordToken = String(input.discordToken ?? "").trim();
        const guildId = this.normalizeString(input.guildId);
        const adminUiUsername = String(input.adminUiUsername ?? "admin").trim() || "admin";
        const adminUiToken = String(input.adminUiToken ?? "admin").trim() || "admin";
        const adminUiPort = this.normalizeNumber(input.adminUiPort, 1, 65535) ?? 8787;
        const musicRoleName = String(input.musicRoleName ?? "Music Bot").trim() || "Music Bot";
        const musicDefaultVolumePercent = this.normalizeNumber(input.musicDefaultVolumePercent, 0, 100) ?? 50;
        const musicYoutubeSearchLimit = this.normalizeNumber(input.musicYoutubeSearchLimit, 10, 100) ?? 25;
        const audioDbApiKey = this.normalizeString(input.audioDbApiKey) ?? "123";
        const audioDbApiVersion = input.audioDbApiVersion === "v2" ? "v2" : "v1";
        const musicDebugSearch = input.musicDebugSearch === undefined ? true : Boolean(input.musicDebugSearch);
        const spotifyClientId = this.normalizeString(input.spotifyClientId);
        const spotifyClientSecret = this.normalizeString(input.spotifyClientSecret);
        const spotifyRedirectUri = this.normalizeString(input.spotifyRedirectUri);
        const welcomeChannelId = input.welcomeChannelId ? String(input.welcomeChannelId).trim() : undefined;
        const twitchBroadcasterName = this.normalizeString(input.twitchBroadcasterName);
        const twitchClientId = this.normalizeString(input.twitchClientId);
        const twitchClientSecret = this.normalizeString(input.twitchClientSecret);
        const twitchRedirectUri = this.normalizeString(input.twitchRedirectUri);
        const twitchAccessToken = this.normalizeString(input.twitchAccessToken);
        const twitchRefreshToken = this.normalizeString(input.twitchRefreshToken);
        const twitchAccessTokenExpiresAt = this.normalizeNumber(input.twitchAccessTokenExpiresAt, 1, Number.MAX_SAFE_INTEGER);
        const twitchFollowerRoleName = this.normalizeString(input.twitchFollowerRoleName);
        const twitchSubscriberRoleName = this.normalizeString(input.twitchSubscriberRoleName);

        return {
            systemEnabled: input.systemEnabled === true,
            musicEnabled: input.musicEnabled === true,
            welcomeEnabled: input.welcomeEnabled === true,
            twitchEnabled: input.twitchEnabled === true,
            communityEnabled: input.communityEnabled === true,
            communityMaxChannels: Math.floor(this.normalizeNumber(input.communityMaxChannels, 1, 50) ?? 50),
            communityCategoryName: String(input.communityCategoryName ?? "Community").trim().slice(0, 100) || "Community",
            communityEmptyTimeoutSeconds: Math.floor(this.normalizeNumber(input.communityEmptyTimeoutSeconds, 1, 86400) ?? 60),
            discordToken,
            guildId,
            adminUiUsername,
            adminUiToken,
            adminUiPort,
            musicRoleName,
            musicDefaultVolumePercent,
            musicDebugSearch,
            musicYoutubeSearchLimit,
            audioDbApiKey,
            audioDbApiVersion,
            spotifyClientId,
            spotifyClientSecret,
            spotifyRedirectUri,
            welcomeChannelId: welcomeChannelId && welcomeChannelId.length > 0 ? welcomeChannelId : undefined,
            welcomeRoles: roles,
            twitchBroadcasterName,
            twitchClientId,
            twitchClientSecret,
            twitchRedirectUri,
            twitchAccessToken,
            twitchRefreshToken,
            twitchAccessTokenExpiresAt,
            twitchFollowerRoleName,
            twitchSubscriberRoleName
        };
    }

    private normalizeRoles(value: unknown): WelcomeRoleOption[] {
        return Array.isArray(value)
            ? value
                  .map((role) => ({
                      name: String((role as WelcomeRoleOption)?.name ?? "").trim(),
                      emoji: String((role as WelcomeRoleOption)?.emoji ?? "").trim(),
                      description: String((role as WelcomeRoleOption)?.description ?? "").trim()
                  }))
                  .filter((role) => role.name.length > 0 && role.emoji.length > 0)
            : [];
    }

    private normalizeString(value: unknown): string | undefined {
        const text = String(value ?? "").trim();
        return text.length > 0 ? text : undefined;
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

    private serializeForDb(value: unknown): string {
        const serialized = JSON.stringify(value);
        return serialized === undefined ? "null" : serialized;
    }

    private async ensureDb(): Promise<void> {
        if (this.db) {
            return;
        }

        const dir = path.dirname(this.filePath);
        await import("node:fs/promises").then((fs) => fs.mkdir(dir, { recursive: true }));
        this.db = await open({
            filename: this.filePath,
            driver: sqlite3.Database
        });
    }

    private async migrateRoles(defaultRoles: WelcomeRoleOption[]): Promise<void> {
        const countRow = await this.db!.get<{ count: number }>("SELECT COUNT(*) as count FROM roles");
        if ((countRow?.count ?? 0) > 0) {
            return;
        }

        let rolesToUse: WelcomeRoleOption[] = [];
        const legacyRow = await this.db!.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", "welcomeRoles");
        if (legacyRow?.value) {
            try {
                rolesToUse = this.normalizeRoles(JSON.parse(legacyRow.value));
            } catch {
                rolesToUse = [];
            }
        }

        if (rolesToUse.length === 0) {
            rolesToUse = this.normalizeRoles(defaultRoles);
        }

        if (rolesToUse.length > 0) {
            await this.saveRoles(rolesToUse);
        }
    }

    private async loadRoles(): Promise<WelcomeRoleOption[]> {
        const rows = await this.db!.all<Array<{ name: string; emoji: string; description: string }>>(
            "SELECT name, emoji, description FROM roles ORDER BY sort_order ASC, id ASC"
        );
        return this.normalizeRoles(rows);
    }

    private async saveRoles(roles: WelcomeRoleOption[]): Promise<void> {
        await this.db!.exec("BEGIN TRANSACTION");
        try {
            await this.db!.run("DELETE FROM roles");
            for (let i = 0; i < roles.length; i++) {
                const role = roles[i];
                await this.db!.run(
                    "INSERT INTO roles (name, emoji, description, sort_order) VALUES (?, ?, ?, ?)",
                    role.name,
                    role.emoji,
                    role.description,
                    i
                );
            }
            await this.db!.exec("COMMIT");
        } catch (error) {
            await this.db!.exec("ROLLBACK");
            throw error;
        }
    }
}
