# Story Map API 设计

## 1. 设计目标

API 需要覆盖三条主线：

- 作者侧：创建、编辑、上传、发布
- 作品侧：公开浏览、节点读取、分享访问
- 媒体侧：上传、EXIF 提取、绑定节点

统一响应格式建议：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

错误响应建议：

```json
{
  "code": 4001,
  "message": "invalid params"
}
```

## 2. 鉴权约定

作者侧接口：

- 需要登录态
- 使用 `Authorization: Bearer <token>`

公开作品接口：

- 不需要登录
- 只允许访问 `public` 或 `unlisted` 作品

## 3. 作品接口

## 3.1 创建作品

接口名称：创建 Story Map

- 请求方式：`POST`
- 请求路径：`/api/story-maps`

请求体：

```json
{
  "title": "Our Kyoto Memory",
  "subtitle": "Spring 2025",
  "description": "A small story across shrines, streets and coffee shops."
}
```

响应：

```json
{
  "code": 0,
  "data": {
    "id": "sm_001",
    "status": "draft",
    "slug": "our-kyoto-memory"
  }
}
```

## 3.2 获取作品详情

- 请求方式：`GET`
- 请求路径：`/api/story-maps/:id`

响应包含：

- 作品基础信息
- 节点列表
- 封面媒体
- 主题和布局配置

## 3.3 更新作品

- 请求方式：`PATCH`
- 请求路径：`/api/story-maps/:id`

请求体：

```json
{
  "title": "Our Kyoto Memory",
  "subtitle": "Spring 2025 Revisited",
  "description": "Updated description",
  "themeId": "midnight_blue",
  "visibility": "unlisted",
  "layoutConfig": {
    "showTimeline": true,
    "showPath": true,
    "cardLayout": "side-panel"
  }
}
```

## 3.4 发布作品

- 请求方式：`POST`
- 请求路径：`/api/story-maps/:id/publish`

请求体：

```json
{
  "slug": "our-kyoto-memory",
  "visibility": "public"
}
```

响应：

```json
{
  "code": 0,
  "data": {
    "id": "sm_001",
    "status": "published",
    "slug": "our-kyoto-memory",
    "publishedAt": "2026-04-15T10:00:00Z"
  }
}
```

## 3.5 取消发布

- 请求方式：`POST`
- 请求路径：`/api/story-maps/:id/unpublish`

## 3.6 获取当前用户作品列表

- 请求方式：`GET`
- 请求路径：`/api/story-maps`

查询参数：

- `status`
- `page`
- `pageSize`

## 4. 节点接口

## 4.1 创建节点

- 请求方式：`POST`
- 请求路径：`/api/story-maps/:id/nodes`

请求体：

```json
{
  "title": "Fushimi Inari",
  "description": "The first stop of the day",
  "lat": 34.9671,
  "lon": 135.7727,
  "addressText": "Kyoto, Japan",
  "happenedAt": "2025-03-21T09:30:00Z",
  "locationSource": "manual"
}
```

## 4.2 更新节点

- 请求方式：`PATCH`
- 请求路径：`/api/story-nodes/:nodeId`

请求体允许更新：

- `title`
- `description`
- `lat`
- `lon`
- `addressText`
- `happenedAt`
- `orderIndex`
- `markerStyle`

## 4.3 删除节点

- 请求方式：`DELETE`
- 请求路径：`/api/story-nodes/:nodeId`

## 4.4 节点排序

- 请求方式：`POST`
- 请求路径：`/api/story-maps/:id/nodes/reorder`

请求体：

```json
{
  "nodeIds": ["node_3", "node_1", "node_2"]
}
```

## 5. 媒体接口

## 5.1 获取上传凭证

如果采用直传对象存储，建议先发这个接口。

- 请求方式：`POST`
- 请求路径：`/api/media/upload-url`

请求体：

```json
{
  "filename": "kyoto.jpg",
  "mimeType": "image/jpeg",
  "size": 5234123
}
```

响应：

```json
{
  "code": 0,
  "data": {
    "uploadUrl": "https://...",
    "objectKey": "story-maps/user_1/originals/media_1.jpg",
    "mediaId": "media_1"
  }
}
```

## 5.2 确认上传完成

- 请求方式：`POST`
- 请求路径：`/api/media/:mediaId/complete`

后端在这里做：

- 文件存在性确认
- EXIF 提取
- 缩略图生成
- 预览图生成
- 数据库存储

响应：

```json
{
  "code": 0,
  "data": {
    "id": "media_1",
    "thumbnailUrl": "https://...",
    "previewUrl": "https://...",
    "exifLat": 34.9671,
    "exifLon": 135.7727,
    "capturedAt": "2025-03-21T09:30:00Z"
  }
}
```

## 5.3 查询媒体详情

- 请求方式：`GET`
- 请求路径：`/api/media/:mediaId`

## 5.4 删除媒体

- 请求方式：`DELETE`
- 请求路径：`/api/media/:mediaId`

## 6. 节点媒体绑定接口

## 6.1 绑定媒体到节点

- 请求方式：`POST`
- 请求路径：`/api/story-nodes/:nodeId/media`

请求体：

```json
{
  "mediaAssetId": "media_1",
  "caption": "Morning light at the shrine",
  "sortOrder": 1
}
```

## 6.2 节点媒体排序

- 请求方式：`POST`
- 请求路径：`/api/story-nodes/:nodeId/media/reorder`

请求体：

```json
{
  "mediaIds": ["media_2", "media_1", "media_3"]
}
```

## 6.3 移除节点媒体

- 请求方式：`DELETE`
- 请求路径：`/api/story-nodes/:nodeId/media/:mediaId`

## 7. 位置与地理接口

## 7.1 地点搜索

- 请求方式：`GET`
- 请求路径：`/api/geo/search?q=kyoto`

用途：

- 复用 Terraink 的位置搜索逻辑
- 给无 GPS 图片做搜索定位

## 7.2 逆地理编码

- 请求方式：`GET`
- 请求路径：`/api/geo/reverse?lat=34.9&lon=135.7`

用途：

- 节点补全 `addressText`
- 自动地点命名

## 8. 公开访问接口

## 8.1 获取公开作品

- 请求方式：`GET`
- 请求路径：`/api/public/story-maps/:slug`

响应结构建议：

```json
{
  "code": 0,
  "data": {
    "storyMap": {
      "id": "sm_001",
      "title": "Our Kyoto Memory",
      "subtitle": "Spring 2025",
      "description": "A small story across shrines, streets and coffee shops.",
      "themeId": "midnight_blue",
      "layoutConfig": {
        "showTimeline": true,
        "showPath": true
      }
    },
    "nodes": [
      {
        "id": "node_1",
        "title": "Fushimi Inari",
        "lat": 34.9671,
        "lon": 135.7727,
        "happenedAt": "2025-03-21T09:30:00Z",
        "media": []
      }
    ]
  }
}
```

## 8.2 获取作品分享信息

- 请求方式：`GET`
- 请求路径：`/api/public/story-maps/:slug/share`

返回：

- 标题
- 描述
- 封面图
- OG 信息

## 9. 导出接口

## 9.1 请求生成分享图

- 请求方式：`POST`
- 请求路径：`/api/story-maps/:id/snapshots/share`

## 9.2 请求生成封面海报

- 请求方式：`POST`
- 请求路径：`/api/story-maps/:id/snapshots/poster`

响应：

```json
{
  "code": 0,
  "data": {
    "snapshotId": "snap_001",
    "assetUrl": "https://..."
  }
}
```

## 10. 错误码建议

```text
4001 参数错误
4002 文件类型不支持
4003 文件过大
4004 slug 已存在
4005 作品未发布
4006 节点不存在
4007 媒体不存在
4008 权限不足
5001 EXIF 解析失败
5002 缩略图生成失败
5003 对象存储写入失败
5004 地理编码服务失败
```

## 11. API 演进顺序

第一版先做这些接口就够：

1. `POST /api/story-maps`
2. `GET /api/story-maps/:id`
3. `PATCH /api/story-maps/:id`
4. `POST /api/media/upload-url`
5. `POST /api/media/:mediaId/complete`
6. `POST /api/story-maps/:id/nodes`
7. `PATCH /api/story-nodes/:nodeId`
8. `POST /api/story-nodes/:nodeId/media`
9. `POST /api/story-maps/:id/publish`
10. `GET /api/public/story-maps/:slug`

