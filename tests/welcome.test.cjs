const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { Collection, ComponentType } = require('discord.js');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const { WelcomeModule } = require('../src/modules/WelcomeModule.ts');
const { RoleService } = require('../src/services/RoleService.ts');
RoleService.ensureRoles = async () => [];

async function fixture() {
    const calls = [], payloads = [];
    const message = { id: 'message', author: { id: 'bot' }, content: '# Welcome!', edit: async p => payloads.push(p), pin: async () => {}, reactions: { removeAll: async () => calls.push('remove-reactions') } };
    const channel = { isTextBased: () => true, isDMBased: () => false, messages: { fetch: async () => new Collection([['message', message]]) }, permissionOverwrites: { edit: async () => {} } };
    const roles = new Collection([['gaming', { id: 'gaming', name: 'Gaming', editable: true, managed: false }], ['admin', { id: 'admin', name: 'Admin', editable: true, managed: false }]]);
    const member = { roles: { add: async id => calls.push(['add', id]), remove: async id => calls.push(['remove', id]) } };
    const guild = { roles: { cache: roles, fetch: async () => {}, everyone: {} }, channels: { fetch: async () => channel }, members: { fetch: async () => member } };
    const client = { user: { id: 'bot' }, guilds: { fetch: async () => guild } };
    const module = new WelcomeModule({ guildId: 'guild', welcomeChannelId: 'channel', roles: [{ name: 'Gaming', emoji: '🎮', description: 'Gaming' }] });
    await module.onReady(client);
    const replies = [];
    const interaction = { customId: 'welcome:roles:add', inCachedGuild: () => true, guildId: 'guild', channelId: 'channel', guild, message, client, user: { id: 'user' }, values: ['gaming'], deferReply: async () => {}, reply: async p => replies.push(p), editReply: async p => replies.push(p) };
    return { module, interaction, calls, payloads, replies, roles };
}

test('existing reaction message migrates to native role selects; scoped add and remove work', async () => {
    const f = await fixture();
    assert.ok(f.calls.includes('remove-reactions'));
    const rows = f.payloads[0].components.map(row => row.toJSON());
    assert.equal(rows.length, 2);
    assert.equal(rows[0].components[0].type, ComponentType.RoleSelect);
    assert.equal(rows[1].components[0].custom_id, 'welcome:roles:remove');
    assert.equal(typeof f.module.handleMessageReactionAdd, 'undefined');
    assert.equal(await f.module.handleRoleSelectInteraction(f.interaction), true);
    f.interaction.customId = 'welcome:roles:remove';
    await f.module.handleRoleSelectInteraction(f.interaction);
    assert.deepEqual(f.calls.filter(Array.isArray), [['add', 'gaming'], ['remove', 'gaming']]);
});

test('unapproved and unmanageable roles reject entire selection; stale messages cannot assign', async () => {
    const f = await fixture();
    f.interaction.values = ['gaming', 'admin'];
    await f.module.handleRoleSelectInteraction(f.interaction);
    assert.equal(f.calls.filter(Array.isArray).length, 0);
    f.interaction.values = ['gaming']; f.roles.get('gaming').managed = true;
    await f.module.handleRoleSelectInteraction(f.interaction);
    assert.equal(f.calls.filter(Array.isArray).length, 0);
    f.roles.get('gaming').managed = false;
    f.interaction.message = { ...f.interaction.message, id: 'stale' };
    await f.module.handleRoleSelectInteraction(f.interaction);
    assert.equal(f.calls.filter(Array.isArray).length, 0);
    assert.ok(f.replies.at(-1).ephemeral);
});
