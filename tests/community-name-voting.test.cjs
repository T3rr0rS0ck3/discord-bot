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
    const sent = [], edits = [], saved = [], pinned = [], deleted = [], finished = [];
    const createMessage = (id, payload, poll = null) => ({
        id, payload, poll, pinned: false,
        edit: async nextPayload => { edits.push(nextPayload); return createMessage(id, nextPayload, poll); },
        pin: async function () { this.pinned = true; pinned.push(id); },
        delete: async () => { deleted.push(id); }
    });
    const fetchedMessage = createMessage('message-1', undefined, overrides.poll ?? null);
    fetchedMessage.pinned = overrides.messagePinned === true;
    const channel = {
        id: 'channel-1', type: 0, name: 'grüße-äöüß',
        setName: async value => { channel.name = value; },
        messages: { fetch: async () => overrides.fetchFailure ? Promise.reject(new Error('gone')) : fetchedMessage },
        send: async payload => {
            sent.push(payload);
            return createMessage(`sent-${sent.length}`, payload, payload.poll ? { answers: new Map(), resultsFinalized: false } : null);
        }
    };
    const cache = { find: callback => callback(channel) ? channel : undefined };
    const guild = { channels: { cache, fetch: async () => {}, create: async options => { channel.name = options.name; return channel; } } };
    const round = overrides.round === null ? undefined : overrides.round ?? {
        endsAt: Date.now() + 5000,
        candidates: [{ id: 7, name: 'Lötstation 🎵', votes: 2 }, { id: 8, name: 'Grüße / Spaß', votes: 1 }]
    };
    const options = {
        guildId: 'guild-1', communityVotingChannelName: '  Grüße ÄÖÜß / Test  ', communityVotingDurationHours: 48,
        finishCommunityNameVotingRound: async (...args) => { finished.push(args); return overrides.winner; },
        getCommunityNameVotingRound: async () => round,
        startCommunityNameVotingRound: async () => overrides.startedRound,
        getCommunityNameSuggestionCount: async () => 3,
        getCommunityNameVotingMessage: async () => overrides.savedMessage,
        saveCommunityNameVotingMessage: async (...args) => saved.push(args),
        addCommunityNameSuggestion: async (...args) => { if (overrides.addError) throw overrides.addError; options.addArgs = args; }
    };
    const module = new CommunityNameVotingModule(options);
    const client = { guilds: { fetch: async () => guild } };
    return { module, options, client, channel, timers, sent, edits, saved, pinned, deleted, finished, fetchedMessage };
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
    const f = fixture();
    assert.equal(f.module.channelName, 'grüße-äöüß-test');
    await f.module.onReady(f.client);
    assert.equal(f.sent.length, 1);
    assert.match(f.sent[0].content, /Vier zufällig/);
    assert.equal(f.sent[0].poll.question.text, 'Wie soll der nächste Community-Sprachkanal heißen?');
    assert.deepEqual(Array.from(f.sent[0].poll.answers, answer => answer.text), ['Lötstation 🎵', 'Grüße / Spaß']);
    assert.equal(f.sent[0].poll.allowMultiselect, false);
    assert.equal(f.pinned[0], 'sent-1');
    assert.equal(f.saved[0][0], 'guild-1');
    assert.ok(f.timers[0].delay >= 1000);
    await f.module.applyRuntimeConfig({ communityVotingChannelName: ' Neuer Kanal / ÄÖÜ ', communityVotingDurationHours: 999 });
    assert.equal(f.module.durationHours, 768);
    assert.equal(f.channel.name, 'neuer-kanal-äöü');
    await f.module.shutdown();
    assert.equal(f.timers.at(-1).cleared, true);
});

test('suggestion modal remains available while legacy vote buttons are ignored', async () => {
    const f = fixture(); await f.module.onReady(f.client);
    const suggest = interaction(); assert.equal(await f.module.handleButtonInteraction('community-name-voting:suggest', suggest), true); assert.equal(suggest.calls[0][0], 'modal');
    assert.equal(await f.module.handleButtonInteraction('other', interaction()), false);
    assert.equal(await f.module.handleButtonInteraction('community-name-voting:vote:7', interaction()), false);
    assert.equal(await f.module.handleButtonInteraction('community-name-voting:suggest', interaction({ guildId: 'guild-2' })), false);
    const modal = interaction(); assert.equal(await f.module.handleModalSubmitInteraction('community-name-voting:suggest-modal', modal), true); assert.match(modal.calls[0][1].content, /Lötstation/);
    assert.deepEqual(Array.from(f.options.addArgs), ['guild-1', '  Lötstation 🎵 / Grüße  ', 'user-äöü']);
    assert.equal(await f.module.handleModalSubmitInteraction('other', interaction()), false);
    assert.equal(await f.module.handleModalSubmitInteraction('community-name-voting:suggest-modal', interaction({ guildId: 'guild-2' })), false);

    const failedAdd = fixture({ addError: 'kaputt / <script>' }); await failedAdd.module.onReady(failedAdd.client);
    const addError = interaction(); await failedAdd.module.handleModalSubmitInteraction('community-name-voting:suggest-modal', addError); assert.equal(addError.calls[0][1].content, 'kaputt / <script>');
});

test('voting reuses and pins an active poll and falls back to a new poll', async () => {
    const activePoll = { answers: new Map([[1, { voteCount: 2 }], [2, { voteCount: 1 }]]), resultsFinalized: false };
    const existing = fixture({ savedMessage: { channelId: 'channel-1', messageId: 'old' }, poll: activePoll }); await existing.module.onReady(existing.client);
    assert.equal(existing.sent.length, 0);
    assert.equal(existing.pinned[0], 'message-1');
    const fallback = fixture({ savedMessage: { channelId: 'channel-1', messageId: 'old' }, fetchFailure: true }); await fallback.module.onReady(fallback.client);
    assert.equal(fallback.sent.length, 1);
    const legacy = fixture({ savedMessage: { channelId: 'channel-1', messageId: 'old' } }); await legacy.module.onReady(legacy.client);
    assert.deepEqual(legacy.deleted, ['message-1']);
    assert.equal(legacy.sent.length, 1);
});

test('expired poll is deleted and winner is shown in the pinned replacement message', async () => {
    const expiredRound = {
        endsAt: Date.now() - 1000,
        candidates: [{ id: 7, name: 'Lötstation 🎵', votes: 0 }, { id: 8, name: 'Grüße / Spaß', votes: 0 }]
    };
    const poll = { answers: new Map([[1, { voteCount: 2 }], [2, { voteCount: 5 }]]), resultsFinalized: true };
    const nextRound = {
        endsAt: Date.now() + 86_400_000,
        candidates: [{ id: 9, name: 'Äpfel & Öl', votes: 0 }, { id: 10, name: 'Café / Talk', votes: 0 }]
    };
    const completed = fixture({ round: expiredRound, savedMessage: { channelId: 'channel-1', messageId: 'old' }, poll, winner: 'Grüße / Spaß', startedRound: nextRound });
    await completed.module.onReady(completed.client);
    assert.deepEqual(Array.from(completed.finished[0]), ['guild-1', 8]);
    assert.deepEqual(completed.deleted, ['message-1']);
    assert.match(completed.sent[0].content, /Gewinner der letzten Runde.*Grüße \/ Spaß/s);
    assert.ok(completed.sent[0].poll);
    assert.equal(completed.pinned[0], 'sent-1');

    const pool = fixture({ round: null, startedRound: undefined }); await pool.module.onReady(pool.client);
    assert.match(pool.sent[0].content, /3\/4/);
    assert.equal(pool.sent[0].poll, undefined);
    assert.equal(pool.pinned[0], 'sent-1');
    assert.equal(pool.timers.length, 0);
    const existingPool = fixture({ round: null, startedRound: undefined, savedMessage: { channelId: 'channel-1', messageId: 'old' } });
    await existingPool.module.onReady(existingPool.client);
    assert.equal(existingPool.edits.length, 1);
    assert.equal(existingPool.sent.length, 0);
});