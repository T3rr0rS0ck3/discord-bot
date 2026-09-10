const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, file) => {
    module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText, file);
};

const { ExternalHttpError, ExternalRequestExecutor } = require('../src/services/ExternalRequestExecutor.ts');

test('retries rate limits and succeeds on a later attempt', async () => {
    let attempts = 0;
    const result = await ExternalRequestExecutor.execute(async () => {
        attempts += 1;
        if (attempts < 3) throw new ExternalHttpError(429, 0);
        return 'ok';
    }, { serviceName: 'test', timeoutMs: 100, maxAttempts: 3, baseDelayMs: 0 });

    assert.equal(result, 'ok');
    assert.equal(attempts, 3);
});

test('does not retry permanent HTTP errors', async () => {
    let attempts = 0;
    await assert.rejects(
        ExternalRequestExecutor.execute(async () => {
            attempts += 1;
            throw new ExternalHttpError(400);
        }, { serviceName: 'test', timeoutMs: 100, maxAttempts: 3, baseDelayMs: 0 }),
        /HTTP 400/
    );
    assert.equal(attempts, 1);
});

test('times out operations that do not support AbortSignal', async () => {
    await assert.rejects(
        ExternalRequestExecutor.execute(() => new Promise(() => {}), {
            serviceName: 'test', timeoutMs: 5, maxAttempts: 1, baseDelayMs: 0
        }),
        error => error.name === 'AbortError' && /timed out/.test(error.message)
    );
});

test('parses Retry-After seconds', () => {
    assert.equal(ExternalRequestExecutor.parseRetryAfter('2'), 2000);
    assert.equal(ExternalRequestExecutor.parseRetryAfter('invalid'), undefined);
});