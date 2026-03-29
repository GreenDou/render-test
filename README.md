# render-test

一个可在手机端运行的渲染测试 demo，用来对比：

- WebGL vs WebGPU 渲染
- JavaScript vs WebAssembly 实例仿真逻辑
- 复杂 3D 网格在大量实例下的 FPS / 帧耗时

在线地址：

- GitHub Pages: https://greendou.github.io/render-test/

## 功能

- 通过下拉菜单切换渲染后端：`WebGL / WebGPU`
- 通过下拉菜单切换计算实现：`JavaScript / WebAssembly`
- 通过下拉菜单切换网格复杂度、实例数量、压力等级、实例缩放
- 实时显示 `FPS / Frame / Update / Render` 指标
- 页面内置调试日志面板，可直接查看 console / error / unhandledrejection
- 出错时会在页面里展示最近错误详情，并支持一键复制
- 自动记住上次选择的配置
- 切换 WebGL / WebGPU 时会重建 canvas，避免同一 canvas 上下文类型切换导致的初始化失败
- 浏览器不支持 WebGPU，或当前环境虽然暴露了 API 但初始化失败时，会自动回退到 WebGL

## 技术实现

- 使用 `Vite` 作为构建工具
- 使用 `WebGL2` 和 `WebGPU` 两条渲染路径
- benchmark 不再使用简单粒子点，而是使用 **复杂 torus knot 网格 + 大量实例化渲染**
- 使用 `JavaScript` 与 `WebAssembly` 两条实例仿真更新路径
- WebAssembly 模块由 `scripts/gen-wasm.mjs` 在构建前自动生成
- Pages 路由基址已配置为 `/render-test/`

## 本地运行

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## GitHub Pages 部署

仓库内已包含 GitHub Actions 工作流：

- `.github/workflows/deploy.yml`

推送到 `main` 后会自动：

1. 执行 `npm ci`
2. 执行 `npm run build`
3. 上传 `dist/`
4. 部署到 GitHub Pages

## 建议测试方式

建议在同一台设备上依次切换以下组合，观察 FPS 和帧耗时变化：

1. `WebGL + JavaScript`
2. `WebGL + WebAssembly`
3. `WebGPU + JavaScript`
4. `WebGPU + WebAssembly`

并配合以下配置放大差异：

- 网格复杂度：`high / ultra`
- 实例数量：`600 / 1200`
- 压力等级：`4x / 8x`

## 注意事项

- WebGPU 支持依赖具体浏览器和系统版本
- 某些移动浏览器可能会暴露 `navigator.gpu`，但实际无法创建 `webgpu` canvas context，或在 `configure / getCurrentTexture / pipeline` 阶段失败，因此页面里做了自动回退处理并显示详细错误
- 某些浏览器对同一个 canvas 的上下文类型切换不稳定，因此这里切换渲染后端时会直接重建 canvas
- 页面上的“调试日志”可以直接帮助定位 iOS Safari / Safari Technology Preview / Chrome Android 上的兼容性问题
- 这个 demo 主要用于前端渲染路径与计算路径的直观对比，不是严格意义上的专业 benchmark 套件
