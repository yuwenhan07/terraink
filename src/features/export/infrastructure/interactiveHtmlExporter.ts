import type { ImportedMediaAsset } from "@/features/media/domain/types";
import type { MarkerProjectionInput } from "@/features/markers/domain/types";
import { projectMarkerToCanvas } from "@/features/markers/infrastructure/projection";

interface InteractiveHtmlExportOptions {
  canvas: HTMLCanvasElement;
  items: ImportedMediaAsset[];
  markerProjection: MarkerProjectionInput;
  markerScaleX: number;
  markerScaleY: number;
  title: string;
  subtitle: string;
  themeLabel: string;
}

interface InteractiveHotspotRecord {
  id: string;
  fileName: string;
  capturedAt: string;
  lat: number;
  lon: number;
  previewDataUrl: string;
  xPercent: number;
  yPercent: number;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCapturedAt(input: string | null): string {
  if (!input) {
    return "No capture time";
  }

  return input.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
}

function getExportMimeType(item: ImportedMediaAsset): string {
  const normalized = String(item.mimeType ?? "").trim().toLowerCase();
  if (normalized === "image/png" || normalized === "image/webp") {
    return normalized;
  }
  return "image/jpeg";
}

function serializePayload(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load image: ${src}`));
    image.src = src;
  });
}

async function createPreviewDataUrl(
  item: ImportedMediaAsset,
  maxDimension = 900,
): Promise<string> {
  try {
    const image = await loadImage(item.previewUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width <= 0 || height <= 0) {
      return item.previewUrl;
    }

    const scale = Math.min(maxDimension / width, maxDimension / height, 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return item.previewUrl;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const mimeType = getExportMimeType(item);
    const quality = mimeType === "image/jpeg" ? 0.86 : undefined;
    return canvas.toDataURL(mimeType, quality);
  } catch {
    return "";
  }
}

async function buildHotspots(
  items: ImportedMediaAsset[],
  markerProjection: MarkerProjectionInput,
  markerScaleX: number,
  markerScaleY: number,
  canvasWidth: number,
  canvasHeight: number,
): Promise<InteractiveHotspotRecord[]> {
  const projectedItems = items
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))
    .map((item) => {
      const point = projectMarkerToCanvas(
        item.lat as number,
        item.lon as number,
        markerProjection,
      );
      const x = point.x * markerScaleX;
      const y = point.y * markerScaleY;
      return {
        item,
        x,
        y,
        visible:
          Number.isFinite(x) &&
          Number.isFinite(y) &&
          x >= 0 &&
          x <= canvasWidth &&
          y >= 0 &&
          y <= canvasHeight,
      };
    })
    .filter((entry) => entry.visible);

  const previewDataUrls = await Promise.all(
    projectedItems.map(({ item }) => createPreviewDataUrl(item)),
  );

  return projectedItems.map(({ item, x, y }, index) => ({
    id: item.id,
    fileName: item.fileName,
    capturedAt: formatCapturedAt(item.capturedAt),
    lat: item.lat as number,
    lon: item.lon as number,
    previewDataUrl: previewDataUrls[index] ?? "",
    xPercent: (x / canvasWidth) * 100,
    yPercent: (y / canvasHeight) * 100,
  }));
}

export async function createInteractiveHtmlBlob({
  canvas,
  items,
  markerProjection,
  markerScaleX,
  markerScaleY,
  title,
  subtitle,
  themeLabel,
}: InteractiveHtmlExportOptions): Promise<Blob> {
  const backgroundDataUrl = canvas.toDataURL("image/png");
  const hotspots = await buildHotspots(
    items,
    markerProjection,
    markerScaleX,
    markerScaleY,
    canvas.width,
    canvas.height,
  );

  const payload = serializePayload({
    backgroundDataUrl,
    hotspots,
    width: canvas.width,
    height: canvas.height,
    title,
    subtitle,
    themeLabel,
  });

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} - Interactive Memory Map</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #071018;
        --panel: rgba(9, 20, 31, 0.92);
        --panel-border: rgba(255, 255, 255, 0.12);
        --text: #eef4fb;
        --muted: rgba(238, 244, 251, 0.68);
        --accent: #ffd84d;
        --accent-strong: #ffb800;
        --shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top, rgba(255, 216, 77, 0.12), transparent 34%),
          linear-gradient(180deg, #09131f 0%, #050b11 100%);
        color: var(--text);
        font-family: "Avenir Next", "Segoe UI", sans-serif;
      }

      .app {
        width: min(1400px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 24px 0 32px;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 16px;
        margin-bottom: 20px;
      }

      .eyebrow {
        margin: 0 0 8px;
        color: var(--muted);
        font-size: 12px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        font-size: clamp(28px, 4vw, 44px);
        line-height: 1.04;
      }

      .subtitle {
        margin: 8px 0 0;
        color: var(--muted);
        font-size: 14px;
      }

      .badge {
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid var(--panel-border);
        color: var(--muted);
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1.3fr) minmax(320px, 420px);
        gap: 20px;
        align-items: start;
      }

      .poster-panel,
      .inspector {
        border: 1px solid var(--panel-border);
        border-radius: 24px;
        background: var(--panel);
        box-shadow: var(--shadow);
        backdrop-filter: blur(20px);
      }

      .poster-panel {
        padding: 20px;
      }

      .poster-stage {
        position: relative;
        width: 100%;
        aspect-ratio: var(--poster-aspect, 1 / 1);
        overflow: hidden;
        border-radius: 18px;
        background: #02060a;
      }

      .poster-stage img {
        display: block;
        width: 100%;
        height: 100%;
      }

      .hotspot-layer {
        position: absolute;
        inset: 0;
      }

      .hotspot {
        position: absolute;
        width: 34px;
        height: 34px;
        border: 3px solid rgba(7, 16, 24, 0.88);
        border-radius: 999px;
        background: linear-gradient(180deg, var(--accent) 0%, var(--accent-strong) 100%);
        color: #041018;
        font-weight: 800;
        font-size: 14px;
        line-height: 1;
        cursor: pointer;
        transform: translate(-50%, -50%);
        box-shadow: 0 8px 22px rgba(255, 184, 0, 0.28);
      }

      .hotspot.is-active {
        width: 42px;
        height: 42px;
        border-color: #ffffff;
        box-shadow: 0 0 0 5px rgba(255, 216, 77, 0.18);
      }

      .poster-note {
        margin: 14px 0 0;
        color: var(--muted);
        font-size: 13px;
      }

      .inspector {
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        min-height: 100%;
      }

      .inspector-media {
        aspect-ratio: 1 / 1;
        width: 100%;
        border-radius: 18px;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.04);
        display: grid;
        place-items: center;
      }

      .inspector-media img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .empty-state {
        margin: 0;
        color: var(--muted);
        font-size: 14px;
      }

      .memory-title {
        margin: 0;
        font-size: 24px;
        line-height: 1.1;
        word-break: break-word;
      }

      .memory-meta {
        display: grid;
        gap: 10px;
      }

      .memory-meta-row {
        display: grid;
        gap: 4px;
      }

      .memory-meta-label {
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }

      .memory-meta-value {
        font-size: 15px;
      }

      .memory-list {
        display: grid;
        gap: 10px;
        max-height: 280px;
        overflow: auto;
        padding-right: 4px;
      }

      .memory-list-item {
        width: 100%;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.04);
        color: inherit;
        text-align: left;
        cursor: pointer;
      }

      .memory-list-item.is-active {
        border-color: rgba(255, 216, 77, 0.72);
        background: rgba(255, 216, 77, 0.12);
      }

      .memory-list-item strong,
      .memory-list-item span {
        display: block;
      }

      .memory-list-item strong {
        font-size: 14px;
        margin-bottom: 4px;
      }

      .memory-list-item span {
        color: var(--muted);
        font-size: 12px;
      }

      @media (max-width: 980px) {
        .app {
          width: min(100vw - 20px, 1100px);
          padding-top: 18px;
        }

        .layout {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="app">
      <div class="header">
        <div>
          <p class="eyebrow">Interactive Memory Map</p>
          <h1>${escapeHtml(title)}</h1>
          <p class="subtitle">${escapeHtml(subtitle)}</p>
        </div>
        <div class="badge">${escapeHtml(themeLabel)}</div>
      </div>

      <div class="layout">
        <section class="poster-panel">
          <div class="poster-stage" id="poster-stage">
            <img alt="Exported poster" src="" id="poster-image" />
            <div class="hotspot-layer" id="hotspot-layer"></div>
          </div>
          <p class="poster-note" id="poster-note"></p>
        </section>

        <aside class="inspector">
          <div class="inspector-media" id="inspector-media">
            <p class="empty-state" id="empty-state">Select a memory hotspot to inspect the photo and metadata.</p>
            <img alt="" id="memory-image" hidden />
          </div>

          <div id="memory-details" hidden>
            <h2 class="memory-title" id="memory-title"></h2>
            <div class="memory-meta">
              <div class="memory-meta-row">
                <span class="memory-meta-label">Captured At</span>
                <span class="memory-meta-value" id="memory-captured-at"></span>
              </div>
              <div class="memory-meta-row">
                <span class="memory-meta-label">Coordinates</span>
                <span class="memory-meta-value" id="memory-coordinates"></span>
              </div>
            </div>
          </div>

          <div class="memory-list" id="memory-list"></div>
        </aside>
      </div>
    </div>

    <script type="application/json" id="interactive-memory-data">${payload}</script>
    <script>
      (function() {
        const payloadNode = document.getElementById("interactive-memory-data");
        const payload = JSON.parse(payloadNode.textContent || "{}");
        const posterImage = document.getElementById("poster-image");
        const posterStage = document.getElementById("poster-stage");
        const hotspotLayer = document.getElementById("hotspot-layer");
        const posterNote = document.getElementById("poster-note");
        const memoryList = document.getElementById("memory-list");
        const emptyState = document.getElementById("empty-state");
        const memoryImage = document.getElementById("memory-image");
        const memoryDetails = document.getElementById("memory-details");
        const memoryTitle = document.getElementById("memory-title");
        const memoryCapturedAt = document.getElementById("memory-captured-at");
        const memoryCoordinates = document.getElementById("memory-coordinates");

        posterImage.src = payload.backgroundDataUrl || "";
        if (payload.width && payload.height) {
          posterStage.style.setProperty("--poster-aspect", payload.width + " / " + payload.height);
        }

        const hotspots = Array.isArray(payload.hotspots) ? payload.hotspots : [];
        posterNote.textContent = hotspots.length > 0
          ? "Click a hotspot on the poster or choose a memory from the list."
          : "No visible geotagged memories were available in this export.";

        let activeId = hotspots[0] ? hotspots[0].id : null;

        function renderSelection(nextId) {
          const record = hotspots.find((item) => item.id === nextId) || null;
          activeId = record ? record.id : null;

          hotspotLayer.querySelectorAll(".hotspot").forEach((node) => {
            node.classList.toggle("is-active", node.dataset.id === activeId);
          });
          memoryList.querySelectorAll(".memory-list-item").forEach((node) => {
            node.classList.toggle("is-active", node.dataset.id === activeId);
          });

          if (!record) {
            emptyState.hidden = false;
            memoryImage.hidden = true;
            memoryDetails.hidden = true;
            return;
          }

          emptyState.hidden = true;
          memoryImage.hidden = !record.previewDataUrl;
          if (record.previewDataUrl) {
            memoryImage.src = record.previewDataUrl;
            memoryImage.alt = record.fileName;
          }
          memoryDetails.hidden = false;
          memoryTitle.textContent = record.fileName;
          memoryCapturedAt.textContent = record.capturedAt;
          memoryCoordinates.textContent = record.lat.toFixed(5) + ", " + record.lon.toFixed(5);
        }

        hotspots.forEach((record, index) => {
          const hotspot = document.createElement("button");
          hotspot.type = "button";
          hotspot.className = "hotspot";
          hotspot.dataset.id = record.id;
          hotspot.style.left = record.xPercent + "%";
          hotspot.style.top = record.yPercent + "%";
          hotspot.textContent = String(index + 1);
          hotspot.title = record.fileName;
          hotspot.addEventListener("click", function() {
            renderSelection(record.id);
          });
          hotspotLayer.appendChild(hotspot);

          const listItem = document.createElement("button");
          listItem.type = "button";
          listItem.className = "memory-list-item";
          listItem.dataset.id = record.id;
          listItem.innerHTML = "<strong></strong><span></span>";
          listItem.querySelector("strong").textContent = record.fileName;
          listItem.querySelector("span").textContent = record.capturedAt;
          listItem.addEventListener("click", function() {
            renderSelection(record.id);
          });
          memoryList.appendChild(listItem);
        });

        renderSelection(activeId);
      })();
    </script>
  </body>
</html>`;

  return new Blob([html], { type: "text/html;charset=utf-8" });
}
