const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('admin browser resources preserve a Home Assistant ingress prefix', () => {
    const server = fs.readFileSync('src/admin/AdminWebServer.ts', 'utf8');
    const api = fs.readFileSync('src/admin-ui/api/adminApi.ts', 'utf8');
    const panel = fs.readFileSync('src/admin-ui/components/AdminPanel.tsx', 'utf8');
    const twitch = fs.readFileSync('src/admin-ui/components/admin/TwitchSettingsSection.tsx', 'utf8');

    assert.match(server, /<script src="admin\/app\.js" defer><\/script>/);
    assert.doesNotMatch(server, /<script src="\/admin\/app\.js"/);
    assert.match(api, /new URL\(path\.replace\(\/\^\\\/\+\//);
    assert.match(panel, /src="admin\/sqlite\/"/);
    assert.doesNotMatch(twitch, /window\.open\("\/api\//);
});