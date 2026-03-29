# render-test

一个可在手机端运行的渲染测试 demo，用来对比：

- WebGL vs WebGPU 渲染
- JavaScript vs WebAssembly 粒子更新逻辑
- 不同粒子数量下的 FPS / 帧耗时

## 本地运行

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## 部署

仓库内已包含 GitHub Pages 工作流。推送到 `main` 后即可自动构建并部署到：

`https://greendou.github.io/render-test/`

## 说明

- 页面使用 Vite 构建，`base` 已配置为 `/render-test/`
- 若浏览器不支持 WebGPU，会自动回退到 WebGL
- WebAssembly 用于粒子位置更新，渲染路径仍可独立切换为 WebGL / WebGPU
