const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

require.extensions['.ts'] = (module, file) => {
    module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText, file);
};

class EmbedBuilder {
    constructor() { this.data = {}; }
    setColor(value) { this.data.color = value; return this; }
    setTitle(value) { this.data.title = value; return this; }
    setDescription(value) { this.data.description = value; return this; }
    setThumbnail(value) { this.data.thumbnail = value; return this; }
    setTimestamp(value) { this.data.timestamp = value; return this; }
}
class AttachmentBuilder { constructor(filePath, options) { this.filePath = filePath; this.options = options; } }

function load() {
    const sourcePath = path.resolve('src/services/AchievementService.ts');
    const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
        fileName: sourcePath,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText;
    const exports = {};
    vm.runInNewContext(output, {
        exports, console, setTimeout, clearTimeout,
        require: name => name === 'discord.js'
            ? { AttachmentBuilder, EmbedBuilder }
            : name === '../types/Achievement'
                ? require('../src/types/Achievement.ts')
                : require(name)
    }, { filename: sourcePath });
    return exports.AchievementService;
}

function fixture(mode = 'dm', options = {}) {
    const delivered = [], rescheduled = [], dm = [], channel = [];
    let pending = options.pending ?? [
        { id: 1, guildId: 'guild-a', userId: 'user-a', achievementId: 'command-user-bronze', attempts: 0 },
        { id: 2, guildId: 'guild-a', userId: 'user-a', achievementId: 'command-user-silver', attempts: 0 }
    ];
    const store = {
        recordAchievementProgress: async (...args) => { store.progressArgs = args; return options.recordResult ?? { progress: 1, unlocked: [] }; },
        recordAchievementFact: async (...args) => { store.factArgs = args; return { progress: 1, unlocked: [] }; },
        getAchievementUserState: async () => ({ progress: [], unlocks: [] }),
        getPendingAchievementNotifications: async () => pending,
        markAchievementNotificationsDelivered: async ids => delivered.push(ids),
        rescheduleAchievementNotifications: async (...args) => rescheduled.push(args)
    };
    const client = {
        users: { fetch: async userId => ({ send: async payload => { if (options.dmError) throw new Error('dm failed'); dm.push([userId, payload]); } }) },
        channels: { fetch: async () => ({ isTextBased: () => true, send: async payload => channel.push(payload) }) }
    };
    const AchievementService = load();
    const service = new AchievementService(store, guildId => ({ enabled: guildId !== 'disabled', notificationMode: mode, channelId: 'channel-a', ...options.settings }));
    service.attachClient(client);
    return { service, store, delivered, rescheduled, dm, channel, setPending: value => { pending = value; } };
}

test('records progress, facts and maximums only for enabled known series', async () => {
    const f = fixture();
    await f.service.record({ guildId: 'guild-a', userId: 'user', seriesId: 'command-user', amount: 1 });
    assert.equal(f.store.progressArgs[2], 'command-user');
    await f.service.recordMaximum({ guildId: 'guild-a', userId: 'user', seriesId: 'queue-builder', value: 9 });
    assert.equal(f.store.progressArgs[4].maximum, 9);
    await f.service.recordFact({ guildId: 'guild-a', userId: 'user', seriesId: 'module-explorer', factKey: 'music' });
    assert.equal(f.store.factArgs[3], 'music');
    f.store.progressArgs = undefined;
    const disabled = await f.service.record({ guildId: 'disabled', userId: 'user', seriesId: 'command-user' });
    assert.equal(disabled.progress, 0);
    assert.equal(disabled.unlocked.length, 0);
    assert.equal(f.store.progressArgs, undefined);
    await f.service.shutdown();
});

test('bundles notifications per user and supports silent, dm, channel and both', async () => {
    for (const mode of ['silent', 'dm', 'channel', 'both']) {
        const f = fixture(mode);
        await f.service.flushPending(1000);
        assert.equal(JSON.stringify(f.delivered), '[[1,2]]');
        assert.equal(f.dm.length, mode === 'dm' || mode === 'both' ? 1 : 0);
        assert.equal(f.channel.length, mode === 'channel' || mode === 'both' ? 1 : 0);
        if (f.dm[0]) assert.match(f.dm[0][1].embeds[0].data.title, /2 Achievements/);
        await f.service.shutdown();
    }
});

test('separates guild and user groups and reschedules failed delivery', async () => {
    const f = fixture('dm', { dmError: true, pending: [
        { id: 1, guildId: 'guild-a', userId: 'user-a', achievementId: 'command-user-bronze', attempts: 0 },
        { id: 2, guildId: 'guild-b', userId: 'user-a', achievementId: 'command-user-bronze', attempts: 0 },
        { id: 3, guildId: 'guild-a', userId: 'user-b', achievementId: 'command-user-bronze', attempts: 0 }
    ] });
    await f.service.flushPending(1000);
    assert.equal(f.rescheduled.length, 3);
    assert.deepEqual(f.rescheduled.map(item => item[0][0]).sort(), [1, 2, 3]);
    assert.equal(f.delivered.length, 0);
    f.setPending([]);
    await f.service.shutdown();
});

test('honors disabled categories, hidden settings and dynamic gold targets', async () => {
    const disabledMusic = fixture('silent', { settings: { enabledCategories: new Set(['general']) } });
    assert.equal((await disabledMusic.service.record({ guildId: 'guild-a', userId: 'user', seriesId: 'dj' })).progress, 0);
    const hidden = fixture('silent', { settings: { hiddenEnabled: false } });
    assert.equal((await hidden.service.record({ guildId: 'guild-a', userId: 'user', seriesId: 'night-owl' })).progress, 0);
    const dynamic = fixture('silent', { settings: { activeModuleCount: 3, welcomeRoleCount: 4 } });
    await dynamic.service.recordFact({ guildId: 'guild-a', userId: 'user', seriesId: 'module-explorer', factKey: 'music' });
    assert.equal(dynamic.store.factArgs[4][2].target, 3);
    await dynamic.service.recordFact({ guildId: 'guild-a', userId: 'user', seriesId: 'welcome-role', factKey: 'role' });
    assert.equal(dynamic.store.factArgs[4][2].target, 4);
    disabledMusic.setPending([]); hidden.setPending([]); dynamic.setPending([]);
    await Promise.all([disabledMusic.service.shutdown(), hidden.service.shutdown(), dynamic.service.shutdown()]);
});
