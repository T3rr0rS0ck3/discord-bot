const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { Collection } = require('discord.js');

require.extensions['.ts'] = (module, file) => {
    module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText, file);
};

const { TwitchRoleModule } = require('../src/modules/TwitchRoleModule.ts');

function member(id, roleIds = []) {
    const cache = new Collection(roleIds.map(roleId => [roleId, { id: roleId }]));
    const calls = [];
    return {
        id,
        calls,
        roles: {
            cache,
            add: async roleId => { calls.push(['add', roleId]); cache.set(roleId, { id: roleId }); },
            remove: async roleId => { calls.push(['remove', roleId]); cache.delete(roleId); }
        }
    };
}

test('Twitch role sync uses only persisted member links and stable Twitch user IDs', async () => {
    const linked = member('discord-linked', ['subscriber-role']);
    const unlinked = member('discord-unlinked', ['follower-role']);
    const members = new Collection([[linked.id, linked], [unlinked.id, unlinked]]);
    const module = new TwitchRoleModule({
        guildId: 'guild',
        followerRoleName: 'Follower',
        subscriberRoleName: 'Subscriber',
        getMemberLinks: async () => [{
            guildId: 'guild', discordUserId: linked.id, twitchUserId: 'twitch-123',
            twitchLogin: 'renamed-login', twitchDisplayName: 'Renamed Login', linkedAt: 1
        }]
    });
    module.client = { guilds: { cache: new Collection([['guild', { members: { cache: members, fetch: async id => id ? members.get(id) : members } }]]) } };
    module.followerRoleId = 'follower-role';
    module.subscriberRoleId = 'subscriber-role';
    module.twitchService.getFollowerUserIds = async () => new Set(['twitch-123']);
    module.twitchService.getSubscriberUserIds = async () => new Set();

    await module.syncNow();

    assert.deepEqual(linked.calls, [['remove', 'subscriber-role'], ['add', 'follower-role']]);
    assert.deepEqual(unlinked.calls, []);
});

test('Twitch API failures preserve existing roles and persist a failed sync result', async () => {
    const linked = member('discord-linked', ['follower-role']);
    const savedResults = [];
    const members = new Collection([[linked.id, linked]]);
    const module = new TwitchRoleModule({
        guildId: 'guild',
        followerRoleName: 'Follower',
        getMemberLinks: async () => [{
            guildId: 'guild', discordUserId: linked.id, twitchUserId: 'twitch-123',
            twitchLogin: 'streamer', twitchDisplayName: 'Streamer', linkedAt: 1
        }],
        saveSyncResult: async result => savedResults.push(result)
    });
    module.client = { guilds: { cache: new Collection([['guild', { members: { cache: members, fetch: async () => members } }]]) } };
    module.followerRoleId = 'follower-role';
    module.twitchService.getFollowerUserIds = async () => { throw new Error('Twitch unavailable'); };

    const result = await module.syncNow();

    assert.equal(result.successful, false);
    assert.match(result.error, /Twitch unavailable/);
    assert.deepEqual(linked.calls, []);
    assert.equal(savedResults.length, 1);
    assert.equal(savedResults[0].successful, false);
});