const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, file) => {
    module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText, file);
};

const { TheAudioDbService } = require('../src/services/TheAudioDbService.ts');

test('TheAudioDB v1 returns multiple unique suggestions', async t => {
    t.mock.method(global, 'fetch', async url => {
        assert.match(String(url), /\/api\/v1\/json\/key\/searchtrack\.php/);
        return new Response(JSON.stringify({ track: [
            { strTrack: 'Song One', strArtist: 'Artist', intDuration: '120000' },
            { strTrack: 'Song Two', strArtist: 'Artist', intDuration: '130000' },
            { strTrack: 'Song One', strArtist: 'Artist', intDuration: '120000' }
        ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const service = new TheAudioDbService({ apiKey: 'key', apiVersion: 'v1' });
    assert.deepEqual(await service.searchTrackSuggestions('Artist - Song', 10), [
        { label: 'Song One - Artist', value: 'Artist - Song One' },
        { label: 'Song Two - Artist', value: 'Artist - Song Two' }
    ]);
});

test('TheAudioDB v2 sends API key header and reads search results', async t => {
    t.mock.method(global, 'fetch', async (url, options) => {
        assert.match(String(url), /\/api\/v2\/json\/search\/track\//);
        assert.equal(options.headers['X-API-KEY'], 'premium-key');
        return new Response(JSON.stringify({ search: [
            { strTrack: 'Premium Song', strArtist: 'Premium Artist', intDuration: 210000 }
        ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const service = new TheAudioDbService({ apiKey: 'premium-key', apiVersion: 'v2' });
    const result = await service.searchTrackMetadata('Premium Artist - Premium Song');
    assert.equal(result.title, 'Premium Song');
    assert.equal(result.durationSec, 210);
});