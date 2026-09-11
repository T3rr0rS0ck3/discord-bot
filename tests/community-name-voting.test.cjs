const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

class Builder {
    constructor() { this.data = {}; this.components = []; }
    setCustomId(value) { this.data.customId = value; return this; }
    setTitle(value) { this.data.title = value; return this; }
    setLabel(value) { this.data.label = value; return this; }
    setStyle(value) { this.data.style = value; return this; }
    setMinLength(value) { this.data.min = value; return this; }
    setMaxLength(value) { this.data.max = value; return this; }
    setRequired(value) { this.data.required = value; return this; }
    addComponents(...values) { this.components.push(...values); return this; }
}

function load(timerCalls) {
    const sourcePath = path.resolve('src/modules/CommunityNameVotingModule.ts');
    const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
        fileName: sourcePath,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, inlineSourceMap: true, inlineSources: true }
    }).outputText;
    const exports = {};
    vm.runInNewContext(output, {
        exports,
        console,
        Date,
        setTimeout: (callback, delay) => { const timer = { callback, delay }; timerCalls.push(timer); return timer; },
        clearTimeout: timer => { timer.cleared = true; },
        require: name => name === 'discord.js' ? {
            ActionRowBuilder: Builder, ButtonBuilder: Builder, ModalBuilder: Builder, TextInputBuilder: Builder,
            ButtonStyle: { Primary: 1, Secondary: 2 }, TextInputStyle: { Short: 1 }, ChannelType: { GuildText: 0 }
        } : require(name)
    }, { filename: sourcePath });
    return exports.CommunityNameVotingModule;
}

function fixture(overrides = {}) {
    const timers = [];
    const CommunityNameVotingModule = load(timers);
    const sent = [], edits = [], saved = [];
    const channel = {
        id: 'channel-1', type: 0, name: 'grüße-äöüß',
        setName: async value => { channel.name = value; },
        messages: { fetch: async () => overrides.fetchFailure ? Promise.reject(new Error('gone')) : { edit: async payload => { edits.push(payload); return { id: 'message-1' }; } } },
        send: async payload => { sent.push(payload); return { id: `sent-${sent.length}` }; }
    };
    const cache = { find: callback => callback(channel) ? channel : undefined };
    const guild = { channels: { cache, fetch: async () => {}, create: async options => { channel.name = options.name; return channel; } } };
    const round = overrides.round === null ? undefined : overrides.round ?? {
        endsAt: Date.now() + 5000,
        candidates: [{ id: 7, name: 'Lötstation 🎵', votes: 2 }, { id: 8, name: 'Grüße / Spaß', votes: 1 }]
    };
    const options = {
        guildId: 'guild-1', communityVotingChannelName: '  Grüße ÄÖÜß / Test  ', communityVotingDurationDays: 2,
        finishCommunityNameVotingRound: async () => overrides.winner,
        getCommunityNameVotingRound: async () => round,
        startCommunityNameVotingRound: async () => overrides.startedRound,
        getCommunityNameSuggestionCount: async () => 3,
        getCommunityNameVotingMessage: async () => overrides.savedMessage,
        saveCommunityNameVotingMessage: async (...args) => saved.push(args),
        voteForCommunityName: async (...args) => { if (overrides.voteError) throw overrides.voteError; options.voteArgs = args; },
        addCommunityNameSuggestion: async (...args) => { if (overrides.addError) throw overrides.addError; options.addArgs = args; }
    };
    const module = new CommunityNameVotingModule(options);
    const client = { guilds: { fetch: async () => guild } };
    return { module, options, client, channel, timers, sent, edits, saved };
}

function interaction(extra = {}) {
    const calls = [];
    return {
        calls, guildId: extra.guildId === undefined ? 'guild-1' : extra.guildId, user: { id: 'user-äöü' },
        fields: { getTextInputValue: () => extra.value ?? '  Lötstation 🎵 / Grüße  ' },
        showModal: async value => calls.push(['modal', value]),
        reply: async value => calls.push(['reply', value])
    };
}

test('voting startup normalizes Unicode channel names and refreshes an active round', async () => {
    const f = fixture({ winner: 'Straße & Spaß' });
    assert.equal(f.module.channelName, 'grüße-äöüß-test');
    await f.module.onReady(f.client);
    assert.equal(f.sent.length, 1);
    assert.match(f.sent[0].content, /Vier zufällig/);
    assert.equal(f.saved[0][0], 'guild-1');
    assert.ok(f.timers[0].delay >= 1000);
    await f.module.applyRuntimeConfig({ communityVotingChannelName: ' Neuer Kanal / ÄÖÜ ', communityVotingDurationDays: 99 });
    assert.equal(f.module.durationDays, 30);
    assert.equal(f.channel.name, 'neuer-kanal-äöü');
    await f.module.shutdown();
    assert.equal(f.timers.at(-1).cleared, true);
});

test('voting buttons and modal handle invalid input, success and user-facing errors', async () => {
    const f = fixture(); await f.module.onReady(f.client);
    const suggest = interaction(); assert.equal(await f.module.handleButtonInteraction('community-name-voting:suggest', suggest), true); assert.equal(suggest.calls[0][0], 'modal');
    assert.equal(await f.module.handleButtonInteraction('other', interaction()), false);
    const invalid = interaction({ guildId: undefined }); assert.equal(await f.module.handleButtonInteraction('community-name-voting:vote:nope', invalid), true); assert.match(invalid.calls[0][1].content, /nicht verarbeitet/);
    const vote = interaction(); await f.module.handleButtonInteraction('community-name-voting:vote:7', vote); assert.deepEqual(Array.from(f.options.voteArgs), ['guild-1', 7, 'user-äöü']);
    const modal = interaction(); assert.equal(await f.module.handleModalSubmitInteraction('community-name-voting:suggest-modal', modal), true); assert.match(modal.calls[0][1].content, /Lötstation/);
    assert.deepEqual(Array.from(f.options.addArgs), ['guild-1', '  Lötstation 🎵 / Grüße  ', 'user-äöü']);
    assert.equal(await f.module.handleModalSubmitInteraction('other', interaction()), false);

    const failedVote = fixture({ voteError: new Error('Stimme ungültig äöü') }); await failedVote.module.onReady(failedVote.client);
    const voteError = interaction(); await failedVote.module.handleButtonInteraction('community-name-voting:vote:8', voteError); assert.match(voteError.calls[0][1].content, /ungültig/);
    const failedAdd = fixture({ addError: 'kaputt / <script>' }); await failedAdd.module.onReady(failedAdd.client);
    const addError = interaction(); await failedAdd.module.handleModalSubmitInteraction('community-name-voting:suggest-modal', addError); assert.equal(addError.calls[0][1].content, 'kaputt / <script>');
});

test('voting reuses saved messages, falls back to send and clamps empty-round timers', async () => {
    const existing = fixture({ savedMessage: { channelId: 'channel-1', messageId: 'old' } }); await existing.module.onReady(existing.client);
    assert.equal(existing.edits.length, 1);
    const fallback = fixture({ savedMessage: { channelId: 'channel-1', messageId: 'old' }, fetchFailure: true }); await fallback.module.onReady(fallback.client);
    assert.equal(fallback.sent.length, 1);
    const pool = fixture({ round: null, winner: 'ÄÖÜß', startedRound: undefined }); await pool.module.onReady(pool.client);
    assert.match(pool.sent[0].content, /3\/4/);
    assert.match(pool.sent[0].content, /ÄÖÜß/);
    assert.equal(pool.timers.length, 0);
});