const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { Collection } = require('discord.js');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const { WelcomeModule } = require('../src/modules/WelcomeModule.ts');
const { RoleService } = require('../src/services/RoleService.ts');
RoleService.ensureRoles = async () => [];

async function fixture() {
    const calls = [], payloads = [];
    const message = { id: 'message', author: { id: 'bot' }, content: '# Welcome!', edit: async p => payloads.push(p), pin: async () => {}, react: async emoji => calls.push(['react', emoji]), reactions: { removeAll: async () => calls.push('remove-reactions') } };
    const channel = { isTextBased: () => true, isDMBased: () => false, messages: { fetch: async () => new Collection([['message', message]]) }, permissionOverwrites: { edit: async () => {} } };
    const roles = new Collection([['gaming', { id: 'gaming', name: 'Gaming', editable: true, managed: false }], ['admin', { id: 'admin', name: 'Admin', editable: true, managed: false }]]);
    const memberRoleCache = new Collection();
    const member = { user: { tag: 'tester' }, roles: { cache: memberRoleCache, add: async role => { calls.push(['add', role.id]); memberRoleCache.set(role.id, role); }, remove: async role => { calls.push(['remove', role.id]); memberRoleCache.delete(role.id); } } };
    const guild = { roles: { cache: roles, fetch: async () => {}, everyone: {} }, channels: { fetch: async () => channel }, members: { fetch: async () => member } };
    const client = { user: { id: 'bot' }, guilds: { fetch: async () => guild } };
    const module = new WelcomeModule({ guildId: 'guild', welcomeChannelId: 'channel', roles: [{ name: 'Gaming', emoji: '🎮', description: 'Gaming' }] });
    await module.onReady(client);
    const reaction = { message: { channelId: 'channel', guild }, emoji: { id: null, name: '🎮', toString: () => '🎮' } };
    const user = { id: 'user' };
    return { module, reaction, user, calls, payloads };
}

test('existing welcome message is refreshed and matching reactions add and remove roles', async () => {
    const f = await fixture();
    assert.ok(f.calls.includes('remove-reactions'));
    assert.deepEqual(f.calls.filter(call => Array.isArray(call) && call[0] === 'react'), [['react', '🎮']]);
    assert.match(f.payloads[0].content, /Gaming/);
    assert.equal(await f.module.handleMessageReactionAdd(f.reaction, f.user), true);
    assert.equal(await f.module.handleMessageReactionRemove(f.reaction, f.user), true);
    assert.deepEqual(f.calls.filter(call => Array.isArray(call) && ['add', 'remove'].includes(call[0])), [['add', 'gaming'], ['remove', 'gaming']]);
});

test('unknown emojis and reactions outside the welcome channel are ignored', async () => {
    const f = await fixture();
    f.reaction.emoji.name = '❌';
    f.reaction.emoji.toString = () => '❌';
    assert.equal(await f.module.handleMessageReactionAdd(f.reaction, f.user), false);

    f.reaction.emoji.name = '🎮';
    f.reaction.emoji.toString = () => '🎮';
    f.reaction.message.channelId = 'other-channel';
    assert.equal(await f.module.handleMessageReactionAdd(f.reaction, f.user), false);
    assert.deepEqual(f.calls.filter(call => Array.isArray(call) && ['add', 'remove'].includes(call[0])), []);
});
