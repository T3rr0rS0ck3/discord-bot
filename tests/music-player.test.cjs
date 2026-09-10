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
        player: { state: { status: 'playing', resource: { volume: { setVolume() {} } } } },
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