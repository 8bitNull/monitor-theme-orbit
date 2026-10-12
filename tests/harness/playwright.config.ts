import {defineConfig} from '@playwright/test'
import {fileURLToPath} from 'node:url'
const cwd = fileURLToPath(new URL('../..', import.meta.url))
export default defineConfig({
 testDir: '.', use: {baseURL: 'http://127.0.0.1:8913'},
 webServer: [
  {command: 'MOCK_PORT=8912 node mock-server.mjs', url: 'http://127.0.0.1:8912/api/nodes', cwd, reuseExistingServer: false},
  {command: 'MONITOR_HUB=http://127.0.0.1:8912 npm run dev -- --host 127.0.0.1 --port 8913 --strictPort', url: 'http://127.0.0.1:8913/node_modules/.vite/deps/react-dom_client.js', cwd, reuseExistingServer: false},
 ],
})
