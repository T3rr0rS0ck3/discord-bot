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
        assert.equal((await store.db.get('SELECT COUNT(*) AS count FROM schema_migrations')).count, 1);
    } finally { await store.db?.close(); }
});

test('module switches survive SQLite reload with backwards compatible defaults', async () => {
    const store = new AdminConfigStore(':memory:');
    try {
        const defaults = { welcomeRoles: [] };
        const loaded = await store.load(defaults);
        const keys = ['systemEnabled', 'musicEnabled', 'welcomeEnabled', 'twitchEnabled', 'communityEnabled'];
        for (const key of keys) assert.equal(loaded[key], true);
        await store.save({ ...loaded, ...Object.fromEntries(keys.map(key => [key, false])) });
        const disabled = await store.load(defaults);
        for (const key of keys) assert.equal(disabled[key], false);
        await store.save({ ...disabled, musicEnabled: true });
        const enabled = await store.load(defaults);
        assert.equal(enabled.musicEnabled, true);
        assert.equal(enabled.communityEnabled, false);
    } finally { await store.db?.close(); }
});
