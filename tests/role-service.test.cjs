const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, file) => {
    module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText, file);
};
const { RoleService } = require('../src/services/RoleService.ts');

function fixture(canManage = true) {
    const roles = [
        { id: '1', name: 'Grüße & Spaß', delete: async () => {}, edit: async patch => Object.assign(roles[0], patch) },
        { id: '2', name: 'ÄÖÜß', delete: async () => {}, edit: async patch => Object.assign(roles[1], patch) }
    ];
    roles.find = Array.prototype.find.bind(roles);
    roles.some = Array.prototype.some.bind(roles);
    const created = [];
    const guild = {
        name: 'Jörgs Server / Test',
        roles: { cache: roles, create: async config => { const role = { id: '3', ...config }; created.push(role); roles.push(role); return role; } },
        members: { me: { permissions: { has: () => canManage } }, fetchMe: async () => ({ permissions: { has: () => canManage } }) }
    };
    return { guild, roles, created };
}

test('role lookup and member access preserve exact Unicode names', () => {
    const { guild, roles } = fixture();
    const member = { roles: { cache: roles } };
    assert.equal(RoleService.findRoleByName(guild, 'Grüße & Spaß').id, '1');
    assert.equal(RoleService.findRoleByName(guild, 'grüße & spaß'), undefined);
    assert.equal(RoleService.findRoleById(guild, '2').name, 'ÄÖÜß');
    assert.equal(RoleService.memberHasRoleName(member, '  Grüße & Spaß  '), true);
    assert.equal(RoleService.memberHasRoleName(member, '   '), false);
    assert.equal(RoleService.memberHasAnyRoleName(member, ['', ' ÄÖÜß ', 'fehlend']), true);
    assert.equal(RoleService.hasAccess(member, ['fehlend']), false);
    assert.equal(RoleService.hasAccess(member, []), false);
});

test('role creation applies defaults, explicit flags and permission checks', async () => {
    const allowed = fixture(true);
    const role = await RoleService.createRole(allowed.guild, { name: 'Neue Rolle / Grüße', mentionable: false, hoist: true, reason: 'E2E & Test' });
    assert.equal(role.name, 'Neue Rolle / Grüße');
    assert.equal(allowed.created[0].mentionable, false);
    assert.equal(allowed.created[0].hoist, true);
    assert.equal(await RoleService.createRole(fixture(false).guild, { name: 'Nein' }), null);
    const broken = fixture(true); broken.guild.roles.create = async () => { throw new Error('Discord kaputt'); };
    assert.equal(await RoleService.createRole(broken.guild, { name: 'Fehler' }), null);
});

test('ensure, update and delete roles cover success and failure paths', async () => {
    const { guild, roles } = fixture(true);
    assert.equal((await RoleService.ensureRole(guild, { name: 'ÄÖÜß' })).id, '2');
    assert.equal((await RoleService.ensureRole(guild, { name: 'Neu' })).id, '3');
    assert.equal((await RoleService.ensureRoles(guild, [{ name: 'Grüße & Spaß' }, { name: 'Noch neu' }])).length, 2);
    assert.equal(await RoleService.updateRole(guild, '1', { name: 'Umbenannt äöü' }, 'Grund / Test'), roles[0]);
    assert.equal(roles[0].name, 'Umbenannt äöü');
    assert.equal(await RoleService.updateRole(guild, '404', { name: 'x' }), null);
    assert.equal(await RoleService.deleteRole(guild, '2', 'Aufräumen'), true);
    assert.equal(await RoleService.deleteRole(guild, '404'), false);
    assert.equal(await RoleService.deleteRole(fixture(false).guild, '1'), false);
});

test('guild role helper returns IDs and handles fetch failures', async () => {
    const { guild } = fixture(true);
    assert.equal(await RoleService.canManageRoles(guild), true);
    guild.members.me = null;
    assert.equal(await RoleService.canManageRoles(guild), true);
    assert.equal(await RoleService.ensureRoleForGuild({ guilds: { fetch: async () => guild } }, '123', { name: 'Grüße' }), '3');
    assert.equal(await RoleService.ensureRoleForGuild({ guilds: { fetch: async () => { throw new Error('weg'); } } }, '123', { name: 'x' }), null);
});