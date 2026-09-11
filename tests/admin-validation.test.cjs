const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, file) => {
    module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText, file);
};

const { AdminWebServer } = require('../src/admin/AdminWebServer.ts');

function validConfig() {
    return {
        discordToken: ' token-mit-/+_ ',
        guildId: ' 123456789012345678 ',
        adminUiUsername: ' Jörg Admin ',
        adminUiToken: ' päss<&>"\' ',
        adminUiPort: 8787,
        adminLoginMaxFailures: 5,
        adminLoginBlockMinutes: 15,
        musicRoleName: ' Grüße & Spaß ',
        musicDebugSearch: true,
        welcomeRoles: []
    };
}

function createServer(config = validConfig()) {
    return new AdminWebServer({
        port: 0,
        getAuthConfig: () => ({ username: config.adminUiUsername }),
        verifyAdminPassword: async () => true,
        getConfig: () => config,
        getLogs: () => [],
        saveConfig: async () => {},
        restartBot: async () => {},
        getServerEmojis: async () => [],
        getWelcomeChannels: async () => [],
        getDiscordStatus: () => ({ state: 'offline', message: 'offline', updatedAt: new Date().toISOString() }),
        getDatabaseStatus: async () => ({ schemaVersion: 7, latestMigration: null, appliedMigrations: [] }),
        getCommunityStatus: async () => ({ configured: false, connected: false, voiceChannels: [] }),
        deleteCommunityChannel: async () => {},
        consumeTwitchMemberOAuthState: async () => undefined,
        saveTwitchMemberLink: async () => {},
        syncTwitchRoles: async () => ({ guildId: '', attemptedAt: 0, successful: true, followerChanges: 0, subscriberChanges: 0 }),
        getTwitchRoleSyncStatus: async () => ({ followerChanges: 0, subscriberChanges: 0, changes: [] })
    });
}

test('admin normalization preserves typical Unicode and sanitizes channel names', () => {
    const server = createServer();
    const normalized = server.normalize({
        ...validConfig(),
        systemEnabled: 1,
        musicEnabled: true,
        communityEnabled: true,
        communityVotingEnabled: true,
        welcomeEnabled: true,
        twitchEnabled: true,
        communityCategoryName: '  Grüße & Spaß / Lounge  ',
        communityMaxChannels: 12.9,
        communityEmptyTimeoutSeconds: 90.8,
        communityVotingChannelName: '  Vorschläge-ÄÖÜ  ',
        communityVotingDurationHours: 72.9,
        musicDefaultVolumePercent: 75.5,
        musicYoutubeSearchLimit: 30,
        audioDbApiKey: ' Schlüssel/123 ',
        audioDbApiVersion: 'v2',
        welcomeChannelId: ' 234567890123456789 ',
        welcomeTitle: '  Grüße 👋 <Team>  ',
        welcomeReactionPrompt: '  Wähle: 🎮 & 🎵  ',
        welcomeReactionInstructions: '  Klick / erneut klicken.  ',
        welcomeRoles: [
            { emoji: ' 🎮 ', name: ' Zocker*innen ', description: ' Spaß & Freunde <3 ' },
            { emoji: '', name: 'unvollständig', description: 'wird gefiltert' }
        ],
        twitchBroadcasterName: ' Jörg_ÄÖÜ ',
        twitchClientId: ' client/id ',
        twitchClientSecret: ' secret+& ',
        twitchRedirectUri: ' https://ha.example/ä/callback?x=1&y=2 ',
        twitchFollowerRoleName: ' Follower*innen ',
        twitchLinkChannelName: '  Twitch Grüße / Spaß & Co.  ',
        twitchLinkPanelTitle: '  Grüße von Twitch  ',
        twitchLinkPanelMessage: '  Konto mit <Discord> & Twitch verbinden.  '
    });

    assert.equal(normalized.systemEnabled, false);
    assert.equal(normalized.communityCategoryName, 'Grüße & Spaß / Lounge');
    assert.equal(normalized.communityMaxChannels, 12);
    assert.equal(normalized.communityEmptyTimeoutSeconds, 90);
    assert.equal(normalized.communityVotingChannelName, 'Vorschläge-ÄÖÜ');
    assert.equal(normalized.communityVotingDurationHours, 72);
    assert.equal(normalized.adminUiUsername, 'Jörg Admin');
    assert.equal(normalized.adminUiToken, 'päss<&>"\'');
    assert.equal(normalized.musicRoleName, 'Grüße & Spaß');
    assert.equal(normalized.audioDbApiKey, 'Schlüssel/123');
    assert.equal(normalized.welcomeTitle, 'Grüße 👋 <Team>');
    assert.deepEqual(normalized.welcomeRoles, [{ emoji: '🎮', name: 'Zocker*innen', description: 'Spaß & Freunde <3' }]);
    assert.equal(normalized.twitchLinkChannelName, 'twitch-grüße-spaß-co');
    assert.equal(normalized.twitchLinkPanelMessage, 'Konto mit <Discord> & Twitch verbinden.');

    assert.equal(server.normalize({ ...validConfig(), communityVotingDurationDays: 7 }).communityVotingDurationHours, 168);
    assert.equal(server.normalize({ ...validConfig(), communityVotingDurationHours: 768 }).communityVotingDurationHours, 768);
});

test('admin normalization applies defaults, limits and maximum lengths', () => {
    const server = createServer();
    const normalized = server.normalize({
        discordToken: null,
        adminUiUsername: '   ',
        adminUiToken: null,
        adminUiPort: 999999,
        adminLoginMaxFailures: 2.9,
        adminLoginBlockMinutes: 'x',
        communityMaxChannels: 0,
        communityCategoryName: 'x'.repeat(101),
        communityVotingChannelName: '',
        welcomeTitle: 'ä'.repeat(101),
        welcomeReactionPrompt: 'ü'.repeat(1001),
        twitchLinkChannelName: ' !!! / ',
        twitchLinkPanelTitle: '',
        twitchLinkPanelMessage: ''
    });
    assert.equal(normalized.adminUiUsername, 'admin');
    assert.equal(normalized.adminUiPort, 8787);
    assert.equal(normalized.adminLoginMaxFailures, 2);
    assert.equal(normalized.adminLoginBlockMinutes, 15);
    assert.equal(normalized.communityMaxChannels, 50);
    assert.equal(normalized.communityCategoryName.length, 100);
    assert.equal(normalized.welcomeTitle.length, 100);
    assert.equal(normalized.welcomeReactionPrompt.length, 1000);
    assert.equal(normalized.twitchLinkChannelName, 'twitch-verknuepfung');
});

test('admin validation covers numeric boundaries and conditional module requirements', () => {
    const server = createServer();
    const base = validConfig();
    assert.deepEqual(server.validateConfigInput(base), []);

    const numericCases = [
        ['adminUiPort', 0, 'Admin UI Port'], ['adminUiPort', 65536, 'Admin UI Port'], ['adminUiPort', 1.5, 'Admin UI Port'],
        ['adminLoginMaxFailures', 0, 'Admin Login Failure Limit'], ['adminLoginMaxFailures', 21, 'Admin Login Failure Limit'],
        ['adminLoginBlockMinutes', 0, 'Admin Login Block Duration'], ['adminLoginBlockMinutes', 1441, 'Admin Login Block Duration']
    ];
    for (const [key, value, label] of numericCases) {
        assert.ok(server.validateConfigInput({ ...base, [key]: value }).some(error => error.includes(label)));
    }

    const enabled = {
        ...base,
        musicEnabled: true, musicRoleName: ' ', audioDbApiKey: '', audioDbApiVersion: 'v3',
        communityEnabled: true, communityCategoryName: '', communityMaxChannels: 51, communityEmptyTimeoutSeconds: 0,
        communityVotingEnabled: true, communityVotingChannelName: '', communityVotingDurationHours: 769,
        welcomeEnabled: true, welcomeChannelId: '', welcomeTitle: '', welcomeReactionPrompt: '', welcomeReactionInstructions: '', welcomeRoles: [],
        twitchEnabled: true, twitchBroadcasterName: '', twitchClientId: '', twitchClientSecret: '', twitchRedirectUri: '', twitchLinkChannelName: '', twitchLinkPanelTitle: '', twitchLinkPanelMessage: '', twitchFollowerRoleName: '', twitchSubscriberRoleName: ''
    };
    const errors = server.validateConfigInput(enabled);
    assert.ok(errors.length >= 19);
    assert.ok(errors.some(error => error.includes('At least one Welcome Role')));
    assert.ok(errors.some(error => error.includes('At least one Twitch role name')));

    const roleErrors = server.validateConfigInput({ ...base, welcomeEnabled: true, welcomeChannelId: '1', welcomeTitle: 'Grüße', welcomeReactionPrompt: 'Wähle', welcomeReactionInstructions: 'Klick', welcomeRoles: [{ emoji: ' ', name: '', description: '' }] });
    assert.equal(roleErrors.filter(error => error.includes('Welcome Role 1')).length, 3);
    assert.deepEqual(server.validateConfigInput({ ...base, adminUiToken: '' }, true), []);
});

test('admin validation reports every global required field independently', () => {
    const server = createServer();
    const base = validConfig();
    const requiredCases = [
        ['discordToken', 'Discord Token'],
        ['adminUiUsername', 'Admin Username'],
        ['adminUiToken', 'Admin Password']
    ];

    for (const [field, label] of requiredCases) {
        const errors = server.validateConfigInput({ ...base, [field]: ' \t\r\n ' });
        assert.ok(errors.some(error => error === `${label} is required.`), `${label} was not reported`);
    }

    assert.deepEqual(server.validateConfigInput({ ...base, adminUiToken: '   ' }, true), []);
});

test('admin HTML escaping and SQLite rewriting handle special characters safely', () => {
    const server = createServer();
    assert.equal(server.escapeHtml(`<Grüße & "Jörg's">`), '&lt;Grüße &amp; &quot;Jörg&#39;s&quot;&gt;');
    const simple = server.renderSimpleHtml('Fehler <&>', `Ungültig: ${server.escapeHtml('äöü <script>')}`);
    assert.match(simple, /Fehler &lt;&amp;&gt;/);
    assert.doesNotMatch(simple, /<script>/);
    const page = server.renderHtml('Jörg <Admin>');
    assert.match(page, /admin\/app\.js/);
    assert.match(page, /Jörg <Admin>/);

    assert.equal(server.rewriteSqliteWebLocation('/table/Grüße?q=ä#x'), '/admin/sqlite/table/Grüße?q=ä#x');
    assert.equal(server.rewriteSqliteWebLocation('/admin/sqlite/table'), '/admin/sqlite/table');
    assert.equal(server.rewriteSqliteWebLocation('http://sqlite-web:8080/a?x=1#b'), '/admin/sqlite/a?x=1#b');
    assert.equal(server.rewriteSqliteWebLocation('https://example.com/a'), 'https://example.com/a');
    assert.equal(server.rewriteSqliteWebLocation('relative/path'), '/admin/sqlite/relative/path');
    const rewritten = server.rewriteSqliteWebHtml('<html><body><a href="/x">Grüße</a><form action="/save"></form><style>.x{background:url(/a.png)}</style></body></html>');
    assert.match(rewritten, /href="\/admin\/sqlite\/x"/);
    assert.match(rewritten, /action="\/admin\/sqlite\/save"/);
    assert.match(rewritten, /url\(\/admin\/sqlite\/a\.png\)/);
});

test('restart detection reports only restart-relevant fields', () => {
    const server = createServer();
    const previous = validConfig();
    assert.deepEqual(server.getRestartRequirement(previous, { ...previous, welcomeTitle: 'Grüße' }), { required: false, fields: [] });
    const result = server.getRestartRequirement(previous, { ...previous, discordToken: 'neu', musicEnabled: true, musicYoutubeSearchLimit: 99 });
    assert.equal(result.required, true);
    assert.deepEqual(result.fields, ['Modul Musik', 'Discord Token', 'Music YouTube Search Limit']);
});