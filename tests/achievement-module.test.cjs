const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

class Builder {
    constructor() { this.data = {}; this.components = []; }
    setName(value) { this.data.name = value; return this; }
    setDescription(value) { this.data.description = value; return this; }
    addUserOption(callback) { callback(new Builder()); return this; }
    addStringOption(callback) { callback(new Builder()); return this; }
    addChoices(...value) { this.data.choices = value; return this; }
    setCustomId(value) { this.data.customId = value; return this; }
    setPlaceholder(value) { this.data.placeholder = value; return this; }
    addOptions(value) { this.data.options = value; return this; }
    setLabel(value) { this.data.label = value; return this; }
    setStyle(value) { this.data.style = value; return this; }
    setDisabled(value) { this.data.disabled = value; return this; }
    addComponents(...value) { this.components.push(...value); return this; }
    setColor(value) { this.data.color = value; return this; }
    setTitle(value) { this.data.title = value; return this; }
    setDescription(value) { this.data.description = value; return this; }
    setFooter(value) { this.data.footer = value; return this; }
    addFields(value) { this.data.fields = [...(this.data.fields || []), value]; return this; }
}

function load() {
    const commandPath = path.resolve('src/commands/system/AchievementsCommand.ts');
    const commandOutput = ts.transpileModule(fs.readFileSync(commandPath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const commandExports = {};
    const discord = { ActionRowBuilder: Builder, ButtonBuilder: Builder, StringSelectMenuBuilder: Builder, EmbedBuilder: Builder, SlashCommandBuilder: Builder, ButtonStyle: { Secondary: 2 } };
    vm.runInNewContext(commandOutput, { exports: commandExports, require: name => name === 'discord.js' ? discord : require(name) }, { filename: commandPath });
    const modulePath = path.resolve('src/modules/AchievementModule.ts');
    const moduleOutput = ts.transpileModule(fs.readFileSync(modulePath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const moduleExports = {};
    vm.runInNewContext(moduleOutput, { exports: moduleExports, require: name => name === 'discord.js' ? discord : name === '../commands/system/AchievementsCommand' ? commandExports : require(name) }, { filename: modulePath });
    return moduleExports.AchievementModule;
}

const catalog = Array.from({ length: 7 }, (_, index) => ({
    id: `series-${index}`, name: `Serie ${index}`, description: `Beschreibung ${index}`, category: index % 2 ? 'music' : 'general', icon: '*', hidden: index === 6,
    tiers: ['bronze', 'silver', 'gold'].map((medal, tier) => ({ id: `series-${index}-${medal}`, medal, target: tier + 1, points: [10, 25, 50][tier] }))
}));

function fixture(settings = {}) {
    const service = {
        getGuildSettings: () => ({ publicProfilesEnabled: true, hiddenEnabled: true, enabledCategories: new Set(['general', 'music']), ...settings }),
        getCatalog: () => catalog,
        getUserState: async () => ({ progress: [{ seriesId: 'series-0', progress: 1, updatedAt: 1 }], unlocks: [{ achievementId: 'series-0-bronze', unlockedAt: 1 }] })
    };
    return new (load())('guild-a', service);
}

function commandInteraction(extra = {}) {
    const calls = [];
    return {
        calls, guildId: extra.guildId ?? 'guild-a', user: { id: 'viewer' },
        options: { getUser: () => extra.target ? { id: extra.target } : null, getString: () => extra.filter ?? null },
        reply: async payload => calls.push(payload)
    };
}

test('achievement command renders private and public paginated views with filters', async () => {
    const module = fixture();
    const command = module.getCommands()[0];
    const own = commandInteraction(); await command.execute(own);
    assert.equal(own.calls[0].ephemeral, true);
    assert.match(own.calls[0].embeds[0].data.description, /1 \/ 21/);
    assert.equal(own.calls[0].components[1].components[1].data.disabled, false);
    const publicView = commandInteraction({ target: 'other', filter: 'music' }); await command.execute(publicView);
    assert.equal(publicView.calls[0].ephemeral, false);
    assert.equal(publicView.calls[0].embeds[0].data.fields.length, 3);
    const blocked = commandInteraction({ target: 'other' }); await fixture({ publicProfilesEnabled: false }).getCommands()[0].execute(blocked);
    assert.match(blocked.calls[0].content, /deaktiviert/);
    const wrongGuild = commandInteraction({ guildId: 'guild-b' }); await command.execute(wrongGuild);
    assert.match(wrongGuild.calls[0].content, /nicht aktiv/);
});

test('achievement components enforce viewer and guild and update page and filter', async () => {
    const module = fixture();
    const calls = [];
    const interaction = { guildId: 'guild-a', user: { id: 'viewer' }, update: async value => calls.push(['update', value]), reply: async value => calls.push(['reply', value]), values: ['progress'] };
    assert.equal(await module.handleButtonInteraction('other', interaction), false);
    assert.equal(await module.handleButtonInteraction('achievements:page:viewer:viewer:all:1', interaction), true);
    assert.equal(calls[0][0], 'update');
    assert.equal(await module.handleStringSelectInteraction('achievements:filter:viewer:viewer:0', interaction), true);
    assert.equal(calls[1][0], 'update');
    const foreign = { ...interaction, user: { id: 'foreign' } };
    assert.equal(await module.handleButtonInteraction('achievements:page:viewer:viewer:all:0', foreign), true);
    assert.equal(calls.at(-1)[0], 'reply');
    assert.equal(await module.handleButtonInteraction('achievements:page:viewer:viewer:all:0', { ...interaction, guildId: 'guild-b' }), false);
    assert.equal(await module.handleButtonInteraction('achievements:page:broken', interaction), true);
    const empty = commandInteraction({ filter: 'twitch' }); await module.getCommands()[0].execute(empty);
    assert.equal(empty.calls[0].embeds[0].data.fields[0].name, 'Keine Treffer');
});
