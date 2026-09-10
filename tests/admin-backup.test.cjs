const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { once } = require('node:events');

require.extensions['.ts'] = (module, file) => {
    module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText, file);
};

const { AdminWebServer } = require('../src/admin/AdminWebServer.ts');

function createConfig() {
    return {
        discordToken: 'discord-secret',
        adminUiUsername: 'admin',
        adminUiToken: 'admin-secret',
        adminUiPort: 8787,
        adminLoginMaxFailures: 3,
        adminLoginBlockMinutes: 1,
        musicRoleName: 'Music Bot',
        musicDebugSearch: true,
        welcomeRoles: []
    };
}

test('admin can download and restore a versioned configuration backup', async () => {
    let config = createConfig();
    const server = new AdminWebServer({
        port: 0,
        getAuthConfig: () => ({ username: config.adminUiUsername }),
        verifyAdminPassword: async password => password === 'admin-secret',
        getConfig: () => config,
        getLogs: () => [],
        saveConfig: async next => { config = next; },
        restartBot: async () => {},
        getServerEmojis: async () => [],
        getWelcomeChannels: async () => [],
        getDiscordStatus: () => ({ state: 'offline', message: 'offline', updatedAt: new Date().toISOString() }),
        getDatabaseStatus: async () => ({ schemaVersion: 4, latestMigration: null, appliedMigrations: [] })
    });

    try {
        server.start();
        if (!server.server.listening) await once(server.server, 'listening');
        const address = server.server.address();
        const baseUrl = `http://127.0.0.1:${address.port}`;
        const login = await fetch(`${baseUrl}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', token: 'admin-secret' })
        });
        assert.equal(login.status, 200);
        const cookie = login.headers.get('set-cookie').split(';')[0];

        const download = await fetch(`${baseUrl}/api/config/backup`, { headers: { Cookie: cookie } });
        assert.equal(download.status, 200);
        assert.match(download.headers.get('content-disposition'), /^attachment; filename="discord-bot-config-\d{4}-\d{2}-\d{2}\.json"$/);
        const backup = await download.json();
        assert.equal(backup.format, 'discord-bot-config');
        assert.equal(backup.version, 1);
        assert.equal(backup.config.discordToken, 'discord-secret');
        assert.equal(backup.config.adminUiToken, '');

        backup.config.musicRoleName = 'Restored Music Role';
        const restore = await fetch(`${baseUrl}/api/config/restore`, {
            method: 'POST',
            headers: { Cookie: cookie, 'Content-Type': 'application/json' },
            body: JSON.stringify(backup)
        });
        assert.equal(restore.status, 200);
        assert.equal(config.musicRoleName, 'Restored Music Role');
        assert.equal((await restore.json()).restartRequired, true);

        const invalid = await fetch(`${baseUrl}/api/config/restore`, {
            method: 'POST',
            headers: { Cookie: cookie, 'Content-Type': 'application/json' },
            body: JSON.stringify({ format: 'unknown', version: 1, config: backup.config })
        });
        assert.equal(invalid.status, 400);
    } finally {
        await server.stop();
    }
});

test('login failure limit and block duration come from admin configuration', async () => {
    const config = createConfig();
    const server = new AdminWebServer({
        port: 0,
        getAuthConfig: () => ({ username: config.adminUiUsername }),
        verifyAdminPassword: async password => password === 'admin-secret',
        getConfig: () => config,
        getLogs: () => [], saveConfig: async () => {}, restartBot: async () => {},
        getServerEmojis: async () => [], getWelcomeChannels: async () => [],
        getDiscordStatus: () => ({ state: 'offline', message: 'offline', updatedAt: new Date().toISOString() }),
        getDatabaseStatus: async () => ({ schemaVersion: 4, latestMigration: null, appliedMigrations: [] })
    });

    try {
        server.start();
        if (!server.server.listening) await once(server.server, 'listening');
        const address = server.server.address();
        const url = `http://127.0.0.1:${address.port}/api/login`;
        const attempt = token => fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', token })
        });

        assert.equal((await attempt('wrong')).status, 401);
        assert.equal((await attempt('wrong')).status, 401);
        const blocked = await attempt('wrong');
        assert.equal(blocked.status, 429);
        assert.equal(blocked.headers.get('retry-after'), '60');
        assert.equal((await attempt('admin-secret')).status, 429);
    } finally {
        await server.stop();
    }
});