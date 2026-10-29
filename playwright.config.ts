import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',workers:1,timeout:90000,use:{baseURL:'http://127.0.0.1:3210',viewport:{width:1440,height:1080},headless:true,screenshot:'only-on-failure',trace:'retain-on-failure'},reporter:[['list']]});
