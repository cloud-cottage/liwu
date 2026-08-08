# Assets 存放规范

## 目录结构

所有前端使用的静态资源（icons、图片、字体等）统一存储在 `packages/shared-assets/` 目录下。

```
packages/shared-assets/
├── icons/          # SVG 图标
│   ├── partner/    # 合作方后台相关图标
│   └── ...
├── images/         # 图片（PNG, JPG, WebP）
├── fonts/          # 字体文件
└── ...
```

## 规则

1. **规范位置**：所有 assets 必须存放在 `packages/shared-assets/` 下，按用途分目录。
2. **图标类**：SVG 图标放入 `packages/shared-assets/icons/` 下，按功能模块分子目录（如 `partner/`）。
3. **Web 引用**：`apps/web/public/` 下的文件通过符号链接（symlink）引用 `packages/shared-assets/` 中的文件，保持两份一致。
4. **引用方式**：在代码中使用绝对路径引用，如 `<img src="/icons/partner/ai.svg" />`。
5. **新增图标**：先在 `packages/shared-assets/icons/` 下创建 SVG，然后在 `apps/web/public/icons/` 下创建同名符号链接。
