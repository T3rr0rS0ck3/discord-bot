const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const originalTs = Module._extensions['.ts'];
Module._extensions['.ts'] = (module, filename) => {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        fileName: filename,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, inlineSourceMap: true, inlineSources: true }
    }).outputText;
    module._compile(output, filename);
};

const discord = require('discord.js');
const builderMethods = ['setName', 'setDescription', 'setAutocomplete', 'setRequired', 'setMinValue', 'setMaxValue'];
for (const method of builderMethods) discord.SlashCommandBuilder.prototype[method] ??= function () { return this; };

const { MusicCommand } = require('../src/commands/music/MusicCommand.ts');
const wrappers = Object.fromEntries(['Back', 'Pause', 'Play', 'Player', 'Queue', 'Resume', 'Skip', 'Volume'].map(name => [name.toLowerCase(), require(`../src/commands/music/${name}Command.ts`)[`${name}Command`]]));
Module._extensions['.ts'] = originalTs;

function interaction(subcommand, values = {}) {
    const calls = [];
    return {
        calls,
        guildId: values.guildId === undefined ? 'guild-äöü' : values.guildId,
        channelId: 'channel-1',
        member: { roles: [] },
        inCachedGuild: () => values.cached !== false,
        options: {
            getSubcommand: () => subcommand,
            getString: name => values[name] ?? values.query ?? values.source ?? '  Björk – Jóga / Grüße 🎵  ',
            getInteger: () => values.percent ?? 73,
            getFocused: () => values.focused ?? { name: 'query', value: values.input ?? '  Grüße & Spaß  ' }
        },
        reply: async value => calls.push(['reply', value]),
        deferReply: async value => calls.push(['defer', value]),
        editReply: async value => calls.push(['edit', value]),
        deleteReply: async () => calls.push(['delete']),
        fetchReply: async () => ({ id: 'message-1' }),
        respond: async value => calls.push(['respond', value])
    };
}

function playback(overrides = {}) {
    const calls = [];
    return {
        calls,
        hasAccess: () => true,
        enqueue: async (_interaction, source) => { calls.push(['enqueue', source]); return 'queued'; },
        buildPlayerUI: guildId => { calls.push(['ui', guildId]); return { content: 'player' }; },
        registerControllerMessage: async (...args) => calls.push(['register', ...args]),
        getQueueSnapshot: () => ({ current: { sourceLabel: 'Björk – Jóga' }, queue: [{ sourceLabel: 'Grüße 🎵' }], paused: false, volumePercent: 73 }),
        setVolume: (_guildId, percent) => percent,
        pause: () => true,
        resume: () => true,
        skip: async () => true,
        back: async () => true,
        syncPlayerPanel: async guildId => calls.push(['sync', guildId]),
        ...overrides
    };
}

test('music dispatcher handles guards, autocomplete and Unicode play input', async () => {
    const audio = { searchTrackSuggestions: async input => [{ label: `Treffer: ${input}`, value: input }] };
    const service = playback();
    const command = new MusicCommand(service, audio);

    const dm = interaction('play', { cached: false }); await command.execute(dm);
    assert.match(dm.calls[0][1].content, /only be used in a server/);
    const denied = interaction('play'); service.hasAccess = () => false; await command.execute(denied);
    assert.match(denied.calls[0][1].content, /required role/);
    service.hasAccess = () => true;

    const play = interaction('play'); await command.execute(play);
    assert.deepEqual(service.calls[0], ['enqueue', '  Björk – Jóga / Grüße 🎵  ']);
    assert.equal(play.calls.at(-1)[1], 'queued');

    for (const values of [{ focused: { name: 'other', value: 'abc' } }, { input: 'x' }]) {
        const autocomplete = interaction('play', values); await command.executeAutocomplete(autocomplete);
        assert.deepEqual(autocomplete.calls.at(-1), ['respond', []]);
    }
    const autocomplete = interaction('play'); await command.executeAutocomplete(autocomplete);
    assert.equal(autocomplete.calls.at(-1)[1][0].value, 'Grüße & Spaß');
});

test('music dispatcher covers player, queue, controls and failures', async () => {
    const service = playback();
    const command = new MusicCommand(service, { searchTrackSuggestions: async () => [] });
    for (const subcommand of ['player', 'queue', 'volume', 'pause', 'resume', 'skip', 'back', 'unknown']) {
        const current = interaction(subcommand); await command.execute(current);
        assert.ok(current.calls.length > 0, subcommand);
    }
    const queue = interaction('queue'); await command.execute(queue);
    assert.match(queue.calls[0][1].content, /Björk – Jóga/);

    for (const [subcommand, override, message] of [
        ['queue', { getQueueSnapshot: () => null }, /Nothing/], ['volume', { setVolume: () => null }, /No active/],
        ['pause', { pause: () => false }, /Unable/], ['resume', { resume: () => false }, /Unable/],
        ['skip', { skip: async () => false }, /No track/], ['back', { back: async () => false }, /No previous/]
    ]) {
        const failed = interaction(subcommand); await new MusicCommand(playback(override), {}).execute(failed);
        assert.match(String(failed.calls.at(-1)[1].content ?? failed.calls.at(-1)[1]), message);
    }
    const error = interaction('play'); await new MusicCommand(playback({ enqueue: async () => { throw new Error('kaputt äöü'); } }), {}).execute(error);
    assert.equal(error.calls.at(-1)[1], 'kaputt äöü');
});

test('standalone music commands cover server guards, success and failure responses', async () => {
    for (const [name, method] of [['back', 'back'], ['pause', 'pause'], ['resume', 'resume'], ['skip', 'skip'], ['volume', 'setVolume']]) {
        const service = playback();
        const command = new wrappers[name](service);
        const dm = interaction(name, { cached: false }); await command.execute(dm); assert.match(dm.calls[0][1].content, /server/);
        const ok = interaction(name); await command.execute(ok); assert.equal(ok.calls.at(-1)[0], 'delete');
        service[method] = method === 'setVolume' ? () => null : ['back', 'skip'].includes(method) ? async () => false : () => false;
        const failed = interaction(name); await command.execute(failed); assert.equal(failed.calls.at(-1)[0], 'edit');
    }

    const playService = playback(); const play = interaction('play'); await new wrappers.play(playService).execute(play);
    assert.equal(playService.calls[0][1], 'Björk – Jóga / Grüße 🎵');
    const player = interaction('player'); await new wrappers.player(playback()).execute(player); assert.equal(player.calls[0][0], 'reply');
    const emptyQueue = interaction('queue'); await new wrappers.queue(playback({ getQueueSnapshot: () => null })).execute(emptyQueue); assert.match(emptyQueue.calls[0][1].content, /Nothing/);
    const fullQueue = interaction('queue'); await new wrappers.queue(playback()).execute(fullQueue); assert.match(fullQueue.calls[0][1].content, /Grüße/);
});