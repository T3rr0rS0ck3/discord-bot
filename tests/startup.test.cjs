const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

async function loadStartup(options = {}) {
    const instances = { stores: [], servers: [], managers: [], signals: {} };
    class Store {
        constructor(file) { this.file = file; instances.stores.push(this); }
        async load(config) { this.defaultConfig = config; return { ...config, adminUiPort: 9999, adminUiUsername: 'admin-äöü' }; }
        async verifyAdminPassword() { return true; }
        async getDatabaseStatus() { return {}; }
        async close() { this.closed = true; }
    }
    class Manager {
        constructor(config) { this.config = config; instances.managers.push(this); }
        getConfig() { return this.config; }
        getReadyClient() { return options.client; }
        getStatus() { return { state: 'online' }; }
        async getCommunityStatus() { return {}; }
        async deleteCommunityChannel(id) { this.deleted = id; }
        async syncTwitchRoles() { return { successful: true }; }
        async saveConfig(value) { this.saved = value; }
        async restart() { this.restarted = true; }
        async start() { this.started = true; }
        async stop() { this.stopped = true; if (options.stopError) throw new Error('stop kaputt äöü'); }
    }
    class Server {
        constructor(config) { this.config = config; instances.servers.push(this); }
        start() { this.started = true; }
        async stop() { this.stopped = true; }
    }
    const fakeFs = { readFile: async () => options.envFile ?? 'DISCORD_TOKEN=file-token\r\nGUILD_ID=file-guild\r\nWELCOME_ROLES=[{"name":"Grüße","emoji":"🎵","description":"ÄÖÜß / Test"}]\r\nVALUE=a=b\r\n# comment\r\ninvalid' };
    const processStub = {
        env: { BOT_DATA_DIR: '  C:/Daten ÄÖÜ  ', DISCORD_TOKEN: 'process-token', ...(options.env ?? {}) },
        cwd: () => 'C:/workspace', exitCode: undefined,
        once: (signal, callback) => { instances.signals[signal] = callback; }
    };
    const sourcePath = path.resolve('src/index.ts');
    const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
        fileName: sourcePath,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, inlineSourceMap: true, inlineSources: true }
    }).outputText;
    const exports = {};
    vm.runInNewContext(output, {
        exports, process: processStub, console,
        setTimeout, clearTimeout,
        require: name => ({
            'node:fs': { promises: fakeFs },
            './admin/AdminConfigStore': { AdminConfigStore: Store },
            './admin/AdminWebServer': { AdminWebServer: Server },
            './bot/BotRuntimeManager': { BotRuntimeManager: Manager },
            './services/RuntimeStatusStore': { RuntimeStatusStore: class {} }
        })[name] ?? require(name)
    }, { filename: sourcePath });
    await new Promise(resolve => setImmediate(resolve));
    return { Startup: exports.Startup, instances, processStub };
}

test('startup merges env values, parses Unicode roles and wires admin callbacks', async () => {
    const { instances } = await loadStartup();
    const store = instances.stores[0], manager = instances.managers[0], server = instances.servers[0];
    assert.match(store.file, /Daten ÄÖÜ/);
    assert.equal(store.defaultConfig.discordToken, 'process-token');
    assert.equal(store.defaultConfig.guildId, 'file-guild');
    assert.equal(store.defaultConfig.welcomeRoles[0].name, 'Grüße');
    assert.equal(store.defaultConfig.welcomeRoles[0].description, 'ÄÖÜß / Test');
    assert.equal(server.started, true);
    assert.equal(manager.started, true);
    assert.equal(server.config.getAuthConfig().username, 'admin-äöü');
    await server.config.restartBot(); assert.equal(manager.restarted, true);
    await server.config.deleteCommunityChannel('123'); assert.equal(manager.deleted, '123');
    await server.config.saveConfig({ welcomeTitle: '<Grüße & Spaß>' }); assert.equal(manager.saved.welcomeTitle, '<Grüße & Spaß>');
});

test('startup helper parsers handle whitespace, malformed values and extra equals signs', async () => {
    const { Startup } = await loadStartup({ envFile: ' A = one=two \nEMPTY=   \n#x\nBROKEN\nNUMBER=12.5' });
    assert.equal(Startup.parseNumber(' 12.5 '), 12.5);
    assert.equal(Startup.parseNumber('NaN'), undefined);
    assert.equal(Startup.parseNumber('   '), undefined);
    assert.equal(Startup.normalizeString('  ÄÖÜß / 🎵  '), 'ÄÖÜß / 🎵');
    assert.equal(Startup.normalizeString('   '), undefined);
    const values = await Startup.readLegacyEnv('ignored');
    assert.equal(values.A, 'one=two');
    assert.equal(values.EMPTY, '');
    assert.equal(Startup.parseWelcomeRoles('{bad'), undefined);
    assert.equal(Startup.parseWelcomeRoles('{"name":"x"}'), undefined);
    assert.equal(Startup.parseWelcomeRoles(undefined), undefined);
    assert.deepEqual(Array.from(Startup.parseWelcomeRoles('[{"name":null,"emoji":null,"description":null}]'), role => [role.name, role.emoji, role.description]), [['', '', '']]);
});

test('startup uses defaults when env file is unavailable or values are blank', async () => {
    const { instances, Startup } = await loadStartup({ envFile: undefined, env: { DISCORD_TOKEN: '   ', BOT_DATA_DIR: '   ', MUSIC_DEBUG_SEARCH: 'false', AUDIODB_API_VERSION: 'v9' } });
    const defaults = instances.stores[0].defaultConfig;
    assert.equal(defaults.discordToken, '');
    assert.equal(defaults.musicDebugSearch, false);
    assert.equal(defaults.audioDbApiVersion, 'v1');
    assert.equal(defaults.adminUiPort, 8787);
    assert.equal(Startup.normalizeString(undefined), undefined);
});

test('startup channel and emoji callbacks sort German labels and shutdown only once', async () => {
    const textChannels = [
        { id: '2', name: 'Öl', isTextBased: () => true, isDMBased: () => false },
        { id: '1', name: 'Äther', isTextBased: () => true, isDMBased: () => false },
        { id: '3', name: 'dm', isTextBased: () => true, isDMBased: () => true }
    ];
    const emojis = [{ name: 'Öl', toString: () => '🛢️' }, { name: 'Äpfel', toString: () => '🍎' }];
    const collection = values => ({ filter: callback => collection(values.filter(callback)), map: callback => values.map(callback) });
    const guild = { channels: { fetch: async () => {}, cache: collection(textChannels) }, emojis: { fetch: async () => {}, cache: collection(emojis) } };
    const client = { guilds: { cache: new Map([['file-guild', guild]]), fetch: async () => guild } };
    const { instances } = await loadStartup({ client });
    const server = instances.servers[0], manager = instances.managers[0], store = instances.stores[0];
    assert.deepEqual(Array.from(await server.config.getWelcomeChannels(), item => item.name), ['#Äther', '#Öl']);
    assert.equal((await server.config.getServerEmojis()).length, 2);
    instances.signals.SIGTERM(); await new Promise(resolve => setImmediate(resolve));
    instances.signals.SIGINT(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(manager.stopped, true); assert.equal(server.stopped, true); assert.equal(store.closed, true);
});