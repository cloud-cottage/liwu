import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    '.vercel',
    'apps/*/dist',
    'apps/*/.vercel',
    // 端侧原生构建产物与 Capacitor 拷贝的 web 包（非源码、体积巨大，
    // 例如 apps/app/android/app/src/main/assets/public/assets/index-*.js 约 1.3MB）
    '**/build/**',
    '**/.gradle/**',
    '**/DerivedData/**',
    'apps/*/android/app/src/main/assets/public/**',
    'apps/*/android/capacitor-cordova-android-plugins/**',
    'apps/*/ios/App/App/public/**'
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    files: ['apps/miniprogram/src/**/*.js'],
    languageOptions: {
      globals: {
        App: 'readonly',
        Page: 'readonly',
        Component: 'readonly',
        getApp: 'readonly',
        wx: 'readonly',
        require: 'readonly',
        module: 'readonly'
      }
    }
  },
  {
    // 生产 / 运维脚本（Node ESM）：顶层配置的 `files: ['**/*.{js,jsx}']` **不匹配 `.mjs`**
    // ⇒ 此前完全不被检查，属真实缺口。`**/scripts/**/*.mjs` 同时覆盖两类路径：
    //   ① 仓库根 `scripts/**/*.mjs`（audio-transcode-worker.mjs、build-deploy.mjs、dev-cloudbase-proxy.mjs 等）；
    //   ② 各 workspace 包内 `packages/<pkg>/scripts/**/*.mjs`——例如
    //      packages/shared-assets/scripts/sync-miniprogram.mjs（`npm run assets:sync` 的**生产脚本**）。
    // 上一版只写 `scripts/**/*.mjs`，包内脚本（②）仍漏检（实测 --print-config 为 0 rules），故扩为 `**/` 前缀。
    // 这里按 Node 环境补齐推荐规则 + Node globals：复用既有 `@eslint/js` / `globals` 依赖，
    // **不新增依赖、不启用新插件**；React 相关规则组（reactHooks / reactRefresh）对 Node 脚本不适用，故不 extends。
    files: ['**/scripts/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }]
    }
  },
  {
    // 云函数（腾讯云 SCF，Node.js CommonJS）运行在 Node 环境：顶层配置只给了 browser globals，
    // 会把 require / module / exports / process 等全部误报为 no-undef。
    // 这里按 Node globals 覆盖（不新增依赖），并**不加**任何 no-undef 例外：
    // 若此处仍报 no-undef，即为真实错误（例如把浏览器 API 写进了云函数）。
    files: ['cloudfunctions/**/*.js'],
    languageOptions: {
      globals: globals.node
    }
  }
])
