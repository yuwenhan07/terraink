# Terraink 技术报告

## 1. 项目定位与核心 Idea

### 1.1 项目是什么

Terraink 是一个基于 Web 的地图海报生成器。用户输入地名或经纬度后，系统会从 OpenStreetMap 生态中获取地理信息与矢量地图数据，在浏览器内实时渲染地图，并允许用户调整主题、图层、排版、尺寸、字体、标记点，最终导出高分辨率 PNG、PDF 或 SVG 海报。

从产品形态看，它不是传统 GIS 系统，而是“地图可视化设计工具”：

- 输入是地点、尺寸、风格与少量交互参数
- 中间过程是地图取景、地图样式重建、版式叠加与导出合成
- 输出是适合打印、社媒封面、壁纸和网页展示的视觉成品

### 1.2 Idea 来源

根据 `README.md`，Terraink 的灵感来自 `MapToPoster`，但作者明确说明这是一个基于 Bun、React、TypeScript 的独立重实现，并已显著演化。它保留了“地点生成海报”的核心 idea，但将实现重点放在以下几个方向：

- 更强的主题系统
- 更细的地图图层控制
- 更完整的海报排版与字体控制
- 更产品化的导出、PWA、部署和品牌化能力

### 1.3 产品目标拆解

从代码和文档可以反推，它解决的是一条明确的创作链路：

1. 用户定位一个城市、地区或坐标
2. 系统自动得到中心点与显示名称
3. 地图引擎在当前尺寸比例下生成合适视图
4. 样式生成器把地图图层重新着色成“海报风格”
5. 叠加标题、国家名、坐标、渐变遮罩与自定义标记
6. 用离屏高分辨率渲染做最终导出

也就是说，Terraink 的核心不是“地图浏览”，而是“从地理位置到设计成品的自动生成”。

## 2. 技术栈与外部依赖

### 2.1 前端技术栈

- 运行时与包管理：Bun
- 构建工具：Vite
- UI 框架：React 18
- 语言：TypeScript
- 地图库：MapLibre GL JS
- 颜色选择：react-colorful
- 图标：react-icons

### 2.2 地理与地图数据栈

- 地图数据来源：OpenStreetMap
- 矢量瓦片方案：OpenMapTiles
- 瓦片托管：OpenFreeMap
- 地理编码与逆地理编码：Nominatim
- 浏览器定位：Geolocation API

### 2.3 部署与运行

- 容器化：Docker
- Web 服务：Nginx
- PWA：Service Worker + Web Manifest

## 3. 仓库规模与目录结构

### 3.1 文件规模

基于仓库扫描结果：

- 仓库总文件数约 `170`
- `src/` 下文件数约 `136`
- `public/` 下文件数约 `16`

### 3.2 顶层目录职责

- `src/`：全部前端源码
- `public/`：PWA 资源、图标、截图、静态文件、Service Worker
- `scripts/`：辅助脚本，如展示图拼接
- `README.md`：产品说明、运行与部署方式
- `ROADMAP.md`：后续规划与技术债
- `Dockerfile` / `docker-compose.yml` / `nginx.conf`：部署配置
- `agent.md`：AI 代理协作与架构约束文档

### 3.3 源码分层方式

项目采用“Feature-based + Hexagonal/Clean Architecture”的组合方式。`agent.md` 已明确规定每个 feature 拆成四层：

- `domain/`：纯类型、纯逻辑、端口定义
- `application/`：React hooks，负责组织用例
- `infrastructure/`：适配器与外部依赖实现
- `ui/`：React 组件

核心 feature 统计如下：

- `export`：2 个 domain，1 个 application，8 个 infrastructure，3 个 ui
- `location`：2 个 domain，2 个 application，6 个 infrastructure，3 个 ui
- `map`：1 个 domain，2 个 application，3 个 infrastructure，5 个 ui
- `markers`：2 个 domain，6 个 infrastructure，4 个 ui
- `poster`：3 个 domain，2 个 application，8 个 ui
- `theme`：3 个 domain，1 个 infrastructure，4 个 ui
- `layout`：2 个 domain，1 个 infrastructure，1 个 ui

这说明项目不是按页面粗粒度组织，而是按能力模块组织，并且每个能力都尽量拆成“状态 + 业务逻辑 + 适配器 + UI”。

## 4. 系统总体架构

### 4.1 整体运行骨架

应用启动非常薄：

- `src/main.tsx` 负责挂载 React、切换显示模式、注册 Service Worker
- `src/App.tsx` 只负责装配 `AppProviders` 与 `AppShell`
- `src/core/AppProviders.tsx` 目前主要注入 `PosterProvider`

真正的全局状态中心在 `src/features/poster/ui/PosterContext.tsx`。

### 4.2 单一状态中心

整个应用的“单一事实来源”是 `PosterContext + useReducer`：

- `PosterForm` 保存用户输入与导出参数
- `PosterState` 保存主题覆写、标记点、导出状态、错误状态、选中位置等
- `posterReducer.ts` 定义完整 action 集合

这意味着：

- 所有模块共享同一个海报状态
- 不依赖 Redux、Zustand 等额外库
- UI 组件直接从 Context 取状态，避免深层 prop drilling

### 4.3 核心服务装配层

`src/core/services.ts` 是典型的装配层，它把所有具体基础设施预先实例化成单例服务，再暴露给 application hooks 使用，包括：

- 位置搜索 `searchLocations`
- 地理编码 `geocodeLocation`
- 逆地理编码 `reverseGeocodeCoordinates`
- Google Fonts 加载 `ensureGoogleFont`
- 海报合成 `compositeExport`
- 地图截图 `captureMapAsCanvas`
- PNG/PDF/SVG 导出能力
- 文件下载

这使得 application 层不直接依赖 `fetch`、`localStorage`、字体链接或 MapLibre 具体对象，符合六边形架构思路。

## 5. 从用户操作到导出结果的数据流

Terraink 的核心链路可以拆成 8 个阶段。

### 5.1 阶段 A：初始化

`PosterProvider` 在初始化时完成几件事：

1. 载入默认 layout、默认 theme、默认坐标和默认距离
2. 执行 `useGeolocation(dispatch)` 获取浏览器定位
3. 根据 theme 计算 `effectiveTheme`
4. 调用 `generateMapStyle(...)` 生成 MapLibre 样式对象
5. 从 IndexedDB 读取自定义 marker icon

如果用户拒绝定位，就回退到德国 Hanover。

### 5.2 阶段 B：地点输入与搜索建议

地点输入由 `useLocationAutocomplete` 管理：

- 输入防抖：`450ms`
- 少于 2 个字符不发请求
- 使用 `AbortController` 中断旧请求
- 通过 `latestQueryRef` 避免过时响应污染界面

底层请求由 `createNominatimAdapter(...)` 负责：

- 查询 Nominatim `/search`
- 结果通过 `locationParser.ts` 归一化成统一 `SearchResult`
- 使用 localStorage 做 TTL 缓存
- 用 `inFlightSearchRequests` 去重并发请求

### 5.3 阶段 C：地点选择与表单同步

当用户选中某个地点，`posterReducer` 的 `SELECT_LOCATION` 会一次性更新：

- `location`
- `latitude`
- `longitude`
- `displayCity`
- `displayCountry`
- `displayContinent`

如果用户不是选建议，而是手动输入坐标，则 `useMapSync` 会在坐标变更后触发延迟逆地理编码，并回写位置名。

### 5.4 阶段 D：地图视图与距离同步

`useMapSync` 是地图和表单之间最核心的桥：

- 用 `distanceToZoom` 把“半宽距离（米）”换算成 MapLibre 的 zoom
- 用 `zoomToDistance` 反向换算
- 当用户拖动或缩放地图时，写回 `latitude/longitude/distance`
- 当用户修改坐标或距离时，控制地图 `jumpTo` 或 `flyTo`

这相当于在“设计参数空间”和“地图库视图空间”之间做双向映射。

### 5.5 阶段 E：主题与地图样式生成

`themeRepository.ts` 负责把 `themes.json` 中较松散的主题描述归一化成统一结构 `ResolvedTheme`。

重要方法：

- 颜色路径映射
- `$path` 式颜色引用解析
- 缺省色自动回退
- 根据 land / text 自动混合 building、outline 等颜色

然后 `generateMapStyle(theme, options)` 用这套颜色构造完整的 MapLibre Style Specification。它不是读取第三方现成底图样式，而是代码生成一份样式对象，主要包含：

- `background`
- `landcover`
- `park`
- `water`
- `waterway`
- `aeroway`
- `building`
- `rail`
- 多层级道路图层

### 5.6 阶段 F：预览层合成

预览面板 `PreviewPanel.tsx` 将多个视觉层叠加：

1. `MapPreview`：底层矢量地图
2. `GradientFades`：上下渐变遮罩
3. `MarkerOverlay`：屏幕空间的交互式标记层
4. `PosterTextOverlay`：城市名、国家名、坐标、版权信息
5. 地图控制按钮与信息条

也就是说，预览并不是单一 canvas，而是 DOM + WebGL + 叠加层组合。

### 5.7 阶段 G：导出

`useExport` 负责完整导出流程：

1. 确保字体已加载
2. 依据海报宽高换算英寸与 300 DPI 像素尺寸
3. 调用 `captureMapAsCanvas(...)` 建立离屏高分辨率地图
4. 调用 `compositeExport(...)` 叠加遮罩、标记和文字
5. 按格式输出 PNG / PDF / SVG
6. 触发下载

### 5.8 阶段 H：产品化反馈

每成功导出一次，会更新 localStorage 中的海报计数；第 1 次和每 5 次导出会触发 support prompt。这说明作者在技术实现中已经内置了增长与转化思路。

## 6. 地图实现原理

### 6.1 地图渲染核心

地图由 `MapPreview.tsx` 包装 MapLibre：

- 初次挂载创建 `maplibregl.Map`
- 关闭默认 attribution 控件
- 打开 `preserveDrawingBuffer` 以支持导出截图
- 通过 `ResizeObserver` 保证容器尺寸变化时地图重绘

### 6.2 增量样式更新

Terraink 并没有在每次主题或图层变化时直接 `setStyle()` 全量重建，而是实现了 `applyIncrementalStyleUpdate(...)`：

- 对比前后 style 的 `paint`
- 对比 `layout`
- 对比 `minzoom/maxzoom`
- 仅对变化项调用 `setPaintProperty`、`setLayoutProperty`、`setLayerZoomRange`

这避免了频繁全量 setStyle 带来的 source 重建、闪烁和性能抖动。

### 6.3 距离到缩放级别的数学映射

`useMapSync.ts` 中的公式核心是：

- 基于地球赤道周长 `EARTH_CIRCUMFERENCE_M`
- 考虑纬度余弦修正 `cos(lat)`
- 结合瓦片尺寸 `512`
- 根据容器像素宽度反推 zoom

本质上是 Web Mercator 下“地理尺度 <-> 屏幕尺度”的计算。

### 6.4 Overzoom 机制

这是 Terraink 比较有特点的实现。

`MAP_OVERZOOM_SCALE = 5.5`，同时设置：

- `MIN_EFFECTIVE_CONTAINER_PX = 3300`
- `MAX_OVERZOOM_SCALE = 10`

含义是：

- 在小屏幕或窄容器中，把地图内部渲染尺寸按倍数放大
- 再通过 CSS `transform: scale(...)` 缩回原始显示大小
- 这样视觉 framing 不变，但地图细节层级更接近桌面端和导出端

这解决了移动端地图在相同视图框下细节过少的问题。

### 6.5 地图样式方法论

`maplibreStyle.ts` 的样式构造逻辑很“海报导向”，不是普通导航地图逻辑：

- 把道路分成 major、minor high、minor mid、minor low、path
- 将 minor/path 拆成 overview 层和 detail 层，避免缩小时道路细节突然消失
- 为道路外轮廓单独绘制 casing 层
- 建筑显示有 `minzoom`，且在近距离模式下保留更多细节
- 水系、铁路等都用插值 stops 定义随 zoom 变化的线宽

这说明作者在做的是“美学地图样式工程”，不是简单换色。

## 7. 位置与地理编码系统

### 7.1 Nominatim 适配器

`createNominatimAdapter(http, cache)` 完成 4 类能力：

- `searchLocations(query, limit, signal)`
- `geocodeLocation(query)`
- `geocodeCity(city, country)`
- `reverseGeocode(lat, lon)`

它的关键方法包括：

- localStorage TTL 缓存
- 并发请求去重
- 请求超时控制
- 结果归一化

### 7.2 结果归一化

`locationParser.ts` 会把 Nominatim 返回结构转换成统一字段：

- `label`
- `city`
- `country`
- `countryCode`
- `continent`
- `lat`
- `lon`

其中 continent 有一个基于经纬度范围的启发式推断函数 `inferContinentFromCoordinates(...)`。这不是严格 GIS 行政区算法，但足够支持海报标题层级切换。

### 7.3 定位系统

地理定位被拆成两层：

- `useGeolocation`：应用启动时设置初始位置
- `useCurrentLocation`：用户主动点击“使用当前位置”时使用

`geolocation.ts` 做了更完整的容错：

- 检查 `permissions.query`
- 区分 denied / unavailable / timeout / insecure / unsupported
- 超时或不可用时允许重试一次
- 根据失败类型生成用户友好提示

## 8. 海报排版与视觉生成

### 8.1 文本排版系统

海报文字并非随意绘制，而是有固定版式比例：

- 城市名 Y 轴比例：`0.845`
- 分隔线：`0.875`
- 国家名：`0.9`
- 坐标：`0.93`

字体大小根据画布维度按比例缩放，参考尺寸为 `3600px`。

### 8.2 长标题处理

`textLayout.ts` 做了几个细节优化：

- 拉丁文字城市名会转大写并加字间距
- 非拉丁文字保持原样，避免不自然排版
- 长城市名会按长度自动缩小字号
- 当 overlay 不显示时，会根据 land 亮度推导 attribution 颜色，确保可读性

### 8.3 渐变遮罩

`applyFades(...)` 在顶部和底部分别绘制 25% 高度的线性渐变，用于：

- 强化海报上下边界
- 让文字与标记在复杂地图背景上保持可读性
- 提供一种海报化视觉层，而不是裸地图截图

## 9. 标记系统实现

### 9.1 标记能力概述

Terraink 的 marker 不是 MapLibre 原生 marker，而是自己维护的一层独立 overlay。这让它在预览和导出中都可以保持一致控制。

### 9.2 图标来源

`iconRegistry.ts` 支持两类 icon：

- 预定义 SVG 图标：Pin、Heart、Home、Star 等
- 图片类图标：如 Terraink 自身 marker 资源

此外还支持用户上传自定义图片图标。

### 9.3 自定义图标存储

`customIconStorage.ts` 使用 IndexedDB 存储自定义 marker icon：

- DB 名：`terraink-markers`
- Store 名：`custom-icons`

相比 localStorage，IndexedDB 更适合保存 data URL 等较大内容。

### 9.4 屏幕投影与交互

预览层 marker 的位置由 `MarkerOverlay.tsx` 计算：

- 使用 `map.project([lon, lat])` 转屏幕坐标
- 考虑 overzoomScale 修正
- 支持 pointer 拖拽
- 支持触摸拖拽
- 支持双指缩放改 marker 尺寸
- 支持键盘方向键微调
- 支持 `+/-` 调整尺寸

### 9.5 导出时的投影复算

导出时不能直接复用屏幕 overlay 坐标，因此项目实现了 `projectMarkerToCanvas(...)`：

- 先将经纬度转 Web Mercator world coordinates
- 以当前地图中心为参考计算相对位移
- 做 anti-meridian 包裹修正
- 按 bearing 旋转
- 投影到导出画布中心

这使 marker 在导出结果中与预览 framing 保持一致。

## 10. 导出系统实现

### 10.1 导出分辨率策略

导出采用典型印刷策略：

- 用户输入宽高单位为厘米
- 转换为英寸
- 默认按 `300 DPI` 计算像素尺寸

这使 PNG 与 PDF 更适合打印。

### 10.2 离屏地图渲染

`captureMapAsCanvas(...)` 是导出链路的关键：

1. 等待当前地图 `idle`
2. 读取当前中心点、缩放、pitch、bearing、style
3. 创建一个不可见的离屏 DOM 容器
4. 新建一个 MapLibre exportMap
5. 在更高渲染尺寸和 pixelRatio 下重新绘制
6. 将 WebGL canvas 绘制到 2D canvas

核心思想是“重建一个高分辨率同视角地图”，而不是简单放大当前屏幕 canvas。

### 10.3 导出参数统一计算

`resolveExportRenderParams(...)` 负责统一推导：

- previewWidth / previewHeight
- renderWidth / renderHeight
- pixelRatio
- markerProjection
- markerScaleX / markerScaleY
- markerSizeScale

这保证地图层、marker 层和文本层在导出时使用同一组尺度参数。

### 10.4 PNG 导出

`pngExporter.ts` 不是直接 `canvas.toBlob()` 结束，而是进一步向 PNG 字节流注入 `pHYs` chunk 来写入 DPI 信息。

这意味着：

- 导出的 PNG 具备印刷分辨率元数据
- 打印软件读取时更容易保持正确物理尺寸

这是一个比较细致的实现点。

### 10.5 PDF 导出

`pdfExporter.ts` 没有引入 jsPDF 或 pdf-lib，而是手写了一个最小 PDF 生成器：

- 把 canvas 编码成 JPEG
- 手动拼接 PDF 对象
- 写 Catalog / Pages / Page / XObject / Content Stream / xref

优点：

- 无额外依赖
- 代码可控
- 导出链路更轻

缺点：

- 功能简单，只适合单页位图嵌入

### 10.6 SVG 导出

`layeredSvgExporter.ts` 的策略也很有意思。它不是导出真正矢量道路几何，而是：

1. 逐层切换 MapLibre 图层可见性
2. 每个图层分别渲染成 PNG data URL
3. marker、渐变、文字也分别绘成位图 data URL
4. 最后拼成一个多 `<g>` 分组的 SVG

这类 SVG 的本质是“分层位图封装 SVG”，优点是：

- 图层结构可保留
- 在设计工具里更容易分组处理
- 比单张 PNG 更接近可编辑产物

但它不是真正的纯矢量地图导出。

## 11. 主题与版式系统

### 11.1 主题数据

项目中共发现 `18` 套主题，包含：

- `midnight_blue`
- `terracotta`
- `neon`
- `coral`
- `heatwave`
- `ruby`
- `sage`
- `copper`
- `rustic`
- `blueprint`
- `contrast_zones`
- `copper_patina`
- `emerald`
- `forest`
- `japanese_ink`
- `noir`
- `ocean`
- `pastel_dream`

### 11.2 主题实现方法

主题系统不是只改背景色，而是定义整套颜色语义：

- `ui.bg`
- `ui.text`
- `map.land`
- `map.landcover`
- `map.water`
- `map.waterway`
- `map.parks`
- `map.buildings`
- `map.aeroway`
- `map.rail`
- `map.roads.*`

用户修改颜色时，`applyThemeColorOverrides(...)` 会在选中主题的基础上做路径级覆写，而不是破坏原主题结构。

### 11.3 版式数据

`layouts.json` 中共发现 `26` 种 layout，分为 4 类：

- `Print`：4 个
- `Social Media`：10 个
- `Wallpaper`：9 个
- `Web`：3 个

### 11.4 版式匹配策略

用户手动输入宽高时，`layoutMatcher.ts` 会判断是否与现有 layout 在容差内匹配：

- 如果匹配，自动回到已有 layout id
- 如果不匹配，切换成 `custom`

这保持了“预设版式”和“自定义尺寸”之间的联动。

## 12. UI 交互层设计

### 12.1 AppShell 的职责

`AppShell.tsx` 是页面级装配器，主要负责：

- Header / Footer
- Desktop 与 Mobile 导航
- 懒加载 AboutModal、SettingsPanel、AnnouncementModal、ExportFab
- 启动位置弹窗
- 安装提示
- 支持提示弹窗

### 12.2 桌面与移动端双态

该项目没有走复杂的路由分屏，而是同一套状态、不同展示：

- 桌面端：左侧设置面板 + 中心预览
- 移动端：底部导航 + 抽屉设置面板

还有一些移动端专门逻辑：

- `useSwipeDown` 控制抽屉下拉关闭
- marker 编辑状态下显示单独的尺寸条
- 对 `body/html` 的 overflow 和 overscroll 进行锁定

### 12.3 懒加载与预加载

项目使用 `React.lazy` + `Suspense` 做按需加载，同时在空闲时通过 `requestIdleCallback` 预加载关键模块，降低首屏体积。

## 13. 缓存、字体、平台与公共能力

### 13.1 localStorage 缓存

`localStorageCache.ts` 的实现特点：

- key 带 `APP_VERSION` 前缀
- 保存时间戳
- 带 TTL 失效
- 自动容错 JSON 解析和过期数据

这避免旧版本缓存污染新版本。

### 13.2 Google Fonts 按需加载

`googleFontsAdapter.ts` 会：

- 动态插入 Google Fonts `<link>`
- 用 `document.fonts.load(...)` 预加载 300/400/700 字重

这样可以保证预览与导出文字尽可能一致。

### 13.3 平台抽象

`core/platform/` 抽象出平台适配层，目前默认是 web，但保留了未来原生平台接入的接口：

- `isNativePlatform()`
- `setPlatformAdapter(...)`
- `onPlatformAdapterChange(...)`

这与 `main.tsx` 中的显示模式切换、Service Worker 注册以及 install prompt 判断是配套的。

## 14. PWA 与产品化工程

### 14.1 Service Worker 策略

`public/sw.js` 采用两级缓存：

- `terraink-static-v2`：应用壳资源
- `terraink-tiles-v1`：地图瓦片资源

策略包括：

- 安装时预缓存应用壳
- 激活时删除旧缓存
- 对 `tiles.openfreemap.org` 走 cache-first
- 对站内导航请求在离线时回退 `index.html`

这使 Terraink 具备基本离线打开和瓦片复用能力。

### 14.2 Install Prompt

`useInstallPrompt.ts` 同时兼容：

- 标准 `beforeinstallprompt`
- iOS 手动安装提示
- Android fallback 提示
- 一周内 dismiss 缓存

说明作者认真考虑了 PWA 在不同平台上的行为差异。

### 14.3 更新公告系统

`AnnouncementModal.tsx` 会：

- 比较 `APP_VERSION` 与 `last_seen_version`
- 拉取 `UPDATES_URL`
- 查找当前版本变更记录
- 以 summary/details 双模式展示

这是一套轻量化的产品 release note 机制。

## 15. 构建、部署与运维

### 15.1 构建优化

`vite.config.js` 做了较细的 chunk 拆分：

- `vendor-maplibre-core`
- `vendor-maplibre-deps`
- `vendor-icons`
- `vendor-react`

这样做的目的很明确：MapLibre 体积较大，需要单独控制 chunk；React Icons 也被单独分包，减少主包压力。

### 15.2 Docker 部署

`Dockerfile` 使用两阶段构建：

1. `oven/bun:1-alpine` 构建产物
2. `nginx:1.29-alpine` 承载静态站点

优点是镜像更小，运行时更干净。

### 15.3 Nginx 配置

`nginx.conf` 提供了：

- SPA 路由回退到 `index.html`
- `sw.js` 禁缓存
- `site.webmanifest` 单独 content-type
- `assets/` 强缓存一年
- 一组基础安全响应头

### 15.4 Compose 启动

`docker-compose.yml` 将容器默认映射到 `7200:80`，适合本地和轻量自托管。

## 16. 方法论总结：Terraink 用了哪些关键方法

从“怎么实现”的角度，Terraink 主要用了以下方法：

### 16.1 架构方法

- Feature-based 模块化
- Hexagonal/Clean 分层
- Context + Reducer 单状态源
- 单例服务装配层

### 16.2 地图方法

- MapLibre 矢量地图渲染
- 代码生成地图样式对象
- 距离与 zoom 的双向数学映射
- overzoom 细节增强
- 增量样式 diff 更新

### 16.3 地理方法

- Nominatim 地理编码 / 逆地理编码
- 坐标驱动的位置回填
- 启发式 continent 推断
- Geolocation 权限与失败重试

### 16.4 视觉生成方法

- 主题语义色映射
- 画布渐变遮罩
- 动态字体加载
- 文本尺寸自适应与脚本感知排版

### 16.5 导出方法

- 离屏高分辨率重建地图
- 多层 canvas 合成
- marker 几何投影复算
- PNG DPI chunk 注入
- 手写最小 PDF 生成
- 分层位图式 SVG 封装

### 16.6 产品工程方法

- PWA 安装与缓存
- 导出计数与支持弹窗
- 版本公告系统
- Docker + Nginx 自托管

## 17. 关键亮点与设计取舍

### 17.1 技术亮点

1. 不是普通地图网页，而是“地图海报生成引擎”
2. 地图样式完全由代码动态生成，可高度定制
3. 导出不是截图，而是离屏高分辨率重建
4. marker 交互层与导出层都做了统一投影处理
5. 对移动端细节不足问题引入 overzoom 机制
6. PWA、更新公告、Docker 部署使其具备产品化完整度

### 17.2 设计取舍

1. 没引入重型状态管理库，保持简单，但全局 Context 可能随着功能增长变重
2. SVG 导出保留层级，但不是纯矢量道路几何
3. PDF 生成轻量，但功能较基础
4. 地理位置解析依赖外部 Nominatim 服务，存在第三方稳定性约束

## 18. 已知问题与技术债

`ROADMAP.md` 已明确记录了一些现状问题：

- TypeScript 仍是 `strict: false`
- `allowJs: true`
- 仍有预存类型错误待修
- 计划扩展更多导出格式和 marker 能力
- 主题浏览、无障碍、SEO 还有继续加强空间

这说明项目虽然产品完成度较高，但仍处于持续迭代阶段。

## 19. 一句话还原 Terraink 的实现本质

Terraink 的本质可以概括为：

> 一个以 React + MapLibre 为前端壳、以 OpenStreetMap 生态为地理数据底座、以自定义样式生成与离屏高分辨率导出为核心能力的地图海报生成系统。

它把“地点 -> 地图 -> 版式 -> 成品”这条链路做成了浏览器内实时可交互的设计工作流，这正是它区别于普通地图应用和普通海报编辑器的关键。

## 20. 建议你继续深入的源码入口

如果你要继续做二次分析，建议优先读这几组文件：

- 应用总入口：`src/main.tsx`、`src/App.tsx`、`src/shared/ui/AppShell.tsx`
- 状态中心：`src/features/poster/ui/PosterContext.tsx`、`src/features/poster/application/posterReducer.ts`
- 地图同步：`src/features/map/application/useMapSync.ts`
- 地图样式：`src/features/map/infrastructure/maplibreStyle.ts`
- 地点解析：`src/features/location/infrastructure/nominatimAdapter.ts`
- 预览组合：`src/features/poster/ui/PreviewPanel.tsx`
- 导出核心：`src/features/export/application/useExport.ts`
- 离屏导出：`src/features/export/infrastructure/mapExporter.ts`
- 海报合成：`src/features/poster/infrastructure/renderer/index.ts`
- SVG/PDF/PNG 导出：`src/features/export/infrastructure/layeredSvgExporter.ts`、`pdfExporter.ts`、`pngExporter.ts`

