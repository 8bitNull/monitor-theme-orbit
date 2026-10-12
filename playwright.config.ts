import { defineConfig } from '@playwright/test'
export default defineConfig({ testDir: './tests/e2e', use: { baseURL: 'http://127.0.0.1:8791', trace: 'retain-on-failure' }, projects: [{ name: 'chromium', use: { browserName: 'chromium' } }], webServer: { command: 'MOCK_PORT=8791 node mock-server.mjs', url: 'http://127.0.0.1:8791', reuseExistingServer: false } })
