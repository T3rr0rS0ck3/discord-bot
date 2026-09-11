const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const voiceCalls = [];
const PermissionFlagsBits = { ManageMessages: 1n, ReadMessageHistory: 2n };
class Builder {
    setName() { return this; } setDescription() { return this; } setDMPermission() { return this; }
    setDefaultMemberPermissions() { return this; } addSubcommand(callback) { callback(new Builder()); return this; }
}
class GuildMember {}

function load(name) {
    const sourcePath = path.resolve(`src/commands/system/${name}.ts`);
    const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
        fileName: sourcePath,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, inlineSourceMap: true, inlineSources: true }
    }).outputText;
    const exports = {};
    vm.runInNewContext(output, {
        exports,
        require: dependency => dependency === 'discord.js'
            ? { SlashCommandBuilder: Builder, PermissionFlagsBits, GuildMember }
            : dependency === '@discordjs/voice'
                ? { joinVoiceChannel: options => voiceCalls.push(options) }
                : require(dependency)
    }, { filename: sourcePath });
    return exports[name];
}

const SystemCommand = load('SystemCommand');
const ClearCommand = load('ClearCommand');
const JoinCommand = load('JoinCommand');
const PingCommand = load('PingCommand');

function permissions(...allowed) {
    return { has: permission => allowed.includes(permission) };
}

function batch(messages) {
    const values = messages.map(message => ({ id: message.id, delete: message.delete }));
    return { size: values.length, values: () => values.values(), last: () => values.at(-1) };
}

function interaction(subcommand, options = {}) {
    const calls = [];
    const messages = options.batches ?? [batch([])];
    let fetchIndex = 0;
    const voiceChannel = options.voiceChannel;
    const member = options.member ?? { voice: { channel: voiceChannel }, permissions: options.memberPermissions ?? permissions(PermissionFlagsBits.ManageMessages) };
    const channel = options.channel === undefined ? {
        isTextBased: () => true,
        messages: { fetch: async request => { calls.push(['fetch', request]); return messages[fetchIndex++] ?? batch([]); } },
        permissionsFor: () => options.botPermissions ?? permissions(PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory)
    } : options.channel;
    return {
        calls,
        guildId: 'guild-1',
        user: { id: 'user-1' },
        member,
        memberPermissions: options.memberPermissions ?? permissions(PermissionFlagsBits.ManageMessages),
        channel,
        guild: {
            voiceAdapterCreator: 'adapter',
            members: { me: options.botMember === false ? null : {}, fetch: async () => options.fetchedMember ?? member }
        },
        options: { getSubcommand: () => subcommand },
        inCachedGuild: () => options.cached !== false,
        reply: async value => calls.push(['reply', value]),
        deferReply: async value => calls.push(['defer', value]),
        editReply: async value => calls.push(['edit', value])
    };
}

test('system dispatcher handles DM, ping, unknown and voice join states', async () => {
    const command = new SystemCommand();
    const dm = interaction('ping', { cached: false }); await command.execute(dm); assert.match(dm.calls[0][1].content, /server/);
    const ping = interaction('ping'); await command.execute(ping); assert.equal(ping.calls[0][1], 'Pong! 🏓');
    const unknown = interaction('wat'); await command.execute(unknown); assert.match(unknown.calls[0][1].content, /Unknown/);
    const absent = interaction('join'); await command.execute(absent); assert.match(absent.calls[0][1].content, /voice channel/);
    const voiceChannel = { id: 'voice-äöü', isVoiceBased: () => true, toString: () => '#Grüße' };
    const joined = interaction('join', { fetchedMember: { voice: { channel: voiceChannel } } }); await command.execute(joined);
    assert.equal(voiceCalls.at(-1).channelId, 'voice-äöü');
    assert.match(joined.calls.at(-1)[1], /Grüße/);
});

test('system clear checks channel and permissions before deleting paginated messages', async () => {
    const command = new SystemCommand();
    for (const [options, expected] of [
        [{ channel: null }, /does not support/],
        [{ memberPermissions: permissions() }, /Manage Messages/],
        [{ botMember: false }, /resolve bot/],
        [{ channel: { isTextBased: () => true, messages: {} } }, /permission checks/],
        [{ botPermissions: permissions(PermissionFlagsBits.ManageMessages) }, /missing channel permissions/]
    ]) {
        const current = interaction('clear', options); await command.execute(current); assert.match(current.calls[0][1].content, expected);
    }
    let deleted = 0;
    const current = interaction('clear', { batches: [batch([
        { id: 'm2', delete: async () => { deleted++; } },
        { id: 'm1', delete: async () => { throw new Error('already gone'); } }
    ]), batch([])] });
    await command.execute(current);
    assert.equal(deleted, 1);
    assert.equal(current.calls.find(call => call[0] === 'edit')[1], 'Done. Deleted 1 messages from the current channel.');
    assert.equal(current.calls.filter(call => call[0] === 'fetch')[1][1].before, 'm1');
});

test('standalone ping, join and clear cover guards and successful cleanup', async () => {
    const ping = interaction('ping'); await new PingCommand().execute(ping); assert.equal(ping.calls[0][1], 'Pong! 🏓');
    const dm = interaction('join', { cached: false }); await new JoinCommand().execute(dm); assert.match(dm.calls[0][1].content, /server/);
    const absent = interaction('join'); await new JoinCommand().execute(absent); assert.match(absent.calls[0][1].content, /voice channel/);
    const voiceChannel = { id: 'v1', isVoiceBased: () => true, toString: () => '#Musik' };
    const joined = interaction('join', { voiceChannel }); await new JoinCommand().execute(joined); assert.match(joined.calls[0][1], /Musik/);

    const noPermission = interaction('clear', { memberPermissions: permissions() });
    await new ClearCommand().execute(noPermission); assert.match(noPermission.calls[0][1].content, /Manage Messages/);
    const clearDm = interaction('clear', { cached: false }); await new ClearCommand().execute(clearDm); assert.match(clearDm.calls[0][1].content, /server/);
    const nonText = interaction('clear', { channel: { isTextBased: () => false } }); await new ClearCommand().execute(nonText); assert.match(nonText.calls[0][1].content, /does not support/);
    const noBot = interaction('clear', { botMember: false }); await new ClearCommand().execute(noBot); assert.match(noBot.calls[0][1].content, /resolve bot/);
    const missingManage = interaction('clear', { botPermissions: permissions(PermissionFlagsBits.ReadMessageHistory) }); await new ClearCommand().execute(missingManage); assert.match(missingManage.calls[0][1].content, /missing channel/);
    const missingHistory = interaction('clear', { botPermissions: permissions(PermissionFlagsBits.ManageMessages) }); await new ClearCommand().execute(missingHistory); assert.match(missingHistory.calls[0][1].content, /missing channel/);
    const cleaned = interaction('clear', { batches: [batch([{ id: '1', delete: async () => {} }]), batch([])] });
    await new ClearCommand().execute(cleaned); assert.match(cleaned.calls.at(-1)[1], /Deleted 1/);
});