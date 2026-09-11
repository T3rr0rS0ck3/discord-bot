const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { EventEmitter } = require('node:events');

function fixture() {
    const files = new Map(), timers = new Set(), errors = [];
    const disk = {
        readFile: async p => { if (!files.has(p)) throw Object.assign(new Error(), { code: 'ENOENT' }); return files.get(p); },
        mkdir: async () => {}, writeFile: async (p, value) => { files.set(p, value); },
        rename: async (a, b) => { files.set(b, files.get(a)); files.delete(a); }
    };
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/modules/CommunityModule.ts', 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText, {
        exports,
        require: name => name === 'node:fs' ? { promises: disk } : name === 'discord.js' ? { ChannelType: { GuildCategory: 4, GuildVoice: 2 } } : require(name),
        console: { log() {}, error: (...args) => errors.push(args) },
        setTimeout: (fn, ms) => { const timer = { fn, ms }; timers.add(timer); return timer; },
        clearTimeout: timer => timers.delete(timer)
    });
    let nextId = 100;
    const cache = new Map();
    const guild = { id: '123', channels: { cache, fetch: async () => cache, create: async options => {
        const channel = { id: String(nextId++), type: options.type, name: options.name, parentId: options.parent,
            members: new Map(), setName: async name => { channel.name = name; },
            setParent: async id => { channel.parentId = id; }, delete: async () => { cache.delete(channel.id); } };
        cache.set(channel.id, channel); return channel;
    } } };
    const client = new EventEmitter(); client.guilds = { fetch: async () => guild };
    const create = () => new exports.CommunityModule({ guildId: '123', communityCategoryName: 'Community', communityEmptyTimeoutSeconds: 60, getCommunityChannelNames: async () => ['raidabend', 'wipe-crew', 'gaming'] });
    const move = (mod, member, id) => {
        const before = member.voice.channelId;
        cache.get(before)?.members.delete(member.id);
        member.voice.channelId = id;
        cache.get(id)?.members.set(member.id, member);
        client.emit('voiceStateUpdate', { channelId: before }, { channelId: id, guild, member });
        return mod.pending;
    };
    const member = { id: '7', displayName: 'Robin', user: { bot: false }, voice: {} };
    return { create, cache, client, timers, errors, member, move };
}

test('create, move, cancel deletion, timeout and restart recovery', async () => {
    const f = fixture(); let mod = f.create();
    await mod.onReady(f.client);
    assert.equal(f.cache.size, 2);
    const category = [...f.cache.values()].find(c => c.type === 4);
    const entry = [...f.cache.values()].find(c => c.type === 2);
    f.member.voice.setChannel = async room => { void f.move(mod, f.member, room.id); };
    await f.move(mod, f.member, entry.id); await mod.pending;
    const room = [...f.cache.values()].find(c => c.type === 2 && c.id !== entry.id);
    assert.equal(f.member.voice.channelId, room.id);
    assert.equal(f.timers.size, 0);
    await f.move(mod, f.member, null);
    assert.equal([...f.timers][0].ms, 60000);
    const stale = [...f.timers][0];
    await f.move(mod, f.member, room.id);
    stale.fn(); await mod.pending;
    assert.ok(f.cache.has(room.id));
    await mod.applyRuntimeConfig({ communityCategoryName: 'Treffpunkt', communityEmptyTimeoutSeconds: 5 });
    assert.equal(category.name, 'Treffpunkt');
    await f.move(mod, f.member, null);
    assert.equal([...f.timers][0].ms, 5000);
    await mod.shutdown(); assert.equal(f.timers.size, 0);
    mod = f.create(); await mod.onReady(f.client);
    assert.equal(f.cache.size, 3);
    assert.equal(f.timers.size, 1);
    [...f.timers][0].fn(); await mod.pending;
    assert.equal(f.cache.has(room.id), false);
    assert.ok(f.cache.has(entry.id));
    assert.deepEqual(f.errors, []);
    await mod.shutdown();
});

test('failed move cleans empty room, unrelated room is protected', async () => {
    const f = fixture(), mod = f.create(); await mod.onReady(f.client);
    const entry = [...f.cache.values()].find(c => c.type === 2);
    const unrelated = { id: '900', type: 2, members: new Map() }; f.cache.set('900', unrelated);
    mod.scheduleDeletion('900'); assert.equal(f.timers.size, 0);
    f.member.voice.setChannel = async () => { throw new Error('Missing Move Members'); };
    await f.move(mod, f.member, entry.id);
    assert.equal(f.timers.size, 1);
    [...f.timers][0].fn(); await mod.pending;
    assert.equal(f.cache.size, 3);
    assert.ok(f.cache.has('900')); assert.ok(f.cache.has(entry.id));
    await mod.shutdown();
});

test('startup adopts existing category and entry channel when persisted IDs are missing', async () => {
    const f = fixture();
    const category = { id: 'existing-category', type: 4, name: 'Community', parentId: null, setName: async name => { category.name = name; }, delete: async () => f.cache.delete(category.id) };
    const entry = { id: 'existing-entry', type: 2, name: '➕ Sprachkanal erstellen', parentId: null, members: new Map(), setParent: async id => { entry.parentId = id; }, delete: async () => f.cache.delete(entry.id) };
    f.cache.set(category.id, category);
    f.cache.set(entry.id, entry);

    const mod = f.create();
    await mod.onReady(f.client);

    assert.equal([...f.cache.values()].filter(channel => channel.type === 4).length, 1);
    assert.equal([...f.cache.values()].filter(channel => channel.type === 2 && channel.name === '➕ Sprachkanal erstellen').length, 1);
    assert.equal(entry.parentId, category.id);
    assert.equal(mod.state.categoryId, category.id);
    assert.equal(mod.state.entryId, entry.id);
    await mod.shutdown();
});

test('startup repairs empty duplicate category and entry from a faulty previous version', async () => {
    const f = fixture();
    const usedCategory = { id: 'old-category', type: 4, name: 'Community', parentId: null, delete: async () => f.cache.delete('old-category') };
    const duplicateCategory = { id: 'new-category', type: 4, name: 'Community', parentId: null, delete: async () => f.cache.delete('new-category') };
    const usedEntry = { id: 'old-entry', type: 2, name: '➕ Sprachkanal erstellen', parentId: usedCategory.id, members: new Map(), setParent: async id => { usedEntry.parentId = id; }, delete: async () => f.cache.delete('old-entry') };
    const activeRoom = { id: 'active-room', type: 2, name: 'Gaming', parentId: usedCategory.id, members: new Map([['user', {}]]) };
    const duplicateEntry = { id: 'new-entry', type: 2, name: '➕ Sprachkanal erstellen', parentId: duplicateCategory.id, members: new Map(), setParent: async id => { duplicateEntry.parentId = id; }, delete: async () => f.cache.delete('new-entry') };
    f.cache.set(usedCategory.id, usedCategory);
    f.cache.set(duplicateCategory.id, duplicateCategory);
    f.cache.set(usedEntry.id, usedEntry);
    f.cache.set(activeRoom.id, activeRoom);
    f.cache.set(duplicateEntry.id, duplicateEntry);

    const mod = f.create();
    mod.state = { categoryId: duplicateCategory.id, entryId: duplicateEntry.id, temporaryIds: [] };
    await mod.onReady(f.client);

    assert.equal(mod.state.categoryId, usedCategory.id);
    assert.equal(mod.state.entryId, usedEntry.id);
    assert.equal(f.cache.has(duplicateEntry.id), false);
    assert.equal(f.cache.has(duplicateCategory.id), false);
    assert.equal(f.cache.has(activeRoom.id), true);
    await mod.shutdown();
});

test('manual deletion deletes only the selected empty managed temporary room', async () => {
    const f = fixture(), mod = f.create(); await mod.onReady(f.client);
    const category = [...f.cache.values()].find(c => c.type === 4);
    const entry = [...f.cache.values()].find(c => c.type === 2);
    const emptyManaged = { id: '701', type: 2, name: 'empty', parentId: category.id, members: new Map(), delete: async () => f.cache.delete('701') };
    const occupiedManaged = { id: '702', type: 2, name: 'occupied', parentId: category.id, members: new Map([['user', {}]]), delete: async () => f.cache.delete('702') };
    const unrelated = { id: '703', type: 2, name: 'unrelated', parentId: category.id, members: new Map(), delete: async () => f.cache.delete('703') };
    f.cache.set('701', emptyManaged); f.cache.set('702', occupiedManaged); f.cache.set('703', unrelated);
    mod.state.temporaryIds.push('701', '702');

    await mod.deleteManagedChannel('701');

    assert.equal(f.cache.has('701'), false);
    assert.equal(f.cache.has('702'), true);
    assert.equal(f.cache.has('703'), true);
    assert.equal(f.cache.has(entry.id), true);
    assert.deepEqual([...mod.state.temporaryIds], ['702']);
    await assert.rejects(mod.deleteManagedChannel('702'), /Belegte Sprachkanäle/);
    await assert.rejects(mod.deleteManagedChannel('703'), /nicht vom Community-Modul verwaltet/);
    await mod.shutdown();
});

test('random imported names, cap, live lowering and freed capacity', async () => {
    const f = fixture(), mod = f.create(); await mod.onReady(f.client);
    await mod.applyRuntimeConfig({ communityCategoryName: 'Community', communityMaxChannels: 2 });
    const entry = [...f.cache.values()].find(c => c.type === 2);
    let disconnected = 0;
    f.member.voice.disconnect = async () => { disconnected++; f.member.voice.channelId = null; };
    f.member.voice.setChannel = async room => { void f.move(mod, f.member, room.id); };
    await f.move(mod, f.member, entry.id); await mod.pending;
    await f.move(mod, f.member, entry.id); await mod.pending;
    const rooms = [...f.cache.values()].filter(c => c.type === 2 && c.id !== entry.id);
    const names = ['raidabend', 'wipe-crew', 'gaming'];
    assert.equal(rooms.length, 1);
    assert.ok(rooms.every(c => names.includes(c.name)));
    await f.move(mod, f.member, entry.id); await mod.pending;
    assert.equal(disconnected, 2); assert.equal(f.cache.size, 3);
    await mod.applyRuntimeConfig({ communityCategoryName: 'Community', communityMaxChannels: 1 });
    assert.equal(f.cache.size, 3); // Lowering the cap never deletes existing rooms.
    await f.move(mod, f.member, entry.id); await mod.pending;
    assert.equal(disconnected, 3);
    rooms.forEach(room => f.cache.delete(room.id));
    await f.move(mod, f.member, entry.id); await mod.pending;
    assert.equal(disconnected, 4);
    assert.equal(f.cache.size, 2); assert.equal(mod.state.temporaryIds.length, 0);
    await mod.shutdown();
});

test('category capacity includes entry and unrelated channels; no overflow category', async () => {
    const f = fixture(), mod = f.create(); await mod.onReady(f.client);
    const category = [...f.cache.values()].find(c => c.type === 4);
    const entry = [...f.cache.values()].find(c => c.type === 2);
    for(let i = 0; i < 49; i++) f.cache.set(String(1000+i), { id: String(1000+i), type: 2, parentId: category.id, members: new Map() });
    let disconnected = false;
    f.member.voice.disconnect = async () => { disconnected = true; };
    await f.move(mod, f.member, entry.id);
    assert.equal(disconnected, true);
    assert.equal(f.cache.size, 51);
    assert.equal([...f.cache.values()].filter(c => c.type === 4).length, 1);
    assert.equal(mod.state.temporaryIds.length, 0);
    await mod.shutdown();
});
