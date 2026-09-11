const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, file) => {
    module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText, file);
};
const { AdminConfigStore } = require('../src/admin/AdminConfigStore.ts');

test('fresh SQLite deployment seeds all names once and preserves later changes', async () => {
    const store = new AdminConfigStore(':memory:');
    try {
        await store.initializeCommunityNames();
        const names = await store.getCommunityChannelNames();
        assert.equal(names.length, 10000);
        assert.equal(new Set(names).size, 10000);
        assert.ok(names.includes(names[0]));
        await store.db.run('DELETE FROM community_channel_names WHERE name = ?', names[0]);
        await store.db.run('INSERT INTO community_channel_names (name) VALUES (?)', 'mein-eigener-kanal');
        await store.initializeCommunityNames();
        const updated = await store.getCommunityChannelNames();
        assert.equal(updated.length, 10000);
        assert.ok(updated.includes('mein-eigener-kanal'));
        assert.ok(!updated.includes(names[0]));
        assert.equal((await store.db.get('SELECT COUNT(*) AS count FROM schema_migrations')).count, 7);
        assert.deepEqual(await store.getDatabaseStatus(), {
            schemaVersion: 7,
            latestMigration: 'twitch-role-sync-status-v1',
            appliedMigrations: ['community-name-voting-candidates-v1', 'community-name-voting-v1', 'community-names-v1', 'community-state-v1', 'remove-spotify-v1', 'twitch-member-linking-v1', 'twitch-role-sync-status-v1']
        });
    } finally { await store.db?.close(); }
});

test('community channel names support Unicode CRUD and atomic imports', async () => {
    const store = new AdminConfigStore(':memory:');
    try {
        await store.initializeCommunityNames();
        await store.addCommunityChannelName('  Grüße & Spaß / ÄÖÜß  ');
        assert.ok((await store.getCommunityChannelNames()).includes('Grüße & Spaß / ÄÖÜß'));
        await assert.rejects(store.addCommunityChannelName('grüße & spaß / äöüß'), /bereits vorhanden/);

        await store.renameCommunityChannelName('Grüße & Spaß / ÄÖÜß', 'Café <Test> & Co');
        assert.ok((await store.getCommunityChannelNames()).includes('Café <Test> & Co'));
        await store.renameCommunityChannelName('Café <Test> & Co', 'Café <Test> & Co');
        await assert.rejects(store.renameCommunityChannelName('fehlt', 'Neu'), /nicht gefunden/);
        await store.addCommunityChannelName('Zweiter Name');
        await assert.rejects(store.renameCommunityChannelName('Zweiter Name', 'café <test> & co'), /bereits vorhanden/);
        await assert.rejects(store.renameCommunityChannelName('', 'Neu'), /zwischen 1 und 100/);

        assert.deepEqual(
            await store.replaceCommunityChannelNames(['  Lötstation  ', 'Gaming / Talk', 'Äpfel & Öl']),
            ['Äpfel & Öl', 'Gaming / Talk', 'Lötstation']
        );
        await assert.rejects(store.replaceCommunityChannelNames(['Doppelt', 'doppelt']), /doppelte/);
        await assert.rejects(store.replaceCommunityChannelNames([]), /mindestens einen/);
        await assert.rejects(store.replaceCommunityChannelNames(null), /mindestens einen/);
        await assert.rejects(store.replaceCommunityChannelNames([123]), /zwischen 1 und 100/);
        await assert.rejects(store.replaceCommunityChannelNames(['x'.repeat(101)]), /zwischen 1 und 100/);
        assert.deepEqual(await store.getCommunityChannelNames(), ['Äpfel & Öl', 'Gaming / Talk', 'Lötstation']);

        await assert.rejects(store.deleteCommunityChannelName('Nicht vorhanden'), /nicht gefunden/);
        await store.deleteCommunityChannelName('Gaming / Talk');
        await store.deleteCommunityChannelName('Lötstation');
        await assert.rejects(store.deleteCommunityChannelName('Äpfel & Öl'), /Mindestens ein/);
        await assert.rejects(store.addCommunityChannelName(' '.repeat(5)), /zwischen 1 und 100/);
    } finally { await store.db?.close(); }
});

test('SQLite migration removes legacy Spotify settings and tokens', async () => {
    const store = new AdminConfigStore(':memory:');
    try {
        await store.ensureDb();
        await store.db.exec(`
            CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE spotify_tokens (discord_user_id TEXT PRIMARY KEY, record TEXT NOT NULL, updated_at INTEGER NOT NULL);
            INSERT INTO settings (key, value) VALUES
                ('spotifyClientId', '"legacy-client"'),
                ('spotifyClientSecret', '"legacy-secret"'),
                ('spotifyRedirectUri', '"http://localhost:3000/callback"'),
                ('discordToken', '"keep-me"');
            INSERT INTO spotify_tokens (discord_user_id, record, updated_at) VALUES ('user', '{}', 1);
        `);

        await store.initialize({ welcomeRoles: [] });

        assert.equal(await store.db.get("SELECT value FROM settings WHERE key = 'spotifyClientId'"), undefined);
        assert.equal(await store.db.get("SELECT value FROM settings WHERE key = 'spotifyClientSecret'"), undefined);
        assert.equal(await store.db.get("SELECT value FROM settings WHERE key = 'spotifyRedirectUri'"), undefined);
        assert.equal(JSON.parse((await store.db.get("SELECT value FROM settings WHERE key = 'discordToken'")).value), 'keep-me');
        assert.equal(await store.db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'spotify_tokens'"), undefined);
    } finally { await store.db?.close(); }
});

test('module switches survive SQLite reload with backwards compatible defaults', async () => {
    const store = new AdminConfigStore(':memory:');
    try {
        const defaults = { welcomeRoles: [] };
        const loaded = await store.load(defaults);
        const keys = ['systemEnabled', 'musicEnabled', 'welcomeEnabled', 'twitchEnabled', 'communityEnabled', 'communityVotingEnabled'];
        for (const key of keys) assert.equal(loaded[key], false);
        await store.save({ ...loaded, ...Object.fromEntries(keys.map(key => [key, false])) });
        const disabled = await store.load(defaults);
        for (const key of keys) assert.equal(disabled[key], false);
        await store.save({ ...disabled, musicEnabled: true });
        const enabled = await store.load(defaults);
        assert.equal(enabled.musicEnabled, true);
        assert.equal(enabled.communityEnabled, false);
    } finally { await store.db?.close(); }
});

test('custom welcome copy survives SQLite reload', async () => {
    const store = new AdminConfigStore(':memory:');
    try {
        const loaded = await store.load({ welcomeRoles: [] });
        await store.save({
            ...loaded,
            welcomeTitle: 'Choose your roles',
            welcomeReactionPrompt: 'Pick one or more communities:',
            welcomeReactionInstructions: 'React to join. Remove your reaction to leave.'
        });
        const reloaded = await store.load({ welcomeRoles: [] });
        assert.equal(reloaded.welcomeTitle, 'Choose your roles');
        assert.equal(reloaded.welcomeReactionPrompt, 'Pick one or more communities:');
        assert.equal(reloaded.welcomeReactionInstructions, 'React to join. Remove your reaction to leave.');
        assert.equal(JSON.parse((await store.db.get("SELECT value FROM settings WHERE key = 'welcomeTitle'")).value), 'Choose your roles');
    } finally { await store.db?.close(); }
});

test('Twitch member links, OAuth states and panel location are persisted in SQLite', async () => {
    const store = new AdminConfigStore(':memory:');
    try {
        await store.initialize({ welcomeRoles: [] });
        await store.createTwitchMemberOAuthState('state', 'guild', 'discord-user', 2000);
        assert.deepEqual(await store.consumeTwitchMemberOAuthState('state', 1000), { guildId: 'guild', discordUserId: 'discord-user' });
        assert.equal(await store.consumeTwitchMemberOAuthState('state', 1000), undefined);

        await store.saveTwitchMemberLink({ guildId: 'guild', discordUserId: 'discord-user', twitchUserId: 'twitch-user', twitchLogin: 'streamer', twitchDisplayName: 'Streamer', linkedAt: 1000 });
        assert.deepEqual(await store.getTwitchMemberLinks('guild'), [{ guildId: 'guild', discordUserId: 'discord-user', twitchUserId: 'twitch-user', twitchLogin: 'streamer', twitchDisplayName: 'Streamer', linkedAt: 1000 }]);
        await assert.rejects(
            store.saveTwitchMemberLink({ guildId: 'guild', discordUserId: 'other-user', twitchUserId: 'twitch-user', twitchLogin: 'streamer', twitchDisplayName: 'Streamer', linkedAt: 1001 }),
            /bereits mit einem anderen Discord-Mitglied/
        );

        await store.saveTwitchLinkPanel('guild', 'channel', 'message');
        assert.deepEqual(await store.getTwitchLinkPanel('guild'), { channelId: 'channel', messageId: 'message' });
        assert.equal(await store.deleteTwitchMemberLink('guild', 'discord-user'), true);
        assert.deepEqual(await store.getTwitchMemberLinks('guild'), []);
    } finally { await store.db?.close(); }
});

test('Twitch sync status and role changes are persisted in SQLite', async () => {
    const store = new AdminConfigStore(':memory:');
    try {
        await store.initialize({ welcomeRoles: [] });
        await store.addTwitchRoleChange({ guildId: 'guild', discordUserId: 'discord', twitchUserId: 'twitch', roleType: 'follower', action: 'added', createdAt: 1000 });
        await store.saveTwitchRoleSyncResult({ guildId: 'guild', attemptedAt: 1100, successful: true, followerChanges: 1, subscriberChanges: 0 });
        await store.saveTwitchRoleSyncResult({ guildId: 'guild', attemptedAt: 1200, successful: false, error: 'API unavailable', followerChanges: 0, subscriberChanges: 0 });

        assert.deepEqual(await store.getTwitchRoleSyncStatus('guild'), {
            lastAttemptAt: 1200,
            lastSuccessfulAt: 1100,
            lastError: 'API unavailable',
            followerChanges: 0,
            subscriberChanges: 0,
            changes: [{ id: 1, guildId: 'guild', discordUserId: 'discord', twitchUserId: 'twitch', roleType: 'follower', action: 'added', createdAt: 1000 }]
        });
    } finally { await store.db?.close(); }
});

test('name voting selects four suggestions, keeps one vote per user and removes all candidates', async () => {
    const store = new AdminConfigStore(':memory:');
    try {
        await store.initialize({ welcomeRoles: [] });
        for (const name of ['alpha', 'beta', 'gamma', 'delta', 'epsilon']) {
            await store.addCommunityNameSuggestion('123', name, `user-${name}`, 100);
        }

        const round = await store.startCommunityNameVotingRound('123', 60_000, 1_000);
        assert.equal(round.candidates.length, 4);
        assert.equal(await store.getCommunityNameSuggestionCount('123'), 5);

        await store.voteForCommunityName('123', round.candidates[0].id, 'voter', 2_000);
        await store.voteForCommunityName('123', round.candidates[1].id, 'voter', 3_000);
        const votedRound = await store.getCommunityNameVotingRound('123');
        assert.equal(votedRound.candidates.reduce((sum, candidate) => sum + candidate.votes, 0), 1);
        assert.equal(votedRound.candidates[1].votes, 1);

        const winner = await store.finishCommunityNameVotingRound('123', 62_000);
        assert.equal(winner, votedRound.candidates[1].name);
        assert.equal(await store.getCommunityNameSuggestionCount('123'), 1);
        assert.ok((await store.getCommunityChannelNames()).includes(winner));
        assert.equal(await store.getCommunityNameVotingRound('123'), undefined);

        for (const name of ['Äpfel', 'Öl', 'Straße', 'Café']) {
            await store.addCommunityNameSuggestion('native-poll', name, `user-${name}`, 200);
        }
        const nativePollRound = await store.startCommunityNameVotingRound('native-poll', 60_000, 2_000);
        const discordWinner = nativePollRound.candidates.at(-1);
        assert.equal(
            await store.finishCommunityNameVotingRound('native-poll', 62_000, discordWinner.id),
            discordWinner.name
        );
        assert.ok((await store.getCommunityChannelNames()).includes(discordWinner.name));
    } finally { await store.db?.close(); }
});

test('fresh SQLite deployment creates the default admin login without secrets', async () => {
    const store = new AdminConfigStore(':memory:');
    try {
        const loaded = await store.load({ welcomeRoles: [] });
        assert.equal(loaded.adminUiUsername, 'admin');
        assert.equal(loaded.adminUiToken, '');
        assert.equal(loaded.discordToken, '');
        assert.equal(await store.verifyAdminPassword('admin'), true);
        assert.equal(await store.verifyAdminPassword('wrong'), false);
        const hash = JSON.parse((await store.db.get("SELECT value FROM settings WHERE key = 'adminUiPasswordHash'")).value);
        assert.match(hash, /^scrypt\$v1\$/);
        assert.equal(await store.db.get("SELECT value FROM settings WHERE key = 'adminUiToken'"), undefined);

        await store.save({ ...loaded, adminUiToken: 'new-secret' });
        assert.equal(await store.verifyAdminPassword('admin'), false);
        assert.equal(await store.verifyAdminPassword('new-secret'), true);
    } finally { await store.db?.close(); }
});

test('community channel state survives a SQLite store restart', async () => {
    const filePath = require('node:path').join(require('node:os').tmpdir(), `community-state-${process.pid}.sqlite`);
    let first;
    let second;
    try {
        first = new AdminConfigStore(filePath);
        await first.initialize({ welcomeRoles: [] });
        await first.saveCommunityState('123', {
            categoryId: '456',
            entryId: '789',
            temporaryIds: ['101', '102']
        });
        if (first.db) {
            await first.db.close();
            first.db = undefined;
        }

        second = new AdminConfigStore(filePath);
        assert.deepEqual(await second.getCommunityState('123'), {
            categoryId: '456',
            entryId: '789',
            temporaryIds: ['101', '102']
        });
    } finally {
        if (second?.db) await second.db.close();
        if (first?.db) await first.db.close();
        require('node:fs').rmSync(filePath, { force: true, maxRetries: 5, retryDelay: 50 });
    }
});
