const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(sourceFile, dependencies = {}) {
    const sourcePath = path.resolve(sourceFile);
    const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
        fileName: sourcePath,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, inlineSourceMap: true, inlineSources: true }
    }).outputText;
    const exports = {};
    vm.runInNewContext(output, {
        exports,
        console,
        require: name => dependencies[name] ?? require(name)
    }, { filename: sourcePath });
    return exports;
}

test('runtime status stores Unicode messages and replaces the current snapshot', () => {
    const { RuntimeStatusStore } = load('src/services/RuntimeStatusStore.ts');
    const store = new RuntimeStatusStore();
    assert.equal(store.get().state, 'offline');
    const status = { state: 'online', message: 'Grüße: ÄÖÜß / 🎵', updatedAt: '2026-09-11T12:00:00.000Z' };
    store.set(status);
    assert.equal(store.get(), status);
});

test('music module wires services, lifecycle, role provisioning and interaction prefixes', async () => {
    const playbackInstances = [];
    class Playback {
        constructor(audio, options) { this.audio = audio; this.options = options; playbackInstances.push(this); }
        shutdown() { this.stopped = true; }
        async handleButtonInteraction(value) { this.button = value; return true; }
        async handleStringSelectInteraction(value) { this.select = value; return true; }
    }
    class Audio { constructor(options) { this.options = options; } }
    class MusicCommand { constructor(playback, audio) { this.playback = playback; this.audio = audio; } }
    const ensured = [];
    const { MusicBotModule } = load('src/modules/MusicBotModule.ts', {
        '../commands/music/MusicCommand': { MusicCommand },
        '../services/MusicPlaybackService': { MusicPlaybackService: Playback },
        '../services/TheAudioDbService': { TheAudioDbService: Audio },
        '../services/RoleService': { RoleService: { ensureRole: async (...args) => { ensured.push(args); return {}; } } }
    });
    const options = { guildId: 'guild', musicRoleName: 'Musik ÄÖÜ', musicPlayback: { audioDbApiKey: 'key', audioDbApiVersion: 'v1' } };
    const module = new MusicBotModule(options);
    assert.equal(module.getCommands()[0] instanceof MusicCommand, true);
    assert.deepEqual(Array.from(playbackInstances[0].options.allowedRoleNames), ['Musik ÄÖÜ']);
    module.initialize();
    const guild = { id: 'guild' };
    await module.onReady({ guilds: { cache: new Map([['guild', guild]]), fetch: async () => { throw new Error('unused'); } } });
    assert.equal(ensured[0][0], guild);
    assert.equal(await module.handleButtonInteraction('other', {}), false);
    assert.equal(await module.handleButtonInteraction('music:skip', { id: 'button' }), true);
    assert.equal(await module.handleStringSelectInteraction('other', {}), false);
    assert.equal(await module.handleStringSelectInteraction('music:volume', { id: 'select' }), true);
    await module.shutdown();
    assert.equal(playbackInstances[0].stopped, true);

    const withoutGuild = new MusicBotModule({ ...options, guildId: undefined });
    await withoutGuild.onReady({});
});

test('system module exposes the aggregate system command', () => {
    class SystemCommand {}
    const { SystemModule } = load('src/modules/SystemModule.ts', { '../commands/system/SystemCommand': { SystemCommand } });
    const module = new SystemModule();
    assert.equal(module.name, 'system');
    assert.equal(module.getCommands()[0] instanceof SystemCommand, true);
});