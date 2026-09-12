const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
const sourcePath = path.resolve('src/modules/BotModuleFactory.ts');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    fileName: sourcePath,
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        inlineSourceMap: true,
        inlineSources: true
    }
}).outputText;
vm.runInNewContext(output, {
    exports: exportsObject,
    require: name => {
        const className = name.split('/').pop();
        return { [className]: class { constructor(options) { this.name = className; this.options = options; } } };
    }
}, { filename: sourcePath });
const create = options => Array.from(exportsObject.BotModuleFactory.create(options), m => m.name);
    const configured = {
        systemEnabled: true,
        musicEnabled: true,
        communityEnabled: true,
        communityVotingEnabled: true,
        welcomeEnabled: true,
        twitchEnabled: true,
        welcomeChannelId: '123',
        welcomeRoles: [{}],
        twitchRole: { followerRoleName: 'Follower' }
    };
test('all module switches gate construction individually and together', () => {
    const keys = ['systemEnabled', 'musicEnabled', 'welcomeEnabled', 'twitchEnabled', 'communityEnabled', 'communityVotingEnabled'];
    assert.equal(create(configured).length, 6);
    assert.equal(create({ ...configured, ...Object.fromEntries(keys.map(key => [key, false])) }).length, 0);
    for (const key of keys) assert.equal(create({ ...configured, [key]: false }).length, 5);
    assert.equal(create({}).length, 0); // Modules are opt-in by default.
});

test('every server gets its own modules and profile switches', () => {
    const modules = Array.from(exportsObject.BotModuleFactory.create({
        ...configured,
        guildIds: ['guild-a', 'guild-b', 'guild-a'],
        guildConfigs: { 'guild-b': { musicEnabled: false, twitchEnabled: false } }
    }));
    assert.equal(modules.length, 10);
    assert.equal(modules.filter(module => module.name === 'SystemModule').length, 2);
    assert.deepEqual(Array.from(modules.filter(module => module.name === 'MusicBotModule'), module => module.targetGuildId), ['guild-a']);
    assert.deepEqual(Array.from(modules.filter(module => module.name === 'TwitchRoleModule'), module => module.targetGuildId), ['guild-a']);
    for (const name of ['CommunityModule', 'CommunityNameVotingModule', 'WelcomeModule', 'TwitchRoleModule']) {
        if (name !== 'TwitchRoleModule') assert.deepEqual(Array.from(modules.filter(module => module.name === name), module => module.options.guildId), ['guild-a', 'guild-b']);
    }
});
