# Story Map 数据库设计

## 1. 设计目标

这一版数据库模型服务于以下能力：

- 创建和管理叙事型地图作品
- 上传图片并保存媒体元数据
- 将图片绑定到地图节点
- 支持时间排序、地图点位和公开发布
- 为后续的协作、评论、模板、导出快照预留扩展空间

数据库建议使用 `PostgreSQL + PostGIS`。

理由：

- PostgreSQL 适合复杂业务关系
- PostGIS 适合后续空间检索、范围过滤、聚合、距离排序
- 便于从点位作品进一步扩展到路径、区域、多图层叙事

## 2. 核心实体关系

核心关系如下：

- 一个 `user` 可以创建多个 `story_map`
- 一个 `story_map` 包含多个 `story_node`
- 一个 `story_node` 可以关联多个 `media_asset`
- 一个 `story_map` 可以设置一个 `cover_media`
- 一个 `story_map` 可以有多个 `story_snapshot`

## 3. 表设计

## 3.1 users

用途：作者账户。

```sql
create table users (
  id uuid primary key,
  email varchar(255) not null unique,
  username varchar(64) not null unique,
  display_name varchar(128),
  avatar_url text,
  role varchar(32) not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

字段说明：

- `role`：`user | admin`

## 3.2 story_maps

用途：一份叙事地图作品。

```sql
create table story_maps (
  id uuid primary key,
  user_id uuid not null references users(id),
  title varchar(200) not null,
  subtitle varchar(300),
  description text,
  slug varchar(200) not null unique,
  status varchar(32) not null default 'draft',
  visibility varchar(32) not null default 'private',
  cover_media_id uuid,
  theme_id varchar(100),
  center_lat double precision,
  center_lon double precision,
  zoom double precision,
  bearing double precision default 0,
  pitch double precision default 0,
  layout_config jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

字段说明：

- `status`：`draft | published | archived`
- `visibility`：`public | private | unlisted`
- `layout_config`：保存主题、路径展示、时间线开关、卡片布局等

索引建议：

```sql
create index idx_story_maps_user_id on story_maps(user_id);
create index idx_story_maps_status on story_maps(status);
create index idx_story_maps_visibility on story_maps(visibility);
create index idx_story_maps_published_at on story_maps(published_at desc);
```

## 3.3 media_assets

用途：保存上传媒体及其元数据。

```sql
create table media_assets (
  id uuid primary key,
  user_id uuid not null references users(id),
  media_type varchar(32) not null,
  original_url text not null,
  preview_url text not null,
  thumbnail_url text,
  mime_type varchar(100),
  file_size bigint,
  width integer,
  height integer,
  duration_seconds integer,
  exif_data jsonb,
  exif_lat double precision,
  exif_lon double precision,
  captured_at timestamptz,
  source_type varchar(32) not null default 'upload',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

字段说明：

- `media_type`：`image | audio | video`
- `source_type`：`upload | imported`
- `exif_data`：原始 EXIF 解析结果

索引建议：

```sql
create index idx_media_assets_user_id on media_assets(user_id);
create index idx_media_assets_captured_at on media_assets(captured_at);
create index idx_media_assets_exif_coords on media_assets(exif_lat, exif_lon);
```

## 3.4 story_nodes

用途：地图上的叙事节点。

```sql
create table story_nodes (
  id uuid primary key,
  story_map_id uuid not null references story_maps(id) on delete cascade,
  title varchar(200) not null,
  description text,
  lat double precision not null,
  lon double precision not null,
  geom geography(point, 4326),
  address_text varchar(300),
  happened_at timestamptz,
  location_source varchar(32) not null default 'manual',
  location_confidence integer not null default 100,
  order_index integer not null default 0,
  marker_style jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

字段说明：

- `location_source`：`exif | manual | search`
- `location_confidence`：0-100，用于后续提示用户修正
- `marker_style`：颜色、图标、尺寸、选中态等

索引建议：

```sql
create index idx_story_nodes_story_map_id on story_nodes(story_map_id);
create index idx_story_nodes_order_index on story_nodes(story_map_id, order_index);
create index idx_story_nodes_happened_at on story_nodes(story_map_id, happened_at);
create index idx_story_nodes_geom on story_nodes using gist(geom);
```

建议在写入时同步生成：

```sql
geom = ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
```

## 3.5 story_node_media

用途：节点和媒体的多对多绑定。

```sql
create table story_node_media (
  id uuid primary key,
  story_node_id uuid not null references story_nodes(id) on delete cascade,
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (story_node_id, media_asset_id)
);
```

索引建议：

```sql
create index idx_story_node_media_node_id on story_node_media(story_node_id, sort_order);
create index idx_story_node_media_media_id on story_node_media(media_asset_id);
```

## 3.6 story_snapshots

用途：保存导出快照或分享图。

```sql
create table story_snapshots (
  id uuid primary key,
  story_map_id uuid not null references story_maps(id) on delete cascade,
  snapshot_type varchar(32) not null,
  asset_url text not null,
  width integer,
  height integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

字段说明：

- `snapshot_type`：`cover | share | poster | pdf`

## 3.7 story_collaborators

用途：为后续多人协作预留。

```sql
create table story_collaborators (
  id uuid primary key,
  story_map_id uuid not null references story_maps(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role varchar(32) not null default 'editor',
  created_at timestamptz not null default now(),
  unique (story_map_id, user_id)
);
```

## 4. 推荐的对象存储目录规则

对象存储建议采用：

```text
story-maps/
  {userId}/
    originals/{mediaId}.jpg
    previews/{mediaId}.webp
    thumbnails/{mediaId}.webp
    snapshots/{storyMapId}/{snapshotId}.png
```

这样做的好处：

- 原图和派生图隔离
- 用户级路径清晰
- 后续清理和生命周期管理方便

## 5. 典型查询

## 5.1 获取作品及其节点

```sql
select *
from story_maps
where id = $1;

select *
from story_nodes
where story_map_id = $1
order by order_index asc, happened_at asc nulls last;
```

## 5.2 获取节点的媒体

```sql
select m.*, snm.caption, snm.sort_order
from story_node_media snm
join media_assets m on m.id = snm.media_asset_id
where snm.story_node_id = $1
order by snm.sort_order asc;
```

## 5.3 按作品范围计算地图 bounds

可通过节点坐标聚合：

```sql
select
  min(lat) as min_lat,
  max(lat) as max_lat,
  min(lon) as min_lon,
  max(lon) as max_lon
from story_nodes
where story_map_id = $1;
```

## 6. 后续扩展方向

后续如果功能升级，可以继续扩展：

- `story_paths`：记录路径折线与轨迹
- `story_tags`：作品标签
- `story_map_views`：浏览统计
- `story_comments`：评论
- `story_reactions`：点赞收藏

## 7. 迁移建议

第一版可以只建这 5 张核心表：

1. `users`
2. `story_maps`
3. `media_assets`
4. `story_nodes`
5. `story_node_media`

等发布链路稳定后，再补：

- `story_snapshots`
- `story_collaborators`

