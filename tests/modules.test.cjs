const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/modules/BotModuleFactory.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, {
    exports: exportsObject,
    require: name => {
        const className = name.split('/').pop();
        return { [className]: class { constructor() { this.name = className; } } };
    }
});
const create = options => Array.from(exportsObject.BotModuleFactory.create(options), m => m.name);
const configured = { welcomeChannelId: '123', welcomeRoles: [{}], twitchRole: { followerRoleName: 'Follower' } };
test('all module switches gate construction individually and together', () => {
    const keys = ['systemEnabled', 'musicEnabled', 'welcomeEnabled', 'twitchEnabled', 'communityEnabled'];
    assert.equal(create(configured).length, 5);
    assert.equal(create({ ...configured, ...Object.fromEntries(keys.map(key => [key, false])) }).length, 0);
    for (const key of keys) assert.equal(create({ ...configured, [key]: false }).length, 4);
    assert.equal(create({}).length, 3); // Optional Welcome/Twitch still require configuration.
});
