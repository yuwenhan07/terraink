import { useEffect, useRef, useState } from "react";
import type { MapInstanceRef } from "@/features/map/domain/types";
import type { ImportedMediaAsset } from "@/features/media/domain/types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface StoryPopupProps {
  item: ImportedMediaAsset;
  mapRef: MapInstanceRef;
  onClose: () => void;
}

export default function StoryPopup({
  item,
  mapRef,
  onClose,
}: StoryPopupProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(
    null,
  );

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer || !Number.isFinite(item.lat) || !Number.isFinite(item.lon)) {
      return;
    }

    const syncPosition = () => {
      try {
        const bounds = layer.getBoundingClientRect();
        const point = map.project([item.lon as number, item.lat as number]);
        const clampedLeft = clamp(point.x, 136, Math.max(136, bounds.width - 136));
        const clampedTop = clamp(point.y, 88, Math.max(88, bounds.height - 88));
        setPosition({ left: clampedLeft, top: clampedTop });
      } catch {
        setPosition(null);
      }
    };

    syncPosition();
    map.on("render", syncPosition);
    map.on("resize", syncPosition);

    return () => {
      map.off("render", syncPosition);
      map.off("resize", syncPosition);
    };
  }, [item.lat, item.lon, mapRef]);

  if (!position) {
    return null;
  }

  return (
    <div ref={layerRef} className="story-popup-layer">
      <article
        className="story-popup-card"
        style={{ left: `${position.left}px`, top: `${position.top}px` }}
      >
        <button
          type="button"
          className="story-popup-close"
          onClick={onClose}
          aria-label="Close memory popup"
        >
          x
        </button>
        <img src={item.previewUrl} alt={item.fileName} className="story-popup-image" />
        <div className="story-popup-body">
          <p className="story-popup-title">{item.fileName}</p>
          <p className="story-popup-coords">
            {(item.lat as number).toFixed(5)}, {(item.lon as number).toFixed(5)}
          </p>
          <p className="story-popup-meta">
            {item.capturedAt
              ? item.capturedAt.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3")
              : "No EXIF capture time"}
          </p>
        </div>
      </article>
    </div>
  );
}
