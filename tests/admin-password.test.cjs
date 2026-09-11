const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, file) => {
    module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText, file);
};

const { AdminPasswordService } = require('../src/services/AdminPasswordService.ts');

test('admin password hashes verify Unicode passwords and reject mismatches', async () => {
    const password = 'Grüße/ÄÖÜß & Café';
    const hash = await AdminPasswordService.hash(password);

    assert.equal(AdminPasswordService.isHash(hash), true);
    assert.equal(await AdminPasswordService.verify(password, hash), true);
    assert.equal(await AdminPasswordService.verify('falsch-' + password, hash), false);
    assert.equal(await AdminPasswordService.verify(password, 'kein-hash'), false);
});
