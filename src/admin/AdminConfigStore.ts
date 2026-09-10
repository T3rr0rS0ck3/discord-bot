import path from "node:path";
import sqlite3 from "sqlite3";
import { open, type Database } from "sqlite";
import type { WelcomeRoleOption } from "../types/Discord";
import { AdminPasswordService } from "../services/AdminPasswordService";
import { DatabaseMigrationRunner, type DatabaseStatus } from "./DatabaseMigrationRunner";

export type { DatabaseStatus } from "./DatabaseMigrationRunner";

export type AdminConfig = {
    systemEnabled?: boolean;
    musicEnabled?: boolean;
    welcomeEnabled?: boolean;
    twitchEnabled?: boolean;
    communityEnabled?: boolean;
    communityVotingEnabled?: boolean;
    communityCategoryName?: string;
    communityVotingChannelName?: string;
    communityVotingDurationDays?: number;
    communityEmptyTimeoutSeconds?: number;
    communityMaxChannels?: number;

    discordToken: string;
    guildId?: string;
    adminUiUsername: string;
    adminUiToken: string;
    adminUiPort: number;
    adminLoginMaxFailures?: number;
    adminLoginBlockMinutes?: number;
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

export type CommunityNameCandidate = {
    id: number;
    name: string;
    votes: number;
};

export type CommunityNameVotingRound = {
    startsAt: number;
    endsAt: number;
    candidates: CommunityNameCandidate[];
};

export class AdminConfigStore {
    private readonly filePath: string;
    private db?: Database;
    private migrationRunner?: DatabaseMigrationRunner;

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

        for (const [key, value] of Object.entries(defaults).filter(([key]) => key !== "welcomeRoles" && key !== "adminUiToken")) {
            await this.db!.run(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                key,
                this.serializeForDb(value)
            );
        }

        await this.migrateRoles(defaults.welcomeRoles);
        this.migrationRunner = new DatabaseMigrationRunner(this.db!);
        await this.migrationRunner.run();
        await this.initializeAdminPassword(defaults.adminUiToken);
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
            adminUiToken: "",
            welcomeRoles: roles.length > 0 ? roles : defaults.welcomeRoles
        });
    }

    public async initializeCommunityNames(): Promise<void> {
        await this.ensureDb();
        if (!this.migrationRunner) {
            this.migrationRunner = new DatabaseMigrationRunner(this.db!);
        }
        await this.migrationRunner.run();
    }

    public async getDatabaseStatus(): Promise<DatabaseStatus> {
        await this.ensureDb();
        if (!this.migrationRunner) {
            this.migrationRunner = new DatabaseMigrationRunner(this.db!);
        }
        return this.migrationRunner.getStatus();
    }

    public async getCommunityChannelNames(): Promise<string[]> {
        await this.ensureDb();
        const rows = await this.db!.all<Array<{ name: string }>>("SELECT name FROM community_channel_names ORDER BY name");
        return rows.map(row => row.name);
    }

    public async addCommunityNameSuggestion(guildId: string, name: string, userId: string, now = Date.now()): Promise<void> {
        await this.ensureDb();
        const normalized = name.trim().replace(/\s+/g, " ").slice(0, 100);
        if (!normalized) throw new Error("Der vorgeschlagene Name darf nicht leer sein.");

        const existing = await this.db!.get(
            "SELECT name FROM community_channel_names WHERE name = ? COLLATE NOCASE",
            normalized
        );
        if (existing) throw new Error("Dieser Name ist bereits in der Kanalnamenliste.");

        try {
            await this.db!.run(
                "INSERT INTO community_name_suggestions (guild_id, name, suggested_by, created_at) VALUES (?, ?, ?, ?)",
                guildId,
                normalized,
                userId,
                now
            );
        } catch (error) {
            if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
                throw new Error("Dieser Name wurde bereits vorgeschlagen.");
            }
            throw error;
        }
    }

    public async getCommunityNameSuggestionCount(guildId: string): Promise<number> {
        await this.ensureDb();
        const row = await this.db!.get<{ count: number }>(
            "SELECT COUNT(*) AS count FROM community_name_suggestions WHERE guild_id = ?",
            guildId
        );
        return row?.count ?? 0;
    }

    public async startCommunityNameVotingRound(guildId: string, durationMs: number, now = Date.now()): Promise<CommunityNameVotingRound | undefined> {
        await this.ensureDb();
        await this.db!.exec("BEGIN IMMEDIATE");
        try {
            const existing = await this.db!.get(
                "SELECT guild_id FROM community_name_voting_rounds WHERE guild_id = ?",
                guildId
            );
            if (existing) {
                await this.db!.exec("COMMIT");
                return this.getCommunityNameVotingRound(guildId);
            }

            const suggestions = await this.db!.all<Array<{ id: number }>>(
                "SELECT id FROM community_name_suggestions WHERE guild_id = ? ORDER BY RANDOM() LIMIT 4",
                guildId
            );
            if (suggestions.length < 4) {
                await this.db!.exec("COMMIT");
                return undefined;
            }

            const endsAt = now + Math.max(60_000, durationMs);
            await this.db!.run(
                "INSERT INTO community_name_voting_rounds (guild_id, starts_at, ends_at) VALUES (?, ?, ?)",
                guildId,
                now,
                endsAt
            );
            for (let index = 0; index < suggestions.length; index += 1) {
                await this.db!.run(
                    "INSERT INTO community_name_voting_candidates (guild_id, suggestion_id, position) VALUES (?, ?, ?)",
                    guildId,
                    suggestions[index].id,
                    index + 1
                );
            }
            await this.db!.exec("COMMIT");
            return this.getCommunityNameVotingRound(guildId);
        } catch (error) {
            await this.db!.exec("ROLLBACK");
            throw error;
        }
    }

    public async getCommunityNameVotingRound(guildId: string): Promise<CommunityNameVotingRound | undefined> {
        await this.ensureDb();
        const round = await this.db!.get<{ starts_at: number; ends_at: number }>(
            "SELECT starts_at, ends_at FROM community_name_voting_rounds WHERE guild_id = ?",
            guildId
        );
        if (!round) return undefined;

        const candidates = await this.db!.all<Array<{ id: number; name: string; votes: number }>>(
            `SELECT suggestions.id, suggestions.name, COUNT(votes.user_id) AS votes
             FROM community_name_voting_candidates candidates
             JOIN community_name_suggestions suggestions ON suggestions.id = candidates.suggestion_id
             LEFT JOIN community_name_votes votes
                ON votes.guild_id = candidates.guild_id AND votes.suggestion_id = candidates.suggestion_id
             WHERE candidates.guild_id = ?
             GROUP BY suggestions.id, suggestions.name, candidates.position
             ORDER BY candidates.position`,
            guildId
        );
        return {
            startsAt: round.starts_at,
            endsAt: round.ends_at,
            candidates
        };
    }

    public async voteForCommunityName(guildId: string, suggestionId: number, userId: string, now = Date.now()): Promise<void> {
        await this.ensureDb();
        const candidate = await this.db!.get(
            "SELECT suggestion_id FROM community_name_voting_candidates WHERE guild_id = ? AND suggestion_id = ?",
            guildId,
            suggestionId
        );
        if (!candidate) throw new Error("Dieser Vorschlag gehört nicht zur aktuellen Abstimmung.");

        await this.db!.run(
            `INSERT INTO community_name_votes (guild_id, suggestion_id, user_id, created_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(guild_id, user_id) DO UPDATE SET suggestion_id = excluded.suggestion_id, created_at = excluded.created_at`,
            guildId,
            suggestionId,
            userId,
            now
        );
    }

    public async finishCommunityNameVotingRound(guildId: string, now = Date.now()): Promise<string | undefined> {
        await this.ensureDb();
        const round = await this.getCommunityNameVotingRound(guildId);
        if (!round || round.endsAt > now) return undefined;

        const winner = [...round.candidates].sort((left, right) => right.votes - left.votes || left.id - right.id)[0];
        await this.db!.exec("BEGIN IMMEDIATE");
        try {
            if (winner) {
                await this.db!.run("INSERT OR IGNORE INTO community_channel_names (name) VALUES (?)", winner.name);
            }
            const candidateIds = round.candidates.map(candidate => candidate.id);
            await this.db!.run("DELETE FROM community_name_votes WHERE guild_id = ?", guildId);
            await this.db!.run("DELETE FROM community_name_voting_candidates WHERE guild_id = ?", guildId);
            if (candidateIds.length > 0) {
                const placeholders = candidateIds.map(() => "?").join(", ");
                await this.db!.run(
                    `DELETE FROM community_name_suggestions WHERE id IN (${placeholders})`,
                    ...candidateIds
                );
            }
            await this.db!.run("DELETE FROM community_name_voting_rounds WHERE guild_id = ?", guildId);
            await this.db!.exec("COMMIT");
            return winner?.name;
        } catch (error) {
            await this.db!.exec("ROLLBACK");
            throw error;
        }
    }

    public async getCommunityNameVotingMessage(guildId: string): Promise<{ channelId: string; messageId: string } | undefined> {
        await this.ensureDb();
        const row = await this.db!.get<{ channel_id: string; message_id: string }>(
            "SELECT channel_id, message_id FROM community_name_voting_messages WHERE guild_id = ?",
            guildId
        );
        return row ? { channelId: row.channel_id, messageId: row.message_id } : undefined;
    }

    public async saveCommunityNameVotingMessage(guildId: string, channelId: string, messageId: string): Promise<void> {
        await this.ensureDb();
        await this.db!.run(
            `INSERT INTO community_name_voting_messages (guild_id, channel_id, message_id) VALUES (?, ?, ?)
             ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id, message_id = excluded.message_id`,
            guildId,
            channelId,
            messageId
        );
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

        for (const [key, value] of Object.entries(normalized).filter(([key]) => key !== "welcomeRoles" && key !== "adminUiToken")) {
            await this.db!.run(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                key,
                this.serializeForDb(value)
            );
        }

        await this.db!.run("DELETE FROM settings WHERE key = ?", "welcomeRoles");
        if (config.adminUiToken.trim()) {
            await this.setAdminPassword(config.adminUiToken);
        }
        await this.saveRoles(normalized.welcomeRoles);
    }

    public async verifyAdminPassword(password: string): Promise<boolean> {
        await this.ensureDb();
        const row = await this.db!.get<{ value: string }>(
            "SELECT value FROM settings WHERE key = ?",
            "adminUiPasswordHash"
        );
        if (!row) return false;
        const hash = JSON.parse(row.value);
        return typeof hash === "string" && AdminPasswordService.verify(password, hash);
    }

    public async setAdminPassword(password: string): Promise<void> {
        const normalized = password.trim();
        if (!normalized) throw new Error("Admin Password is required.");
        await this.ensureDb();
        const hash = await AdminPasswordService.hash(normalized);
        await this.db!.run(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            "adminUiPasswordHash",
            JSON.stringify(hash)
        );
        await this.db!.run("DELETE FROM settings WHERE key = ?", "adminUiToken");
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
        const adminUiToken = String(input.adminUiToken ?? "").trim();
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
            communityVotingEnabled: input.communityVotingEnabled === true,
            communityMaxChannels: Math.floor(this.normalizeNumber(input.communityMaxChannels, 1, 50) ?? 50),
            communityCategoryName: String(input.communityCategoryName ?? "Community").trim().slice(0, 100) || "Community",
            communityVotingChannelName: String(input.communityVotingChannelName ?? "kanalnamen-abstimmung").trim().slice(0, 100) || "kanalnamen-abstimmung",
            communityVotingDurationDays: Math.floor(this.normalizeNumber(input.communityVotingDurationDays, 1, 30) ?? 7),
            communityEmptyTimeoutSeconds: Math.floor(this.normalizeNumber(input.communityEmptyTimeoutSeconds, 1, 86400) ?? 60),
            discordToken,
            guildId,
            adminUiUsername,
            adminUiToken,
            adminUiPort,
            adminLoginMaxFailures: Math.floor(this.normalizeNumber(input.adminLoginMaxFailures, 1, 20) ?? 5),
            adminLoginBlockMinutes: Math.floor(this.normalizeNumber(input.adminLoginBlockMinutes, 1, 1440) ?? 15),
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

    private async initializeAdminPassword(defaultPassword?: string): Promise<void> {
        const hashRow = await this.db!.get<{ value: string }>(
            "SELECT value FROM settings WHERE key = ?",
            "adminUiPasswordHash"
        );
        if (hashRow) return;

        const legacyRow = await this.db!.get<{ value: string }>(
            "SELECT value FROM settings WHERE key = ?",
            "adminUiToken"
        );
        let legacyPassword = defaultPassword?.trim() || "admin";
        if (legacyRow?.value) {
            try {
                const parsed = JSON.parse(legacyRow.value);
                if (typeof parsed === "string" && parsed.trim()) legacyPassword = parsed.trim();
            } catch {
                legacyPassword = legacyRow.value.trim() || legacyPassword;
            }
        }
        await this.setAdminPassword(legacyPassword);
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
