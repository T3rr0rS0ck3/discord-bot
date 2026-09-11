const fs = require('node:fs');
const path = require('node:path');

function readSummary(name) {
    const filePath = path.resolve('coverage', name, 'coverage-summary.json');
    const summary = JSON.parse(fs.readFileSync(filePath, 'utf8')).total;
    return {
        lines: summary.lines.pct,
        statements: summary.statements.pct,
        functions: summary.functions.pct,
        branches: summary.branches.pct
    };
}

const node = readSummary('node');
const ui = readSummary('ui');
const row = (label, summary, target) => `<tr><th><a href="${target}">${label}</a></th><td>${summary.statements}%</td><td>${summary.branches}%</td><td>${summary.functions}%</td><td>${summary.lines}%</td></tr>`;
const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Discord Bot Coverage</title><style>body{font:16px sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#172033}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd3df;padding:12px;text-align:right}th:first-child{text-align:left}a{color:#175cd3}</style></head><body><h1>Test Coverage</h1><p>Zuletzt erzeugte Backend- und Browser-Abdeckung.</p><table><thead><tr><th>Bereich</th><th>Statements</th><th>Branches</th><th>Functions</th><th>Lines</th></tr></thead><tbody>${row('Node / Backend', node, 'node/index.html')}${row('Admin UI / Playwright', ui, 'ui/index.html')}</tbody></table><p><a href="../e2e-results/report/index.html">Playwright E2E-Report öffnen</a></p></body></html>`;

fs.writeFileSync(path.resolve('coverage', 'index.html'), html);
console.log('Coverage overview: coverage/index.html');