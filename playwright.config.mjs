import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests', testMatch:'*.spec.mjs', workers:1, retries:0,
  reporter:[['list']], timeout:30_000,
  webServer:{command:`"${process.execPath}" scripts/browser-server.mjs`,url:'http://127.0.0.1:15173',reuseExistingServer:false},
  use:{baseURL:'http://127.0.0.1:15173',browserName:'chromium',channel:'msedge',headless:true,viewport:{width:402,height:874},screenshot:'only-on-failure',trace:'retain-on-failure'},
});
