const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, file) => {
    module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText, file);
};

const { MusicPlaybackService } = require('../src/services/MusicPlaybackService.ts');

function track(id) {
    return { id, requestedBy: 'user', streamKind: 'youtube', sourceUrl: `https://youtube.test/${id}`, sourceLabel: `Track ${id}`, durationSec: 180 };
}

function fixture() {
    const service = new MusicPlaybackService({ searchTrackMetadata: async () => null }, {
        defaultVolumePercent: 50,
        debugSearch: false,
        youtubeSearchLimit: 10,
        allowedRoleNames: []
    });
    service.guildStates.set('guild', {
        connection: {},
        player: { state: { status: 'playing', resource: { volume: { setVolume() {} } } }, stop() {}, pause: () => true, unpause: () => true },
        queue: [track('a'), track('b'), track('c')],
        history: [],
        current: track('current'),
        volume: 0.5,
        loopMode: 'off',
        startedAt: Date.now() - 60000,
        pausedDurationMs: 0
    });
    return service;
}

test('player queue controls remove, clear, shuffle and cycle loop modes', () => {
    const service = fixture();
    assert.equal(service.removeFromQueue('guild', 'b'), true);
    assert.deepEqual(service.getQueueSnapshot('guild').queue.map(item => item.id), ['a', 'c']);
    assert.equal(service.removeFromQueue('guild', 'missing'), false);

    assert.equal(service.cycleLoopMode('guild'), 'track');
    assert.equal(service.cycleLoopMode('guild'), 'queue');
    assert.equal(service.cycleLoopMode('guild'), 'off');

    const beforeShuffle = service.getQueueSnapshot('guild').queue.map(item => item.id).sort();
    service.shuffleQueue('guild');
    assert.deepEqual(service.getQueueSnapshot('guild').queue.map(item => item.id).sort(), beforeShuffle);
    assert.equal(service.clearQueue('guild'), 2);
    assert.equal(service.getQueueSnapshot('guild').queue.length, 0);
});

test('player UI exposes loop, shuffle, clear, volume and queue removal controls', () => {
    const service = fixture();
    const json = service.buildPlayerUI('guild').components.map(row => row.toJSON());
    const customIds = json.flatMap(row => row.components.map(component => component.custom_id));
    assert.ok(customIds.includes('music:loop'));
    assert.ok(customIds.includes('music:shuffle'));
    assert.ok(customIds.includes('music:clear'));
    assert.ok(customIds.includes('music:remove'));
    assert.ok(customIds.includes('music:vol-up-10'));
    assert.match(service.buildPlayerUI('guild').embeds[0].data.fields.find(field => field.name === 'Progress').value, /1:00 \/ 3:00/);
});

test('player offers direct volume selection when no queue removal menu is needed', () => {
    const service = fixture();
    service.guildStates.get('guild').queue = [];
    const customIds = service.buildPlayerUI('guild').components.flatMap(row => row.toJSON().components.map(component => component.custom_id));
    assert.ok(customIds.includes('music:volume'));
    service.guildStates.delete('guild');
    const empty = service.buildPlayerUI('guild');
    assert.match(empty.embeds[0].data.description, /Nothing/);
});

test('player UI covers paused, artwork, empty preview and loop labels', () => {
    const service = fixture();
    const state = service.guildStates.get('guild');
    state.player.state.status = 'paused';
    state.current.artworkUrl = 'https://example.test/äöü.png';
    state.queue = [];
    state.loopMode = 'track';
    const trackUi = service.buildPlayerUI('guild').embeds[0].data;
    assert.equal(trackUi.thumbnail.url, 'https://example.test/äöü.png');
    assert.equal(trackUi.fields.find(field => field.name === 'Status').value, 'Paused');
    assert.equal(trackUi.fields.find(field => field.name === 'Loop').value, 'Track');
    state.loopMode = 'queue';
    assert.equal(service.buildPlayerUI('guild').embeds[0].data.fields.find(field => field.name === 'Loop').value, 'Queue');
});

test('text searches fall back directly to YouTube when TheAudioDB has no match', async () => {
    const service = new MusicPlaybackService({ searchTrackMetadata: async () => null }, {
        debugSearch: false,
        youtubeSearchLimit: 10,
        allowedRoleNames: []
    });
    let received;
    service.youtubeSearchService = {
        resolveByQuery: async (...args) => {
            received = args;
            return { url: 'https://www.youtube.com/watch?v=test', title: 'Direct result', thumbnailUrl: 'thumb' };
        }
    };

    const result = await service.resolveSource('user', 'artist title');
    assert.equal(received[0], 'artist title');
    assert.equal(received[1], undefined);
    assert.equal(result.sourceUrl, 'https://www.youtube.com/watch?v=test');
});

test('configuration parsing, access roles and missing guild states use safe boundaries', () => {
    const service = new MusicPlaybackService({}, { defaultVolumePercent: 'not-a-number', youtubeSearchLimit: 999, allowedRoleNames: ['  Musik ÄÖÜ  ', '', '   '] });
    assert.equal(service.defaultVolume, 1);
    assert.equal(service.youtubeSearchLimit, 100);
    assert.equal(service.skip('missing') instanceof Promise, true);
    assert.equal(service.back('missing') instanceof Promise, true);
    assert.equal(service.pause('missing'), false);
    assert.equal(service.resume('missing'), false);
    assert.equal(service.setVolume('missing', 50), null);
    assert.equal(service.clearQueue('missing'), 0);
    assert.equal(service.removeFromQueue('missing', 'x'), false);
    assert.equal(service.shuffleQueue('missing'), false);
    assert.equal(service.cycleLoopMode('missing'), undefined);
    assert.equal(service.getQueueSnapshot('missing'), null);
    service.setAllowedRoleNames([' Grüße ', '', '🎵']);
    assert.deepEqual([...service.allowedRoleNames], ['Grüße', '🎵']);
});

test('pause, resume, volume, back and shutdown update active state', async () => {
    const service = fixture();
    const state = service.guildStates.get('guild');
    let volume;
    let stopped = 0;
    let destroyed = 0;
    state.player.pause = () => true;
    state.player.unpause = () => true;
    state.player.stop = () => { stopped++; };
    state.player.removeAllListeners = () => {};
    state.player.state.resource.volume.setVolume = value => { volume = value; };
    state.connection.destroy = () => { destroyed++; };
    state.current = track('current');
    state.history = [track('previous')];
    assert.equal(service.pause('guild'), true);
    assert.ok(state.pausedAt);
    assert.equal(service.resume('guild'), true);
    assert.equal(state.pausedAt, undefined);
    assert.equal(service.setVolume('guild', 200), 100);
    assert.equal(volume, 1);
    assert.equal(await service.back('guild'), true);
    assert.equal(state.queue[0].id, 'previous');
    assert.equal(await service.skip('guild'), true);
    service.shutdown();
    assert.equal(destroyed, 1);
    assert.equal(service.guildStates.size, 0);
    assert.ok(stopped >= 3);

    const noHistory = fixture(); noHistory.guildStates.get('guild').history = [];
    assert.equal(await noHistory.back('guild'), false);
    const noCurrent = fixture(); noCurrent.guildStates.get('guild').current = undefined;
    assert.equal(await noCurrent.skip('guild'), false);
    const shortQueue = fixture(); shortQueue.guildStates.get('guild').queue = [track('one')];
    assert.equal(shortQueue.shuffleQueue('guild'), false);
});

test('button and select interactions cover guards, controls and stale queue values', async () => {
    const service = fixture();
    service.hasAccess = () => true;
    const interaction = customId => {
        const current = {
            customId, guildId: 'guild', member: {}, values: ['missing'],
            inCachedGuild: () => true,
            update: async value => { current.updated = value; },
            reply: async value => { current.replied = value; }
        };
        return current;
    };
    assert.equal(await service.handleButtonInteraction({ ...interaction('other'), customId: 'other' }), false);
    for (const id of ['music:skip', 'music:back', 'music:pause-toggle', 'music:vol-down-10', 'music:vol-up-10', 'music:vol-down-1', 'music:vol-up-1', 'music:vol-mute', 'music:loop', 'music:shuffle', 'music:clear']) {
        const current = interaction(id);
        Object.setPrototypeOf(current.member, require('discord.js').GuildMember.prototype);
        assert.equal(await service.handleButtonInteraction(current), true, id);
    }
    const unknown = interaction('music:unknown'); Object.setPrototypeOf(unknown.member, require('discord.js').GuildMember.prototype);
    assert.equal(await service.handleButtonInteraction(unknown), false);
    service.guildStates.get('guild').queue = [track('remaining')];
    const stale = interaction('music:remove'); Object.setPrototypeOf(stale.member, require('discord.js').GuildMember.prototype);
    assert.equal(await service.handleStringSelectInteraction(stale), true);
    assert.match(stale.replied.content, /no longer/);
    const volume = interaction('music:volume'); volume.values = ['25']; Object.setPrototypeOf(volume.member, require('discord.js').GuildMember.prototype);
    assert.equal(await service.handleStringSelectInteraction(volume), true);
    assert.equal(service.getQueueSnapshot('guild').volumePercent, 25);

    const outside = interaction('music:skip'); outside.inCachedGuild = () => false;
    assert.equal(await service.handleButtonInteraction(outside), false);
    const denied = interaction('music:skip'); Object.setPrototypeOf(denied.member, require('discord.js').GuildMember.prototype); service.hasAccess = () => false;
    assert.equal(await service.handleButtonInteraction(denied), true); assert.match(denied.replied.content, /required role/);
    const deniedSelect = interaction('music:volume'); Object.setPrototypeOf(deniedSelect.member, require('discord.js').GuildMember.prototype);
    assert.equal(await service.handleStringSelectInteraction(deniedSelect), true); assert.match(deniedSelect.replied.content, /required role/);
    assert.equal(await service.handleStringSelectInteraction({ ...interaction('other'), customId: 'other' }), false);
});

test('source resolution rejects deceptive YouTube hosts and preserves special HTTP URLs', async () => {
    const service = new MusicPlaybackService({ searchTrackMetadata: async () => null }, { debugSearch: false });
    service.youtubeSearchService = {
        normalizeYouTubeUrl: value => value,
        getYouTubeThumbnailUrl: () => 'thumb',
        resolveByQuery: async input => ({ url: 'https://youtu.be/ok', title: input, thumbnailUrl: 'thumb' })
    };
    assert.equal(service.isYouTubeUrl('https://youtube.com/watch?v=abc'), true);
    assert.equal(service.isYouTubeUrl('https://youtube.com.evil.example/watch?v=abc'), false);
    assert.equal(service.isYouTubeUrl('not a url'), false);
    const direct = await service.resolveSource('u', 'https://example.test/Grüße%20🎵.mp3?x=1&y=2');
    assert.equal(direct.streamKind, 'ffmpeg');
    const youtube = await service.resolveSource('u', 'https://youtu.be/abc');
    assert.equal(youtube.artworkUrl, 'thumb');
});

test('controller message refresh recreates deleted messages and register ignores missing state', async () => {
    const service = fixture();
    await service.registerControllerMessage('missing', 'c', 'm');
    const state = service.guildStates.get('guild');
    let sent = 0;
    state.controllerChannel = {
        messages: { fetch: async () => { throw new Error('deleted'); } },
        send: async () => { sent++; return { id: 'new-message', channelId: 'new-channel' }; }
    };
    state.controllerMessageId = 'old';
    await service.syncPlayerPanel('guild');
    assert.equal(sent, 1);
    assert.equal(state.controllerMessageId, 'new-message');
    state.controllerMessageId = undefined;
    await service.syncPlayerPanel('guild');
    assert.equal(sent, 2);
    state.controllerChannel = undefined;
    await service.syncPlayerPanel('guild');
    state.controllerChannel = { messages: { fetch: async () => ({ edit: async () => {} }) } };
    state.controllerMessageId = 'existing';
    await service.syncPlayerPanel('guild');
});