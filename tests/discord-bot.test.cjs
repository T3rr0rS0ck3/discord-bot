const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { EventEmitter } = require('node:events');

class Client extends EventEmitter {
    static instances = [];
    constructor(options) { super(); this.options = options; this.ready = false; this.destroyed = 0; Client.instances.push(this); }
    async login(token) { this.loginToken = token; if (this.loginError) throw this.loginError; }
    destroy() { this.destroyed++; this.ready = false; }
    isReady() { return this.ready; }
}
const discordStub = {
    Client,
    GatewayIntentBits: { Guilds: 1, GuildVoiceStates: 2, GuildMessageReactions: 4 },
    IntentsBitField: { Flags: { GuildVoiceStates: 2, Guilds: 1 } },
    Partials: { Message: 1, Channel: 2, Reaction: 3, User: 4, GuildMember: 5 }
};
const sourcePath = path.resolve('src/bot/DiscordBot.ts');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    fileName: sourcePath,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, inlineSourceMap: true, inlineSources: true }
}).outputText;
const exportsObject = {};
vm.runInNewContext(output, { exports: exportsObject, console, require: name => name === 'discord.js' ? discordStub : require(name) }, { filename: sourcePath });
const { DiscordBot } = exportsObject;

function command(name = 'test', overrides = {}) {
    return { data: { name, toJSON: () => ({ name }) }, execute: async interaction => { interaction.executed = true; }, ...overrides };
}
function interaction(kind, overrides = {}) {
    const calls = [];
    return {
        calls, customId: 'custom-äöü', commandName: 'test', replied: false, deferred: false, responded: false,
        isStringSelectMenu: () => kind === 'select', isModalSubmit: () => kind === 'modal', isRoleSelectMenu: () => kind === 'role',
        isButton: () => kind === 'button', isAutocomplete: () => kind === 'autocomplete', isChatInputCommand: () => kind === 'command',
        reply: async value => { calls.push(['reply', value]); }, followUp: async value => calls.push(['follow', value]), respond: async value => calls.push(['respond', value]),
        ...overrides
    };
}
async function emitAsync(client, event, ...args) {
    for (const listener of client.listeners(event)) await listener(...args);
}

test('discord bot reports login states, readiness and stop lifecycle', async () => {
    const statuses = [];
    const bot = new DiscordBot({ token: 'token-äöü', commands: [command()], onStatusChange: value => statuses.push(value) });
    const client = Client.instances.at(-1);
    await bot.start();
    assert.equal(client.loginToken, 'token-äöü');
    assert.equal(bot.getStatus().state, 'starting');
    assert.equal(bot.getReadyClient(), undefined);
    client.ready = true; assert.equal(bot.getReadyClient(), client);
    await bot.stop(); assert.equal(bot.getStatus().state, 'offline'); assert.equal(client.destroyed, 1);

    const invalid = new DiscordBot({ token: 'bad', commands: [] }); const invalidClient = Client.instances.at(-1); invalidClient.loginError = { code: 'TokenInvalid' };
    await invalid.start(); assert.equal(invalid.getStatus().state, 'token-invalid'); assert.match(invalid.getStatus().message, /Invalid Discord token/); assert.equal(invalidClient.destroyed, 1);
    const numericInvalid = new DiscordBot({ token: 'bad-number', commands: [] }); const numericInvalidClient = Client.instances.at(-1); numericInvalidClient.loginError = { code: 4004 };
    await numericInvalid.start(); assert.equal(numericInvalid.getStatus().state, 'error'); assert.match(numericInvalid.getStatus().message, /4004/); assert.equal(numericInvalidClient.destroyed, 1);
    const failed = new DiscordBot({ token: 'bad', commands: [] }); const failedClient = Client.instances.at(-1); failedClient.loginError = 'offline';
    await failed.start(); assert.equal(failed.getStatus().state, 'error'); assert.match(failed.getStatus().message, /UnknownError/); assert.equal(failedClient.destroyed, 1);
});

test('ready event registers guild and global commands and reports setup failures', async () => {
    const readyCalls = [];
    const bot = new DiscordBot({ token: 't', guildId: 'guild', commands: [command('grüße')], onReady: async () => readyCalls.push('ready') });
    const client = Client.instances.at(-1); const sets = [];
    const readyClient = { user: { tag: 'Böt#1234' }, application: { commands: { set: async (...args) => sets.push(args) } } };
    await emitAsync(client, 'clientReady', readyClient);
    assert.equal(bot.getStatus().state, 'online'); assert.equal(sets.length, 2); assert.equal(sets[0][1], 'guild'); assert.equal(readyCalls.length, 1);

    const global = new DiscordBot({ token: 't', commands: [command()] }); const globalClient = Client.instances.at(-1); const globalSets = [];
    await emitAsync(globalClient, 'clientReady', { user: { tag: 'Global#1' }, application: { commands: { set: async (...args) => globalSets.push(args) } } });
    assert.equal(globalSets.length, 1);
    const broken = new DiscordBot({ token: 't', guildId: 'missing', commands: [command()] }); const brokenClient = Client.instances.at(-1);
    await emitAsync(brokenClient, 'clientReady', { user: { tag: 'Broken#1' }, application: { commands: { set: async () => { throw new Error('no guild'); } } } });
    assert.equal(broken.getStatus().state, 'guild-unreachable');
    const brokenGlobal = new DiscordBot({ token: 't', commands: [] }); const brokenGlobalClient = Client.instances.at(-1);
    await emitAsync(brokenGlobalClient, 'clientReady', { user: { tag: 'BrokenGlobal#1' }, application: { commands: { set: async () => { throw new Error('global failed'); } } } });
    assert.equal(brokenGlobal.getStatus().state, 'error');
});

test('ready event registers commands in every configured guild exactly once', async () => {
    const bot = new DiscordBot({ token: 't', guildIds: ['guild-a', 'guild-b', 'guild-a'], commands: [command('multi')] });
    const client = Client.instances.at(-1); const sets = [];
    await emitAsync(client, 'clientReady', {
        user: { tag: 'Multi#1' },
        application: { commands: { set: async (...args) => sets.push(args) } }
    });

    assert.deepEqual(Array.from(sets, call => call[1] ?? 'global'), ['guild-a', 'guild-b', 'global']);
    assert.equal(bot.getStatus().state, 'online');
});

test('interaction router covers module handlers, fallbacks and failures', async () => {
    const modules = [{
        name: 'module',
        handleStringSelectInteraction: async () => false,
        handleModalSubmitInteraction: async () => false,
        handleRoleSelectInteraction: async () => false
    }];
    const bot = new DiscordBot({ token: 't', commands: [], modules, buttonHandler: async () => false });
    const client = Client.instances.at(-1);
    for (const [kind, text] of [['select', /Auswahl/], ['modal', /Formular/], ['role', /Rollenauswahl/]]) {
        const current = interaction(kind); await emitAsync(client, 'interactionCreate', current); assert.match(current.calls[0][1].content, text);
    }
    const button = interaction('button'); await emitAsync(client, 'interactionCreate', button); assert.equal(button.calls.length, 0);
    const noHandlersBot = new DiscordBot({ token: 't', commands: [], modules: [{ name: 'empty' }] }); const noHandlersClient = Client.instances.at(-1);
    for (const kind of ['select', 'modal', 'role']) {
        const current = interaction(kind); await emitAsync(noHandlersClient, 'interactionCreate', current); assert.equal(current.calls[0][0], 'reply');
    }

    modules[0].handleStringSelectInteraction = async () => { throw new Error('kaputt'); };
    const failed = interaction('select'); await emitAsync(client, 'interactionCreate', failed); assert.match(failed.calls[0][1].content, /nicht verarbeitet/);
    const already = interaction('select', { replied: true }); await emitAsync(client, 'interactionCreate', already); assert.equal(already.calls.length, 0);

    modules[0].handleStringSelectInteraction = async () => true;
    modules[0].handleModalSubmitInteraction = async () => true;
    modules[0].handleRoleSelectInteraction = async () => true;
    for (const kind of ['select', 'modal', 'role']) {
        const handled = interaction(kind); await emitAsync(client, 'interactionCreate', handled); assert.equal(handled.calls.length, 0);
    }

    const buttonErrorBot = new DiscordBot({ token: 't', commands: [], buttonHandler: async () => { throw new Error('button kaputt'); } });
    const buttonErrorClient = Client.instances.at(-1);
    const failedButton = interaction('button'); await emitAsync(buttonErrorClient, 'interactionCreate', failedButton); assert.match(failedButton.calls[0][1].content, /failed/);
    const repliedButton = interaction('button', { replied: true }); await emitAsync(buttonErrorClient, 'interactionCreate', repliedButton); assert.equal(repliedButton.calls.length, 0);
});

test('autocomplete and command routing handle success, missing handlers and errors', async () => {
    const success = command('test', { executeAutocomplete: async value => { value.autocompleted = true; } });
    const failing = command('fail', { execute: async () => { throw new Error('boom'); }, executeAutocomplete: async () => { throw 'nope'; } });
    const bot = new DiscordBot({ token: 't', commands: [success, failing] }); const client = Client.instances.at(-1);
    const auto = interaction('autocomplete'); await emitAsync(client, 'interactionCreate', auto); assert.equal(auto.autocompleted, true);
    const noAuto = interaction('autocomplete', { commandName: 'missing' }); await emitAsync(client, 'interactionCreate', noAuto); assert.equal(noAuto.calls.length, 0);
    const failedAuto = interaction('autocomplete', { commandName: 'fail' }); await emitAsync(client, 'interactionCreate', failedAuto); assert.equal(failedAuto.calls[0][0], 'respond'); assert.equal(failedAuto.calls[0][1].length, 0);
    const executed = interaction('command'); await emitAsync(client, 'interactionCreate', executed); assert.equal(executed.executed, true);
    const missing = interaction('command', { commandName: 'missing' }); await emitAsync(client, 'interactionCreate', missing); assert.equal(missing.calls.length, 0);
    const failed = interaction('command', { commandName: 'fail' }); await emitAsync(client, 'interactionCreate', failed); assert.equal(failed.calls[0][0], 'reply');
    const deferred = interaction('command', { commandName: 'fail', deferred: true }); await emitAsync(client, 'interactionCreate', deferred); assert.equal(deferred.calls[0][0], 'follow');
    await emitAsync(client, 'interactionCreate', interaction('other'));
});

test('reaction handlers fetch partials, ignore bots and route add/remove independently', async () => {
    const calls = [];
    const module = { name: 'welcome', handleMessageReactionAdd: async () => { calls.push('add'); return true; }, handleMessageReactionRemove: async () => { calls.push('remove'); return true; } };
    new DiscordBot({ token: 't', commands: [], modules: [module] }); const client = Client.instances.at(-1);
    const user = { partial: true, bot: false, fetch: async () => { calls.push('user-fetch'); } };
    const reaction = { partial: true, fetch: async () => { calls.push('reaction-fetch'); } };
    await emitAsync(client, 'messageReactionAdd', reaction, user);
    await emitAsync(client, 'messageReactionRemove', reaction, user);
    assert.deepEqual(calls, ['user-fetch', 'reaction-fetch', 'add', 'user-fetch', 'reaction-fetch', 'remove']);
    await emitAsync(client, 'messageReactionAdd', reaction, { partial: false, bot: true });
    const badUser = { partial: true, bot: false, fetch: async () => { throw new Error('gone'); } };
    await emitAsync(client, 'messageReactionAdd', reaction, badUser);
    const badReaction = { partial: true, fetch: async () => { throw new Error('gone'); } };
    await emitAsync(client, 'messageReactionRemove', badReaction, { partial: false, bot: false });

    const failing = { name: 'broken', handleMessageReactionAdd: async () => { throw new Error('add failed'); }, handleMessageReactionRemove: async () => { throw new Error('remove failed'); } };
    new DiscordBot({ token: 't', commands: [], modules: [{ name: 'skip' }, failing] }); const failingClient = Client.instances.at(-1);
    await emitAsync(failingClient, 'messageReactionAdd', { partial: false }, { partial: false, bot: false });
    await emitAsync(failingClient, 'messageReactionRemove', { partial: false }, { partial: false, bot: false });
});