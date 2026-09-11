const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, file) => {
    module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText, file);
};

const { YouTubeTrackSearchService } = require('../src/services/YouTubeTrackSearchService.ts');
const service = new YouTubeTrackSearchService({ searchLimit: 10, debugEnabled: false });
const candidate = (overrides = {}) => ({ url: 'https://www.youtube.com/watch?v=abc', title: 'Die Ärzte - Schrei nach Liebe official audio', channelName: 'die ärzte - topic', channelVerified: true, durationInSec: 240, ...overrides });

test('YouTube URL normalization rejects deceptive and malformed input', () => {
    const cases = [
        ['https://youtu.be/abc?t=2', 'https://www.youtube.com/watch?v=abc'],
        ['https://www.youtube.com/watch?v=äöü&list=1', 'https://www.youtube.com/watch?v=äöü'],
        ['https://youtube.com/shorts/xyz?feature=share', 'https://www.youtube.com/watch?v=xyz'],
        ['https://youtu.be/', null], ['https://youtube.com/watch', null], ['https://youtube.com/shorts/', null],
        ['not a url', null], ['https://example.com/watch?v=abc', null], ['https://notyoutube.com/watch?v=abc', null],
        ['https://youtube.com.evil.example/watch?v=abc', null]
    ];
    for (const [input, expected] of cases) assert.equal(service.normalizeYouTubeUrl(input), expected);
    assert.equal(service.getYouTubeThumbnailUrl('https://www.youtube.com/watch?v=abc'), 'https://i.ytimg.com/vi/abc/hqdefault.jpg');
    assert.equal(service.getYouTubeThumbnailUrl('https://youtube.com/shorts/abc'), undefined);
    assert.equal(service.getYouTubeThumbnailUrl('https://youtube.com/watch'), undefined);
    assert.equal(service.getYouTubeThumbnailUrl('kaputt'), undefined);
});

test('YouTube text normalization handles Umlauts, accents, punctuation and whitespace', () => {
    assert.equal(service.normalizeText('  Björk & Die ÄRZTE — Grüße!!!  '), 'bjork die arzte grusse');
    assert.equal(service.normalizeText('Cafe\u0301   déjà-vu'), 'cafe deja vu');
    assert.deepEqual(service.getSearchTokens('Die Ärzte official Audio Grüße & Spaß'), ['die', 'arzte', 'grusse', 'spass']);
    assert.equal(service.allTokensPresent('die arzte schrei liebe', ['die', 'schrei', 'liebe']), true);
    assert.equal(service.allTokensPresent('die arzte', ['x', 'y']), true);
    assert.equal(service.allTokensPresent('die arzte', ['schrei']), false);
});

test('artist and title parsing supports common separators and Unicode', () => {
    assert.deepEqual(service.parseArtistAndTitle('Die Ärzte - Schrei nach Liebe'), { artist: 'Die Ärzte', title: 'Schrei nach Liebe' });
    assert.deepEqual(service.parseArtistAndTitle('Björk – Jóga'), { artist: 'Björk', title: 'Jóga' });
    assert.deepEqual(service.parseArtistAndTitle('Grüße — Spaß'), { artist: 'Grüße', title: 'Spaß' });
    assert.deepEqual(service.parseArtistAndTitle('Song by Künstler'), { artist: 'Künstler', title: 'Song' });
    assert.deepEqual(service.parseArtistAndTitle('ohne trennzeichen'), {});
    assert.deepEqual(service.parseArtistAndTitle(' - leer'), {});
    assert.deepEqual(service.parseArtistAndTitle('   '), {});
});

test('search variants trim, deduplicate, remove noise and retain special text', () => {
    const expected = { title: 'Schrei nach Liebe', artists: ['Die Ärzte'], durationSec: 240 };
    const variants = service.buildYouTubeSearchVariants('  Die Ärzte Schrei official audio  ', expected, 'Die Ärzte - Schrei nach Liebe');
    assert.ok(variants.includes('Die Ärzte Schrei official audio'));
    assert.ok(variants.includes('Die Ärzte Schrei'));
    assert.ok(variants.includes('Schrei nach Liebe Die Ärzte'));
    assert.equal(new Set(variants).size, variants.length);
    assert.equal(service.stripSearchNoise('official audio original'), 'official audio original');
    assert.equal(service.enrichYouTubeSearchQuery('   '), '   ');
});

test('candidate matching is accent-insensitive and rejects unrelated songs', () => {
    const expected = { title: 'Schrei nach Liebe', artists: ['Die Ärzte'], durationSec: 240 };
    assert.equal(service.matchesRequiredSongTerms(candidate(), expected), true);
    assert.equal(service.matchesRequiredSongTerms(candidate({ title: 'Anderer Song', channelName: 'Fremd' }), expected), false);
    assert.equal(service.matchesRequiredSongTerms(candidate(), undefined, 'Die Arzte - Schrei nach Liebe'), true);
    assert.equal(service.matchesRequiredSongTerms(candidate({ title: 'Etwas Fremdes', channelName: 'Fremd' }), undefined, 'Die Ärzte - Schrei nach Liebe'), false);
    assert.equal(service.matchesRequiredSongTerms(candidate(), undefined), true);
    assert.equal(service.matchesRequiredSongTerms(candidate(), undefined, 'x y'), true);
    assert.equal(service.containsBothParsedTerms(candidate(), 'Die Arzte', 'Schrei nach Liebe'), true);
    assert.equal(service.containsBothParsedTerms(candidate(), 'x', 'y'), true);
    assert.equal(service.containsBothParsedTerms(candidate(), 'Björk', 'Jóga'), false);
});

test('candidate scoring rewards exact official music and duration boundaries', () => {
    const expected = { title: 'Schrei nach Liebe', artists: ['Die Ärzte'], durationSec: 240 };
    const strong = service.scoreYouTubeCandidate(candidate(), expected, 'Die Ärzte Schrei nach Liebe');
    const weak = service.scoreYouTubeCandidate(candidate({ title: 'Live cover remix lyrics video', channelName: 'unknown', channelVerified: false, durationInSec: 500 }), expected, 'Die Ärzte Schrei nach Liebe');
    assert.ok(strong > weak);
    for (const [diff, minimum] of [[3, 1], [8, 1], [15, 1]]) {
        assert.ok(service.scoreYouTubeCandidate(candidate({ durationInSec: 240 + diff }), expected) >= minimum);
    }
    assert.ok(service.scoreYouTubeCandidate(candidate({ title: 'Song provided to youtube album version', channelName: 'vevo', durationInSec: undefined }), undefined, 'Song') > 0);
});

test('debug logging uses custom logger and can be disabled', () => {
    const messages = [];
    const debug = new YouTubeTrackSearchService({ searchLimit: 5, debugEnabled: true, logger: message => messages.push(message) });
    debug.log('Grüße & Spaß');
    service.log('unsichtbar');
    assert.deepEqual(messages, ['Grüße & Spaß']);
    const options = debug.createRequestOptions('YouTube Grüße', 123, 2);
    options.logger('erneut');
    assert.equal(options.serviceName, 'YouTube Grüße');
    assert.equal(messages.at(-1), 'erneut');
});