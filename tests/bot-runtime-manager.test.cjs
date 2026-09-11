const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

class CommunityModule {
    constructor() { this.name = 'community'; }
    async deleteManagedChannel(id) { this.deleted = id; }
}
class TwitchRoleModule {
    constructor() { this.name = 'twitch'; }
    async syncNow() { return this.result; }
}
class DiscordBot {
    static instances = [];
    constructor(options) { this.options = options; DiscordBot.instances.push(this); }
    async start() { this.started = true; }
    async stop() { this.stopped = true; }
    getReadyClient() { return this.client; }
    getStatus() { return this.status ?? { state: 'online', message: 'Grüße', updatedAt: 'now' }; }
}
const factory = { modules: [], lastOptions: null, create(options) { this.lastOptions = options; return this.modules; } };

const sourcePath = path.resolve('src/bot/BotRuntimeManager.ts');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    fileName: sourcePath,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, inlineSourceMap: true, inlineSources: true }
}).outputText;
const exportsObject = {};
vm.runInNewContext(output, {
    exports: exportsObject, console, setTimeout, clearTimeout,
    require: name => ({
        'discord.js': { ChannelType: { GuildVoice: 2, GuildStageVoice: 13 } },
        '../modules/BotModuleFactory': { BotModuleFactory: factory },
        '../modules/CommunityModule': { CommunityModule },
        '../modules/TwitchRoleModule': { TwitchRoleModule },
        './DiscordBot': { DiscordBot }
    })[name] ?? require(name)
}, { filename: sourcePath });
const { BotRuntimeManager } = exportsObject;

function config(overrides = {}) {
    return {
        discordToken: 'token', guildId: 'guild', adminUiToken: 'secret',
        systemEnabled: true, musicEnabled: true, welcomeEnabled: true, twitchEnabled: true, communityEnabled: true, communityVotingEnabled: true,
        communityCategoryName: 'Community ÄÖÜ', communityEmptyTimeoutSeconds: 60, communityMaxChannels: 10,
        communityVotingChannelName: 'abstimmung', communityVotingDurationHours: 168,
        musicRoleName: 'Musik', musicDefaultVolumePercent: 50, musicDebugSearch: false, musicYoutubeSearchLimit: 25,
        audioDbApiKey: '', audioDbApiVersion: 'v1', welcomeChannelId: 'welcome', welcomeTitle: 'Grüße',
        welcomeReactionPrompt: 'Wähle', welcomeReactionInstructions: 'Klicke', welcomeRoles: [],
        twitchBroadcasterName: 'jörg', twitchClientId: 'id', twitchClientSecret: 'secret', twitchRedirectUri: 'https://example.test/cb',
        twitchAccessToken: 'access', twitchRefreshToken: 'refresh', twitchAccessTokenExpiresAt: 123,
        twitchFollowerRoleName: 'Follower', twitchSubscriberRoleName: 'Subscriber', twitchLinkChannelName: 'twitch-link',
        twitchLinkPanelTitle: 'Verbinden', twitchLinkPanelMessage: 'Grüße', ...overrides
    };
}

function fixture(overrides = {}) {
    const saved = [], statuses = [];
    const state = overrides.state ?? { categoryId: 'category', entryId: 'entry', temporaryIds: ['managed'] };
    const store = new Proxy({
        save: async value => saved.push(value), getCommunityState: async () => state, getCommunityChannelNames: async () => [],
        saveCommunityState: async () => {}
    }, { get(target, name) { return target[name] ?? (async () => undefined); } });
    const statusStore = { get: () => ({ state: 'offline', message: 'offline', updatedAt: 'old' }), set: value => statuses.push(value) };
    return { manager: new BotRuntimeManager(config(overrides.config), store, statusStore), store, saved, statuses };
}

test('runtime manager exposes config, status fallbacks and community channel state', async () => {
    const f = fixture();
    assert.equal(f.manager.getConfig().guildId, 'guild');
    assert.equal(f.manager.getReadyClient(), undefined);
    assert.equal(f.manager.getStatus().state, 'offline');
    const disconnected = await f.manager.getCommunityStatus();
    assert.equal(disconnected.connected, false);
    assert.equal(disconnected.category.exists, false);

    const channels = new Map([
        ['category', { id: 'category', name: 'Community ÄÖÜ', type: 4 }],
        ['entry', { id: 'entry', name: 'Entry', type: 2, parentId: 'category', members: new Map() }],
        ['managed', { id: 'managed', name: 'Äther', type: 2, parentId: 'category', members: new Map([['u', {}]]) }],
        ['stage', { id: 'stage', name: 'Bühne', type: 13, parentId: 'category', members: new Map() }],
        ['other', { id: 'other', name: 'Andere', type: 2, parentId: 'elsewhere', members: new Map() }]
    ]);
    f.manager.bot = new DiscordBot({});
    f.manager.bot.client = { guilds: { cache: new Map([['guild', { channels: { cache: channels } }]]), fetch: async () => null } };
    const connected = await f.manager.getCommunityStatus();
    assert.equal(connected.connected, true);
    assert.deepEqual(Array.from(connected.voiceChannels, item => item.name), ['Äther', 'Bühne']);
    assert.equal(connected.voiceChannels[0].isManaged, true);

    const noGuild = fixture({ config: { guildId: '' } });
    assert.equal((await noGuild.manager.getCommunityStatus()).configured, false);
});

test('runtime manager starts modules, routes buttons and stops cleanly', async () => {
    const calls = [];
    const first = { name: 'first', initialize: async () => calls.push('init-1'), getCommands: () => ['a'], onReady: async () => calls.push('ready-1'), handleButtonInteraction: async () => false, shutdown: async () => calls.push('stop-1') };
    const second = { name: 'second', initialize: async () => calls.push('init-2'), getCommands: () => ['b'], onReady: async () => calls.push('ready-2'), handleButtonInteraction: async () => true, shutdown: async () => calls.push('stop-2') };
    factory.modules = [first, second];
    const f = fixture(); await f.manager.start();
    const bot = DiscordBot.instances.at(-1);
    assert.equal(bot.started, true);
    assert.deepEqual(Array.from(bot.options.commands), ['a', 'b']);
    await bot.options.onReady({});
    assert.equal(await bot.options.buttonHandler('x', {}), true);
    bot.options.onStatusChange({ state: 'online' });
    assert.equal(f.statuses.length, 1);
    await f.manager.restart();
    assert.ok(calls.includes('stop-1'));
    await f.manager.stop();
    assert.equal(f.manager.modules.length, 0);

    factory.modules = [];
    const missing = fixture({ config: { discordToken: '' } });
    await missing.manager.start();
    assert.equal(missing.manager.bot, undefined);
});

test('runtime manager delegates community and Twitch operations and saves sanitized config', async () => {
    const community = new CommunityModule();
    const twitch = new TwitchRoleModule(); twitch.result = { successful: true, followerChanges: 1 };
    const applied = [];
    community.applyRuntimeConfig = async (...args) => applied.push(args);
    twitch.applyRuntimeConfig = async (...args) => applied.push(args);
    const f = fixture(); f.manager.modules = [community, twitch];
    f.manager.bot = new DiscordBot({}); f.manager.bot.client = { guilds: { cache: new Map() } };
    await f.manager.deleteCommunityChannel('123456789012345678');
    assert.equal(community.deleted, '123456789012345678');
    assert.equal((await f.manager.syncTwitchRoles()).successful, true);
    await f.manager.saveConfig(config({ adminUiToken: 'do-not-keep', welcomeTitle: 'Grüße / <>&' }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.manager.getConfig().adminUiToken, '');
    assert.equal(f.saved.length, 1);
    assert.equal(applied.length, 2);

    const empty = fixture();
    await assert.rejects(empty.manager.deleteCommunityChannel('1'), /nicht aktiv/);
    await assert.rejects(empty.manager.syncTwitchRoles(), /nicht aktiv/);
    twitch.result = undefined; empty.manager.modules = [twitch];
    await assert.rejects(empty.manager.syncTwitchRoles(), /Discord-Start/);
});

test('factory options forward configuration and refreshed Twitch tokens', async () => {
    factory.modules = [];
    const f = fixture();
    await f.manager.start();
    assert.equal(factory.lastOptions.communityCategoryName, 'Community ÄÖÜ');
    assert.deepEqual(Array.from(factory.lastOptions.musicPlayback.allowedRoleNames), ['Musik']);
    await factory.lastOptions.twitchRole.onTokensUpdated({ accessToken: 'neu-äöü', refreshToken: 'refresh-neu', accessTokenExpiresAt: 999 });
    assert.equal(f.manager.getConfig().twitchAccessToken, 'neu-äöü');
    assert.equal(f.saved.at(-1).twitchAccessToken, 'neu-äöü');
});