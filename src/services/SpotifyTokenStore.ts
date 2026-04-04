import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import sqlite3 from "sqlite3";
import { open, type Database } from "sqlite";
import type { SpotifyTokenRecord } from "../types/Spotify";

export class SpotifyTokenStore {
    private readonly sqlitePath: string;
    private readonly legacyJsonPath?: string;
    private db?: Database;

    public constructor(sqlitePath: string, legacyJsonPath?: string) {
        this.sqlitePath = sqlitePath;
        this.legacyJsonPath = legacyJsonPath;
    }

    public async get(discordUserId: string): Promise<SpotifyTokenRecord | null> {
        await this.ensureDb();

        const row = await this.db!.get<{ record: string }>(
            "SELECT record FROM spotify_tokens WHERE discord_user_id = ?",
            discordUserId
        );

        if (!row?.record) {
            return null;
        }

        try {
            return JSON.parse(row.record) as SpotifyTokenRecord;
        } catch {
            return null;
        }
    }

    public async set(discordUserId: string, record: SpotifyTokenRecord): Promise<void> {
        await this.ensureDb();
        await this.db!.run(
            `
            INSERT INTO spotify_tokens (discord_user_id, record, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(discord_user_id) DO UPDATE SET
                record = excluded.record,
                updated_at = excluded.updated_at
            `,
            discordUserId,
            JSON.stringify(record),
            Date.now()
        );
    }

    public async delete(discordUserId: string): Promise<boolean> {
        await this.ensureDb();
        const result = await this.db!.run("DELETE FROM spotify_tokens WHERE discord_user_id = ?", discordUserId);
        return (result.changes ?? 0) > 0;
    }

    private async ensureDb(): Promise<void> {
        if (this.db) {
            return;
        }

        await mkdir(dirname(this.sqlitePath), { recursive: true });
        this.db = await open({
            filename: this.sqlitePath,
            driver: sqlite3.Database
        });

        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS spotify_tokens (
                discord_user_id TEXT PRIMARY KEY,
                record TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
        `);

        await this.migrateLegacyJsonIfNeeded();
    }

    private async migrateLegacyJsonIfNeeded(): Promise<void> {
        if (!this.legacyJsonPath) {
            return;
        }

        const countRow = await this.db!.get<{ count: number }>("SELECT COUNT(*) as count FROM spotify_tokens");
        if ((countRow?.count ?? 0) > 0) {
            return;
        }

        let raw: string;
        try {
            raw = await readFile(this.legacyJsonPath, "utf-8");
        } catch {
            return;
        }

        let parsed: Record<string, SpotifyTokenRecord>;
        try {
            parsed = JSON.parse(raw) as Record<string, SpotifyTokenRecord>;
        } catch {
            return;
        }

        const entries = Object.entries(parsed);
        if (entries.length === 0) {
            return;
        }

        await this.db!.exec("BEGIN TRANSACTION");
        try {
            for (const [discordUserId, record] of entries) {
                await this.db!.run(
                    "INSERT OR REPLACE INTO spotify_tokens (discord_user_id, record, updated_at) VALUES (?, ?, ?)",
                    discordUserId,
                    JSON.stringify(record),
                    Date.now()
                );
            }
            await this.db!.exec("COMMIT");
            console.log(`[SpotifyTokenStore] Migrated ${entries.length} token entr${entries.length === 1 ? "y" : "ies"} from JSON to SQLite.`);
        } catch (error) {
            await this.db!.exec("ROLLBACK");
            throw error;
        }
    }
}
