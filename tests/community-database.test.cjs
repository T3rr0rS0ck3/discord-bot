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
        assert.equal((await store.db.get('SELECT COUNT(*) AS count FROM schema_migrations')).count, 4);
        assert.deepEqual(await store.getDatabaseStatus(), {
            schemaVersion: 4,
            latestMigration: 'community-name-voting-candidates-v1',
            appliedMigrations: ['community-name-voting-candidates-v1', 'community-name-voting-v1', 'community-names-v1', 'community-state-v1']
        });
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
