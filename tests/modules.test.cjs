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
        return { [className]: class { constructor() { this.name = className; } } };
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
