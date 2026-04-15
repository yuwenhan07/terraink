# Story Map 前端目录重构方案

## 1. 重构目标

当前 Terraink 偏“单页海报编辑器”，状态中心围绕 `PosterContext` 展开。

如果要升级为“叙事型地图作品编辑器”，前端需要从“单张海报状态”升级为“两种应用形态 + 多实体协同状态”：

- 编辑器 `Editor`
- 浏览器 `Viewer`

同时要把核心实体从单一 `PosterForm` 扩展为：

- `StoryMap`
- `StoryNode`
- `MediaAsset`

## 2. 目录重构原则

- 保留现有 feature-based 架构
- 保留 `core / shared / features` 分层
- 继续用 `domain / application / infrastructure / ui`
- 尽量复用现有 `theme / map / location / markers / export`
- 将海报编辑器与故事地图编辑器做并存，而不是立刻推翻

## 3. 推荐目录结构

```text
src/
  app/
    editor/
      StoryMapEditorPage.tsx
      PosterEditorPage.tsx
    viewer/
      StoryMapViewerPage.tsx
    routes/
      index.tsx

  core/
    config.ts
    services.ts
    cache/
    http/
    fonts/
    platform/

  shared/
    geo/
    hooks/
    ui/
    utils/

  features/
    auth/
    media/
      domain/
      application/
      infrastructure/
      ui/
    story-map/
      domain/
      application/
      infrastructure/
      ui/
    story-node/
      domain/
      application/
      infrastructure/
      ui/
    timeline/
      domain/
      application/
      infrastructure/
      ui/
    publish/
      domain/
      application/
      infrastructure/
      ui/
    map-story-overlay/
      domain/
      application/
      infrastructure/
      ui/

    theme/
    location/
    map/
    markers/
    export/
    layout/
    poster/
    install/
    updates/
```

## 4. 新增模块职责

## 4.1 features/story-map

职责：

- 作品基础信息管理
- 作品状态切换
- 作品布局配置
- 编辑器与浏览器共享的作品读取

推荐文件：

```text
features/story-map/
  domain/
    types.ts
    validation.ts
    defaults.ts
  application/
    useStoryMapEditor.ts
    useStoryMapViewer.ts
    storyMapReducer.ts
  infrastructure/
    storyMapApi.ts
  ui/
    StoryMapHeader.tsx
    StoryMapSettingsPanel.tsx
    StoryMapContext.tsx
```

## 4.2 features/story-node

职责：

- 地图节点创建、编辑、排序
- 节点详情表单
- 节点与媒体绑定

推荐文件：

```text
features/story-node/
  domain/
    types.ts
    validation.ts
  application/
    useStoryNodeEditor.ts
    useStoryNodeSelection.ts
  infrastructure/
    storyNodeApi.ts
  ui/
    StoryNodeList.tsx
    StoryNodeDetailPanel.tsx
    StoryNodeCard.tsx
```

## 4.3 features/media

职责：

- 文件上传
- 上传进度
- EXIF 解析结果展示
- 媒体库和待定位媒体列表

推荐文件：

```text
features/media/
  domain/
    types.ts
    exif.ts
  application/
    useMediaUpload.ts
    useMediaLibrary.ts
  infrastructure/
    mediaApi.ts
    exifParser.ts
  ui/
    UploadDropzone.tsx
    MediaGrid.tsx
    MediaInspector.tsx
    UnlocatedMediaPanel.tsx
```

## 4.4 features/timeline

职责：

- 节点时间排序
- 时间线展示
- 时间线与地图联动

推荐文件：

```text
features/timeline/
  domain/
    types.ts
    sorting.ts
  application/
    useTimelineSync.ts
  ui/
    TimelinePanel.tsx
    TimelineItem.tsx
```

## 4.5 features/map-story-overlay

职责：

- 在地图上渲染叙事节点
- 点位点击
- 路径连线
- 聚合和高亮

推荐文件：

```text
features/map-story-overlay/
  domain/
    types.ts
    projection.ts
  application/
    useStoryOverlay.ts
  infrastructure/
    clustering.ts
  ui/
    StoryNodeOverlay.tsx
    StoryPathLayer.tsx
    StoryPopup.tsx
```

## 4.6 features/publish

职责：

- 发布设置
- slug 管理
- 分享设置
- 快照与封面图生成状态

推荐文件：

```text
features/publish/
  domain/
    types.ts
  application/
    usePublishControls.ts
  infrastructure/
    publishApi.ts
  ui/
    PublishPanel.tsx
    ShareSettings.tsx
```

## 5. 状态管理建议

## 5.1 不建议继续只用单一 PosterContext

`PosterContext` 适合单张海报编辑，但不适合承载：

- 作品信息
- 节点列表
- 媒体库
- 上传任务
- 发布时间线
- 浏览器 UI 状态

建议拆成：

- `StoryMapContext`
- `MediaUploadContext`
- 保留现有 `PosterContext` 供海报编辑器继续使用

## 5.2 推荐状态分层

编辑器状态拆分：

- `storyMapState`
- `storyNodeState`
- `mediaState`
- `uiState`

浏览器状态拆分：

- `viewerStoryState`
- `activeNodeState`
- `timelineState`

## 6. 页面结构建议

## 6.1 编辑器页面

建议页面布局：

```text
左侧：节点列表 / 媒体库 / 时间线
中间：地图画布
右侧：节点详情 / 作品设置 / 发布设置
```

推荐页面组件：

```text
app/editor/StoryMapEditorPage.tsx
  ├─ StoryMapTopBar
  ├─ StoryNodeSidebar
  ├─ StoryMapCanvas
  ├─ StoryInspectorPanel
  └─ PublishPanel
```

## 6.2 浏览器页面

建议提供三种可切换模式：

- 地图模式
- 故事模式
- 混合模式

推荐页面组件：

```text
app/viewer/StoryMapViewerPage.tsx
  ├─ StoryHero
  ├─ StoryMapCanvas
  ├─ StoryTimeline
  ├─ StoryContentPanel
  └─ StoryPopup
```

## 7. 对现有 Terraink 模块的复用策略

## 7.1 直接复用

- `features/map`
- `features/location`
- `features/theme`
- `features/layout`
- `features/markers`
- `features/export`
- `shared/geo`
- `shared/utils`

## 7.2 需要轻度改造

- `features/poster`
  只保留其中通用的排版、导出和预览能力

- `shared/ui/AppShell`
  现有逻辑偏海报单页，要拆成新路由壳

## 7.3 需要新增平行体系

- `StoryMapContext`
- `StoryMapEditorPage`
- `StoryMapViewerPage`

也就是说，不建议把故事地图硬塞进现有 `PosterForm`。

## 8. 路由建议

如果继续使用单页前端，建议路由如下：

```text
/editor/poster
/editor/story-maps
/editor/story-maps/:id
/story/:slug
```

如果未来迁移到 `Next.js`，可以直接映射为文件路由。

## 9. 迁移步骤

## Step 1：先新增，不替换

第一步不要重写原有海报编辑器，而是并存：

- 旧：Poster Editor
- 新：Story Map Editor

## Step 2：抽公共地图壳

把这些抽成共享组件：

- `MapCanvasShell`
- `ThemeAwareMapView`
- `MapControls`
- `LocationSearchBar`

## Step 3：抽公共导出能力

把 `export` 中与业务无关的能力独立出来：

- capture map
- render text
- export png/pdf/svg

## Step 4：逐步接管主题和 marker

让 story map 使用现有：

- theme palette
- marker icon registry
- location search

## 10. 最小实现版本的前端交付清单

第一版前端最少需要这些组件：

- `StoryMapEditorPage`
- `StoryMapViewerPage`
- `UploadDropzone`
- `UnlocatedMediaPanel`
- `StoryNodeOverlay`
- `StoryNodeList`
- `StoryNodeDetailPanel`
- `StoryPopup`
- `PublishPanel`

## 11. 第一版重构建议

如果你现在开始实施，建议按这个顺序：

1. 新建 `features/story-map`
2. 新建 `features/story-node`
3. 新建 `features/media`
4. 抽 `MapCanvasShell`
5. 新建 `StoryMapContext`
6. 做编辑器页
7. 做公开浏览页
8. 最后再接导出

这样风险最低，也最符合 Terraink 现有代码结构。

