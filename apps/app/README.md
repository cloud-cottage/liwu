# @liwu/app

手机端 React/Vite 客户端，可通过 Capacitor 打包为 iOS / Android 原生应用。

## 页面结构

底部导航栏四个页面：

- **首页**
- **冥想**
- **觉察**
- **我的**

## 开发

```bash
# 在仓库根目录
npm run dev:app
```

本地开发端口：**5176**

## 原生打包

```bash
npm run build:native     # 构建并 cap sync
npm run cap:android      # 打开 Android 工程
npm run cap:ios          # 打开 iOS 工程
```

## 与 Web 的关系

`apps/web` 复用本目录 `src/` 下的功能模块。修改共享代码时请同时确认 Web 端表现正常。

## 云服务

- 通过 Vite 代理访问 CloudBase（`/api/cloudbase-proxy`）
- 核心服务代码：`src/services/cloudbase.js`、`src/services/database.js`