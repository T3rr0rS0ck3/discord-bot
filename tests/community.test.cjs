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
