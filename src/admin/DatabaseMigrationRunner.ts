import type { Database } from "sqlite";
import { communityChannelNamesSeedSql } from "./migrations/communityChannelNames";

export type DatabaseStatus = {
    schemaVersion: number;
    latestMigration: string | null;
    appliedMigrations: string[];
};

type Migration = {
    version: number;
    id: string;
    apply: (db: Database) => Promise<void>;
};

const migrations: Migration[] = [
    {
        version: 1,
        id: "community-names-v1",
        apply: async (db) => {
            await db.exec(`
                CREATE TABLE IF NOT EXISTS community_channel_names (
                    name TEXT PRIMARY KEY CHECK(length(name) BETWEEN 1 AND 100)
                );
            `);
            await db.exec(communityChannelNamesSeedSql);
        }
    },
    {
        version: 2,
        id: "community-state-v1",
        apply: async (db) => {
            await db.exec(`
                CREATE TABLE IF NOT EXISTS community_state (
                    guild_id TEXT PRIMARY KEY,
                    category_id TEXT,
                    entry_id TEXT,
                    temporary_ids TEXT NOT NULL
                );
            `);
        }
    }
];

export class DatabaseMigrationRunner {
    public constructor(private readonly db: Database) {}

    public async run(): Promise<void> {
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY);
            CREATE TABLE IF NOT EXISTS schema_version (
                id INTEGER PRIMARY KEY CHECK(id = 1),
                version INTEGER NOT NULL
            );
        `);

        await this.db.exec("BEGIN IMMEDIATE");
        try {
            for (const migration of migrations) {
                const applied = await this.db.get(
                    "SELECT id FROM schema_migrations WHERE id = ?",
                    migration.id
                );
                if (applied) continue;

                await migration.apply(this.db);
                await this.db.run("INSERT INTO schema_migrations (id) VALUES (?)", migration.id);
            }

            const status = await this.getStatus();
            await this.db.run(
                "INSERT INTO schema_version (id, version) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET version = excluded.version",
                status.schemaVersion
            );
            await this.db.exec("COMMIT");
        } catch (error) {
            await this.db.exec("ROLLBACK");
            throw error;
        }
    }

    public async getStatus(): Promise<DatabaseStatus> {
        const rows = await this.db.all<Array<{ id: string }>>(
            "SELECT id FROM schema_migrations ORDER BY id"
        );
        const appliedMigrations = rows.map(row => row.id);
        const schemaVersion = appliedMigrations.reduce((version, id) => {
            const migration = migrations.find(item => item.id === id);
            return migration ? Math.max(version, migration.version) : version;
        }, 0);
        const latestMigration = migrations
            .filter(migration => appliedMigrations.includes(migration.id))
            .at(-1)?.id ?? null;

        return { schemaVersion, latestMigration, appliedMigrations };
    }
}