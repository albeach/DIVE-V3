// Auto-generated Playwright config for running instances
// Generated: 2025-12-17T07:05:11.529Z
// Instances: hub, rou, gbr, dnk, alb

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  "testDir": "./src/__tests__/e2e",
  "fullyParallel": false,
  "forbidOnly": false,
  "retries": 0,
  "workers": 1,
  "reporter": [
    [
      "html",
      {
        "outputFolder": "playwright-report"
      }
    ],
    [
      "json",
      {
        "outputFile": "playwright-report/results.json"
      }
    ],
    [
      "list"
    ]
  ],
  "use": {
    "trace": "on-first-retry",
    "screenshot": "only-on-failure",
    "video": "retain-on-failure",
    "actionTimeout": 15000,
    "navigationTimeout": 30000,
    "ignoreHTTPSErrors": true
  },
  "projects": [
    {
      "name": "hub-chromium",
      "use": {
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.37 Safari/537.36",
        "viewport": {
          "width": 1280,
          "height": 720
        },
        "deviceScaleFactor": 1,
        "isMobile": false,
        "hasTouch": false,
        "defaultBrowserType": "chromium",
        "baseURL": "https://localhost:3000"
      },
      "testMatch": "**/dynamic/hub/**/*.spec.ts",
      "metadata": {
        "instance": "hub",
        "displayName": "DIVE Hub",
        "frontendUrl": "https://localhost:3000",
        "backendUrl": "https://localhost:4000",
        "type": "hub"
      }
    },
    {
      "name": "rou-chromium",
      "use": {
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.37 Safari/537.36",
        "viewport": {
          "width": 1280,
          "height": 720
        },
        "deviceScaleFactor": 1,
        "isMobile": false,
        "hasTouch": false,
        "defaultBrowserType": "chromium",
        "baseURL": "https://localhost:3025"
      },
      "testMatch": "**/dynamic/rou/**/*.spec.ts",
      "metadata": {
        "instance": "rou",
        "displayName": "Romania",
        "frontendUrl": "https://localhost:3025",
        "backendUrl": "https://localhost:4025",
        "type": "spoke"
      }
    },
    {
      "name": "gbr-chromium",
      "use": {
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.37 Safari/537.36",
        "viewport": {
          "width": 1280,
          "height": 720
        },
        "deviceScaleFactor": 1,
        "isMobile": false,
        "hasTouch": false,
        "defaultBrowserType": "chromium",
        "baseURL": "https://localhost:3003"
      },
      "testMatch": "**/dynamic/gbr/**/*.spec.ts",
      "metadata": {
        "instance": "gbr",
        "displayName": "United Kingdom",
        "frontendUrl": "https://localhost:3003",
        "backendUrl": "https://localhost:4003",
        "type": "spoke"
      }
    },
    {
      "name": "dnk-chromium",
      "use": {
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.37 Safari/537.36",
        "viewport": {
          "width": 1280,
          "height": 720
        },
        "deviceScaleFactor": 1,
        "isMobile": false,
        "hasTouch": false,
        "defaultBrowserType": "chromium",
        "baseURL": "https://localhost:3007"
      },
      "testMatch": "**/dynamic/dnk/**/*.spec.ts",
      "metadata": {
        "instance": "dnk",
        "displayName": "Denmark",
        "frontendUrl": "https://localhost:3007",
        "backendUrl": "https://localhost:4007",
        "type": "spoke"
      }
    },
    {
      "name": "alb-chromium",
      "use": {
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.37 Safari/537.36",
        "viewport": {
          "width": 1280,
          "height": 720
        },
        "deviceScaleFactor": 1,
        "isMobile": false,
        "hasTouch": false,
        "defaultBrowserType": "chromium",
        "baseURL": "https://localhost:3001"
      },
      "testMatch": "**/dynamic/alb/**/*.spec.ts",
      "metadata": {
        "instance": "alb",
        "displayName": "Albania",
        "frontendUrl": "https://localhost:3001",
        "backendUrl": "https://localhost:4001",
        "type": "spoke"
      }
    },
    {
      "name": "federation-chromium",
      "use": {
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.37 Safari/537.36",
        "viewport": {
          "width": 1280,
          "height": 720
        },
        "deviceScaleFactor": 1,
        "isMobile": false,
        "hasTouch": false,
        "defaultBrowserType": "chromium",
        "baseURL": "https://localhost:3000"
      },
      "testMatch": "**/federation/**/*.spec.ts",
      "metadata": {
        "type": "federation",
        "instances": [
          "hub",
          "rou",
          "gbr",
          "dnk",
          "alb"
        ],
        "hubUrl": "https://localhost:3000"
      }
    }
  ],
  "metadata": {
    "generatedAt": "2025-12-17T07:05:11.528Z",
    "detectedInstances": [
      "hub",
      "rou",
      "gbr",
      "dnk",
      "alb"
    ],
    "instanceUrls": {
      "hub_frontend": "https://localhost:3000",
      "hub_backend": "https://localhost:4000",
      "rou_backend": "https://localhost:4025",
      "rou_frontend": "https://localhost:3025",
      "gbr_frontend": "https://localhost:3003",
      "gbr_backend": "https://localhost:4003",
      "dnk_frontend": "https://localhost:3007",
      "alb_frontend": "https://localhost:3001",
      "dnk_backend": "https://localhost:4007",
      "alb_backend": "https://localhost:4001"
    }
  }
});
