# Admin UI E2E

Run `npm run test:e2e` to build the Admin UI and test desktop and mobile layouts.

Manual review artifacts are written to:

- `e2e-results/screenshots/`: full-page dashboard screenshots
- `e2e-results/report/index.html`: Playwright HTML report
- `e2e-results/artifacts/`: failure screenshots and traces

Open the latest HTML report with `npm run test:e2e:report`.

## Coverage

Run `npm run coverage` to create code coverage for both test layers:

- `coverage/node/index.html`: Node.js services, modules, database, and admin server
- `coverage/ui/index.html`: React Admin UI code executed by Playwright
- `coverage/index.html`: combined overview linking both reports

`npm run coverage:node` runs only backend coverage. `npm run coverage:ui` runs the Playwright suite and creates only UI coverage.
