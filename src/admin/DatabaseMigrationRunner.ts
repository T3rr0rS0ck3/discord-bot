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
    },
    {
        version: 3,
        id: "community-name-voting-v1",
        apply: async (db) => {
            await db.exec(`
                CREATE TABLE IF NOT EXISTS community_name_voting_rounds (
                    guild_id TEXT PRIMARY KEY,
                    channel_id TEXT,
                    message_id TEXT,
                    starts_at INTEGER NOT NULL,
                    ends_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS community_name_suggestions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    guild_id TEXT NOT NULL,
                    name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
                    suggested_by TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    UNIQUE(guild_id, name COLLATE NOCASE)
                );
                CREATE TABLE IF NOT EXISTS community_name_votes (
                    guild_id TEXT NOT NULL,
                    suggestion_id INTEGER NOT NULL,
                    user_id TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    PRIMARY KEY(guild_id, suggestion_id, user_id),
                    FOREIGN KEY(suggestion_id) REFERENCES community_name_suggestions(id) ON DELETE CASCADE
                );
            `);
        }
    },
    {
        version: 4,
        id: "community-name-voting-candidates-v1",
        apply: async (db) => {
            await db.exec(`
                CREATE TABLE IF NOT EXISTS community_name_voting_candidates (
                    guild_id TEXT NOT NULL,
                    suggestion_id INTEGER NOT NULL,
                    position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 4),
                    PRIMARY KEY(guild_id, suggestion_id),
                    UNIQUE(guild_id, position),
                    FOREIGN KEY(suggestion_id) REFERENCES community_name_suggestions(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS community_name_voting_messages (
                    guild_id TEXT PRIMARY KEY,
                    channel_id TEXT NOT NULL,
                    message_id TEXT NOT NULL
                );
                DELETE FROM community_name_votes
                WHERE rowid NOT IN (
                    SELECT MAX(rowid) FROM community_name_votes GROUP BY guild_id, user_id
                );
                CREATE UNIQUE INDEX IF NOT EXISTS community_name_votes_one_per_user
                    ON community_name_votes(guild_id, user_id);
            `);
        }
    },
    {
        version: 5,
        id: "twitch-member-linking-v1",
        apply: async (db) => {
            await db.exec(`
                CREATE TABLE IF NOT EXISTS twitch_member_links (
                    guild_id TEXT NOT NULL,
                    discord_user_id TEXT NOT NULL,
                    twitch_user_id TEXT NOT NULL,
                    twitch_login TEXT NOT NULL,
                    twitch_display_name TEXT NOT NULL,
                    linked_at INTEGER NOT NULL,
                    PRIMARY KEY(guild_id, discord_user_id),
                    UNIQUE(guild_id, twitch_user_id)
                );
                CREATE TABLE IF NOT EXISTS twitch_member_oauth_states (
                    state TEXT PRIMARY KEY,
                    guild_id TEXT NOT NULL,
                    discord_user_id TEXT NOT NULL,
                    expires_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS twitch_link_panels (
                    guild_id TEXT PRIMARY KEY,
                    channel_id TEXT NOT NULL,
                    message_id TEXT NOT NULL
                );
            `);
        }
    },
    {
        version: 6,
        id: "remove-spotify-v1",
        apply: async (db) => {
            await db.exec(`
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                DELETE FROM settings
                WHERE key IN ('spotifyClientId', 'spotifyClientSecret', 'spotifyRedirectUri');
                DROP TABLE IF EXISTS spotify_tokens;
            `);
        }
    },
    {
        version: 7,
        id: "twitch-role-sync-status-v1",
        apply: async (db) => {
            await db.exec(`
                CREATE TABLE IF NOT EXISTS twitch_role_sync_status (
                    guild_id TEXT PRIMARY KEY,
                    last_attempt_at INTEGER NOT NULL,
                    last_successful_at INTEGER,
                    last_error TEXT,
                    follower_changes INTEGER NOT NULL DEFAULT 0,
                    subscriber_changes INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS twitch_role_change_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    guild_id TEXT NOT NULL,
                    discord_user_id TEXT NOT NULL,
                    twitch_user_id TEXT NOT NULL,
                    role_type TEXT NOT NULL CHECK(role_type IN ('follower', 'subscriber')),
                    action TEXT NOT NULL CHECK(action IN ('added', 'removed')),
                    created_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS twitch_role_change_log_guild_created
                    ON twitch_role_change_log(guild_id, created_at DESC);
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