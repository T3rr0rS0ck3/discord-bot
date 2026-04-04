import path from "node:path";
import sqlite3 from "sqlite3";
import { open, type Database } from "sqlite";
import type { WelcomeRoleOption } from "../types/Discord";

export type AdminConfig = {
    discordToken: string;
    guildId?: string;
    adminUiUsername: string;
    adminUiToken: string;
    adminUiPort: number;
    musicRoleName: string;
    musicDefaultVolumePercent?: number;
    musicDebugSearch: boolean;
    musicYoutubeSearchLimit?: number;
    spotifyClientId?: string;
    spotifyClientSecret?: string;
    spotifyRedirectUri?: string;
    welcomeChannelId?: string;
    welcomeRoles: WelcomeRoleOption[];
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

        for (const [key, value] of Object.entries(defaults).filter(([key]) => key !== "welcomeRoles")) {
            await this.db!.run(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                key,
                JSON.stringify(value)
            );
        }

        await this.migrateRoles(defaults.welcomeRoles);
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

    public async save(config: AdminConfig): Promise<void> {
        await this.ensureDb();
        const normalized = this.normalize(config);

        for (const [key, value] of Object.entries(normalized).filter(([key]) => key !== "welcomeRoles")) {
            await this.db!.run(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                key,
                JSON.stringify(value)
            );
        }

        await this.db!.run("DELETE FROM settings WHERE key = ?", "welcomeRoles");
        await this.saveRoles(normalized.welcomeRoles);
    }

    private normalize(input: Partial<AdminConfig>): AdminConfig {
        const roles = this.normalizeRoles(input.welcomeRoles);

        const discordToken = String(input.discordToken ?? "").trim();
        const guildId = this.normalizeString(input.guildId);
        const adminUiUsername = String(input.adminUiUsername ?? "admin").trim() || "admin";
        const adminUiToken = String(input.adminUiToken ?? "admin").trim() || "admin";
        const adminUiPort = this.normalizeNumber(input.adminUiPort, 1, 65535) ?? 8787;
        const musicRoleName = String(input.musicRoleName ?? "Music Bot").trim() || "Music Bot";
        const musicDefaultVolumePercent = this.normalizeNumber(input.musicDefaultVolumePercent, 0, 100);
        const musicYoutubeSearchLimit = this.normalizeNumber(input.musicYoutubeSearchLimit, 1, 200);
        const musicDebugSearch = input.musicDebugSearch === undefined ? true : Boolean(input.musicDebugSearch);
        const spotifyClientId = this.normalizeString(input.spotifyClientId);
        const spotifyClientSecret = this.normalizeString(input.spotifyClientSecret);
        const spotifyRedirectUri = this.normalizeString(input.spotifyRedirectUri);
        const welcomeChannelId = input.welcomeChannelId ? String(input.welcomeChannelId).trim() : undefined;

        return {
            discordToken,
            guildId,
            adminUiUsername,
            adminUiToken,
            adminUiPort,
            musicRoleName,
            musicDefaultVolumePercent,
            musicDebugSearch,
            musicYoutubeSearchLimit,
            spotifyClientId,
            spotifyClientSecret,
            spotifyRedirectUri,
            welcomeChannelId: welcomeChannelId && welcomeChannelId.length > 0 ? welcomeChannelId : undefined,
            welcomeRoles: roles
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
