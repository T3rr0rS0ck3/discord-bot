const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, file) => {
    module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText, file);
};
const { TwitchRoleService } = require('../src/services/TwitchRoleService.ts');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

function response(status, body) {
    return { status, ok: status >= 200 && status < 300, json: async () => body };
}

function configured(overrides = {}) {
    return new TwitchRoleService({ broadcasterName: 'Jörg/ÄÖÜ & Co', clientId: 'client-id', clientSecret: 'secret', accessToken: 'token', refreshToken: 'refresh', ...overrides });
}

test('Twitch configuration trims whitespace and invalidates cached broadcaster on name change', () => {
    assert.equal(configured().isConfigured(), true);
    assert.equal(configured({ broadcasterName: '   ' }).isConfigured(), false);
    assert.equal(configured({ clientId: '\t' }).isConfigured(), false);
    assert.equal(configured({ accessToken: '\n' }).isConfigured(), false);
    const service = configured();
    service.broadcasterId = 'cached';
    service.updateConfig({ broadcasterName: 'Jörg/ÄÖÜ & Co' });
    assert.equal(service.broadcasterId, 'cached');
    service.updateConfig({ broadcasterName: 'Björk & Freunde', clientId: 'neu', clientSecret: 'neu-secret', accessToken: 'neu-token', refreshToken: 'neu-refresh', accessTokenExpiresAt: 123 });
    assert.equal(service.broadcasterId, undefined);
    assert.equal(service.clientId, 'neu');
});

test('Twitch token refresh sends encoded form data and publishes new tokens', async () => {
    const updates = [];
    let request;
    global.fetch = async (url, options) => {
        request = { url, options };
        return response(200, { access_token: 'neu-ä', refresh_token: 'refresh/+&', expires_in: 3600 });
    };
    const service = configured({ accessTokenExpiresAt: Date.now() - 1, onTokensUpdated: tokens => updates.push(tokens) });
    assert.equal(await service.getValidAccessToken(), 'neu-ä');
    assert.equal(request.url, 'https://id.twitch.tv/oauth2/token');
    assert.match(request.options.body.toString(), /refresh_token=refresh/);
    assert.equal(updates[0].refreshToken, 'refresh/+&');
    assert.ok(updates[0].accessTokenExpiresAt > Date.now());
});

test('Twitch refresh handles missing credentials, HTTP and incomplete payloads', async () => {
    const missing = configured({ refreshToken: undefined });
    assert.equal(await missing.refreshAccessToken(), undefined);
    global.fetch = async () => response(500, {});
    await assert.rejects(configured().refreshAccessToken(), /HTTP 500/);
    global.fetch = async () => response(200, { access_token: 'only-one-field' });
    await assert.rejects(configured().refreshAccessToken(), /incomplete data/);
    assert.equal(await new TwitchRoleService({}).getValidAccessToken(), null);
    assert.equal(await new TwitchRoleService({ accessToken: 'x' }).buildAuthHeaders(), null);
});

test('Twitch authenticated fetch retries once after 401 and keeps Unicode-safe headers', async () => {
    const calls = [];
    global.fetch = async (url, options) => {
        calls.push({ url, options });
        if (calls.length === 1) return response(401, {});
        if (String(url).includes('/oauth2/token')) return response(200, { access_token: 'fresh', refresh_token: 'fresh-r', expires_in: 3600 });
        return response(200, { ok: true });
    };
    const result = await configured().fetchWithAuth('https://api.twitch.tv/helix/users?login=J%C3%B6rg');
    assert.equal(result.status, 200);
    assert.equal(calls.length, 3);
    assert.equal(calls[2].options.headers.Authorization, 'Bearer fresh');

    global.fetch = async () => response(401, {});
    assert.equal((await configured({ refreshToken: undefined }).fetchWithAuth('https://api.twitch.tv/x')).status, 401);
});

test('Twitch follower pagination encodes broadcaster and returns stable IDs and lowercase names', async () => {
    const urls = [];
    global.fetch = async url => {
        urls.push(String(url));
        if (String(url).includes('/helix/users')) return response(200, { data: [{ id: 'broadcaster-1', login: 'jörg' }] });
        if (String(url).includes('after=n%C3%A4chste') || String(url).includes('after=nächste')) {
            return response(200, { data: [{ user_id: '2', user_login: 'Björk' }], pagination: {} });
        }
        return response(200, { data: [{ user_id: '1', user_login: 'ÄRZTE' }], pagination: { cursor: 'nächste' } });
    };
    const service = configured();
    assert.deepEqual([...await service.getFollowerUserIds()], ['1', '2']);
    assert.deepEqual([...await service.getFollowerNames()], ['ärzte', 'björk']);
    assert.ok(urls.some(url => url.includes('login=J%C3%B6rg%2F%C3%84%C3%96%C3%9C%20%26%20Co')));
    assert.ok(urls.some(url => url.includes('after=nächste')));
});

test('Twitch subscriber pagination and broadcaster cache work', async () => {
    let userLookups = 0;
    global.fetch = async url => {
        if (String(url).includes('/helix/users')) {
            userLookups++;
            return response(200, { data: [{ id: 'b1', login: 'name' }] });
        }
        return response(200, { data: [{ user_id: 's1', user_login: 'GrüßeUser' }], pagination: {} });
    };
    const service = configured({ broadcasterName: 'Grüße User' });
    assert.deepEqual([...await service.getSubscriberUserIds()], ['s1']);
    assert.deepEqual([...await service.getSubscriberNames()], ['grüßeuser']);
    assert.equal(userLookups, 1);
});

test('Twitch reports authorization, lookup and API failures', async () => {
    await assert.rejects(new TwitchRoleService({}).getFollowerUserIds(), /not configured/);
    global.fetch = async url => String(url).includes('/helix/users') ? response(200, { data: [] }) : response(200, {});
    await assert.rejects(configured().getFollowerUserIds(), /was not found/);
    global.fetch = async () => response(503, {});
    await assert.rejects(configured().getSubscriberUserIds(), /Twitch API error: 503/);
    assert.equal(await new TwitchRoleService({}).fetchWithAuth('https://api.twitch.tv/helix/users'), null);
});