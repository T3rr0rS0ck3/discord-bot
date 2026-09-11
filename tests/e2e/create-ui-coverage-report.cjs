const fs = require('node:fs');
const path = require('node:path');
const libCoverage = require('istanbul-lib-coverage');
const libReport = require('istanbul-lib-report');
const reports = require('istanbul-reports');

const rawDirectory = path.resolve('coverage', 'ui-raw');
const reportDirectory = path.resolve('coverage', 'ui');
const coverageMap = libCoverage.createCoverageMap({});

for (const fileName of fs.readdirSync(rawDirectory).filter(name => name.endsWith('.json'))) {
    coverageMap.merge(JSON.parse(fs.readFileSync(path.join(rawDirectory, fileName), 'utf8')));
}
const unitCoverageFile = path.resolve('coverage', 'ui-unit', 'coverage-final.json');
if (fs.existsSync(unitCoverageFile)) {
    coverageMap.merge(JSON.parse(fs.readFileSync(unitCoverageFile, 'utf8')));
}
coverageMap.filter(fileName => fileName.includes(`${path.sep}src${path.sep}admin-ui${path.sep}`));

fs.rmSync(reportDirectory, { recursive: true, force: true });
const context = libReport.createContext({ dir: reportDirectory, coverageMap });
for (const reporter of ['html', 'lcovonly', 'json-summary', 'text-summary']) {
    reports.create(reporter).execute(context);
}

const minimumCoverage = 80;
const summary = coverageMap.getCoverageSummary().toJSON();
const failedMetrics = ['lines', 'statements', 'functions', 'branches']
    .filter(metric => summary[metric].pct < minimumCoverage)
    .map(metric => `${metric}: ${summary[metric].pct}%`);

if (failedMetrics.length > 0) {
    throw new Error(`UI coverage must be at least ${minimumCoverage}% for every metric. Failed: ${failedMetrics.join(', ')}`);
}