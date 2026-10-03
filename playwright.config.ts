import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests',testMatch:'*.e2e.ts',workers:1,timeout:60000,expect:{timeout:15000},webServer:{command:'npm run fixture',url:'http://127.0.0.1:8787/chess-board.html',reuseExistingServer:false},reporter:'list'});
