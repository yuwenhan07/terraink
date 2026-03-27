import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type {
  MarkerIconDefinition,
  MarkerItem,
} from "@/features/markers/domain/types";
import type { MapInstanceRef } from "@/features/map/domain/types";
import { MAP_OVERZOOM_SCALE } from "@/features/map/infrastructure/constants";
import { findMarkerIcon } from "@/features/markers/infrastructure/iconRegistry";
import MarkerVisual from "./MarkerVisual";
import {
  MAX_MARKER_SIZE,
  MIN_MARKER_SIZE,
} from "@/features/markers/infrastructure/constants";
import { clamp } from "@/shared/geo/math";

interface MarkerOverlayProps {
  markers: MarkerItem[];
  customIcons: MarkerIconDefinition[];
  mapRef: MapInstanceRef;
  isMarkerEditMode?: boolean;
  activeMarkerId?: string | null;
  onActiveMarkerChange?: (markerId: string | null) => void;
  onMarkerPositionChange?: (markerId: string, lat: number, lon: number) => void;
  onMarkerSizeChange?: (markerId: string, size: number) => void;
}

function getOppositeHighlightColor(input: string): string {
  const hexMatch = input.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!hexMatch) {
    return "#ffd84d";
  }

  const hex = hexMatch[1];
  const r = 255 - Number.parseInt(hex.slice(0, 2), 16);
  const g = 255 - Number.parseInt(hex.slice(2, 4), 16);
  const b = 255 - Number.parseInt(hex.slice(4, 6), 16);

  const toHex = (value: number) =>
    value.toString(16).padStart(2, "0").toUpperCase();

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export default function MarkerOverlay({
  markers,
  customIcons,
  mapRef,
  isMarkerEditMode = false,
  activeMarkerId = null,
  onActiveMarkerChange,
  onMarkerPositionChange,
  onMarkerSizeChange,
}: MarkerOverlayProps) {
  const KEYBOARD_MOVE_STEP = 1;
  const KEYBOARD_RESIZE_STEP = 3;
  const [, setRenderTick] = useState(0);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [draggingMarkerId, setDraggingMarkerId] = useState<string | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [isTouchSelectionActive, setIsTouchSelectionActive] = useState(false);
  const [touchResizeState, setTouchResizeState] = useState<{
    markerId: string;
    startDistance: number;
    startSize: number;
  } | null>(null);

  useEffect(() => {
    setSelectedMarkerId(activeMarkerId);
  }, [activeMarkerId]);

  type TouchPointLike = { clientX: number; clientY: number };
  type TouchListLike = { length: number; [index: number]: TouchPointLike };
  const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    const tagName = target.tagName;
    return (
      target.isContentEditable ||
      tagName === "INPUT" ||
      tagName === "TEXTAREA" ||
      tagName === "SELECT"
    );
  };
  const isMobileTouchInput = (): boolean =>
    typeof window !== "undefined" &&
    window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  const getTouchDistance = (touches: TouchListLike): number => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };
  const map = mapRef.current;
  const projectedMarkers = map
    ? markers.flatMap((marker) => {
        const icon = findMarkerIcon(marker.iconId, customIcons);
        if (!icon) {
          return [];
        }

        try {
          const point = map.project([marker.lon, marker.lat]);
          return [
            {
              marker,
              icon,
              x: point.x / MAP_OVERZOOM_SCALE,
              y: point.y / MAP_OVERZOOM_SCALE,
            },
          ];
        } catch {
          return [];
        }
      })
    : [];

  const updateMarkerByClientPoint = useCallback(
    (markerId: string, clientX: number, clientY: number) => {
      if (!isMarkerEditMode || !onMarkerPositionChange) {
        return;
      }

      const map = mapRef.current;
      const overlay = overlayRef.current;
      if (!map || !overlay) {
        return;
      }

      const bounds = overlay.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        return;
      }

      const x = Math.max(0, Math.min(bounds.width, clientX - bounds.left));
      const y = Math.max(0, Math.min(bounds.height, clientY - bounds.top));

      try {
        const mapPointX = x * MAP_OVERZOOM_SCALE;
        const mapPointY = y * MAP_OVERZOOM_SCALE;
        const position = map.unproject([mapPointX, mapPointY]);
        onMarkerPositionChange(markerId, position.lat, position.lng);
      } catch {
        // Ignore projection failures during drag.
      }
    },
    [isMarkerEditMode, mapRef, onMarkerPositionChange],
  );

  const nudgeMarkerByScreenDelta = useCallback(
    (markerId: string, deltaX: number, deltaY: number) => {
      if (!isMarkerEditMode || !onMarkerPositionChange) {
        return;
      }

      const map = mapRef.current;
      const overlay = overlayRef.current;
      const marker = markers.find((item) => item.id === markerId);
      if (!map || !overlay || !marker) {
        return;
      }

      const bounds = overlay.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        return;
      }

      try {
        const currentPoint = map.project([marker.lon, marker.lat]);
        const overlayX = clamp(
          currentPoint.x / MAP_OVERZOOM_SCALE + deltaX,
          0,
          bounds.width,
        );
        const overlayY = clamp(
          currentPoint.y / MAP_OVERZOOM_SCALE + deltaY,
          0,
          bounds.height,
        );
        const nextPosition = map.unproject([
          overlayX * MAP_OVERZOOM_SCALE,
          overlayY * MAP_OVERZOOM_SCALE,
        ]);
        onMarkerPositionChange(markerId, nextPosition.lat, nextPosition.lng);
      } catch {
        // Ignore projection failures during keyboard nudging.
      }
    },
    [isMarkerEditMode, mapRef, markers, onMarkerPositionChange],
  );

  const handleMarkerPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, markerId: string) => {
      if (!isMarkerEditMode || !onMarkerPositionChange) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.pointerType === "touch") {
        if (isMobileTouchInput()) {
          setSelectedMarkerId(markerId);
          onActiveMarkerChange?.(markerId);
          setIsTouchSelectionActive(false);
          setDraggingMarkerId(markerId);
          updateMarkerByClientPoint(markerId, event.clientX, event.clientY);
          return;
        }
        setSelectedMarkerId(markerId);
        onActiveMarkerChange?.(markerId);
        setIsTouchSelectionActive(true);
        return;
      }

      setSelectedMarkerId(markerId);
      onActiveMarkerChange?.(markerId);
      setIsTouchSelectionActive(false);

      setDraggingMarkerId(markerId);
      updateMarkerByClientPoint(markerId, event.clientX, event.clientY);
    },
    [
      isMarkerEditMode,
      onActiveMarkerChange,
      onMarkerPositionChange,
      updateMarkerByClientPoint,
    ],
  );

  const handleMarkerTouchStart = useCallback(
    (
      event: React.TouchEvent<HTMLDivElement>,
      markerId: string,
      markerSize: number,
    ) => {
      if (
        !isMarkerEditMode ||
        !onMarkerSizeChange ||
        isMobileTouchInput() ||
        event.touches.length < 2 ||
        !isTouchSelectionActive ||
        selectedMarkerId !== markerId
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setTouchResizeState({
        markerId,
        startDistance: getTouchDistance(event.touches),
        startSize: markerSize,
      });
    },
    [
      isMarkerEditMode,
      isTouchSelectionActive,
      onMarkerSizeChange,
      selectedMarkerId,
    ],
  );

  useEffect(() => {
    if (!touchResizeState || !onMarkerSizeChange || isMobileTouchInput()) {
      return;
    }

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length < 2) {
        return;
      }
      event.preventDefault();
      if (touchResizeState.startDistance <= 0) {
        return;
      }
      const nextDistance = getTouchDistance(event.touches as TouchList);
      const nextSize = clamp(
        touchResizeState.startSize *
          (nextDistance / touchResizeState.startDistance),
        MIN_MARKER_SIZE,
        MAX_MARKER_SIZE,
      );
      onMarkerSizeChange(touchResizeState.markerId, nextSize);
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) {
        setTouchResizeState(null);
      }
    };

    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [onMarkerSizeChange, touchResizeState]);

  const handleMarkerTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (event.touches.length === 0) {
        setTouchResizeState(null);
        setIsTouchSelectionActive(false);
      }
    },
    [],
  );

  const handleMarkerWheel = useCallback(
    (
      event: React.WheelEvent<HTMLDivElement>,
      markerId: string,
      markerSize: number,
    ) => {
      if (
        !isMarkerEditMode ||
        !onMarkerSizeChange ||
        selectedMarkerId !== markerId
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const direction = event.deltaY > 0 ? -1 : 1;
      const nextSize = clamp(
        markerSize + direction,
        MIN_MARKER_SIZE,
        MAX_MARKER_SIZE,
      );
      onMarkerSizeChange(markerId, nextSize);
    },
    [isMarkerEditMode, onMarkerSizeChange, selectedMarkerId],
  );

  const handleOverlayWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!isMarkerEditMode || !onMarkerSizeChange || !selectedMarkerId) {
        return;
      }
      const marker = markers.find((item) => item.id === selectedMarkerId);
      if (!marker) {
        return;
      }
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      const nextSize = clamp(
        marker.size + direction,
        MIN_MARKER_SIZE,
        MAX_MARKER_SIZE,
      );
      onMarkerSizeChange(marker.id, nextSize);
    },
    [isMarkerEditMode, markers, onMarkerSizeChange, selectedMarkerId],
  );

  useEffect(() => {
    if (!draggingMarkerId || !isMarkerEditMode) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (draggingMarkerId && onMarkerPositionChange) {
        updateMarkerByClientPoint(
          draggingMarkerId,
          event.clientX,
          event.clientY,
        );
      }
    };

    const stopDrag = () => {
      setDraggingMarkerId(null);
      setTouchResizeState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, [
    draggingMarkerId,
    isMarkerEditMode,
    onMarkerPositionChange,
    updateMarkerByClientPoint,
  ]);

  useEffect(() => {
    if (!draggingMarkerId || !isMarkerEditMode || !isMobileTouchInput()) {
      return;
    }

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        return;
      }
      event.preventDefault();
      const touch = event.touches[0];
      updateMarkerByClientPoint(draggingMarkerId, touch.clientX, touch.clientY);
    };

    const stopDrag = () => {
      setDraggingMarkerId(null);
    };

    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", stopDrag);
    window.addEventListener("touchcancel", stopDrag);

    return () => {
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", stopDrag);
      window.removeEventListener("touchcancel", stopDrag);
    };
  }, [draggingMarkerId, isMarkerEditMode, updateMarkerByClientPoint]);

  useEffect(() => {
    if (!isMarkerEditMode && draggingMarkerId) {
      setDraggingMarkerId(null);
    }
    if (!isMarkerEditMode) {
      setSelectedMarkerId(null);
      onActiveMarkerChange?.(null);
      setTouchResizeState(null);
      setIsTouchSelectionActive(false);
    }
  }, [isMarkerEditMode, draggingMarkerId, onActiveMarkerChange]);

  useEffect(() => {
    if (!isMarkerEditMode || !isTouchSelectionActive || !selectedMarkerId) {
      return;
    }

    const { overflow, touchAction } = document.body.style;
    const { overflow: htmlOverflow, touchAction: htmlTouchAction } =
      document.documentElement.style;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.touchAction = "none";

    return () => {
      document.body.style.overflow = overflow;
      document.body.style.touchAction = touchAction;
      document.documentElement.style.overflow = htmlOverflow;
      document.documentElement.style.touchAction = htmlTouchAction;
    };
  }, [isMarkerEditMode, isTouchSelectionActive, selectedMarkerId]);

  useEffect(() => {
    if (!isMarkerEditMode || !selectedMarkerId) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      const marker = markers.find((item) => item.id === selectedMarkerId);
      if (!marker) {
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        nudgeMarkerByScreenDelta(marker.id, 0, -KEYBOARD_MOVE_STEP);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        nudgeMarkerByScreenDelta(marker.id, 0, KEYBOARD_MOVE_STEP);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        nudgeMarkerByScreenDelta(marker.id, -KEYBOARD_MOVE_STEP, 0);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        nudgeMarkerByScreenDelta(marker.id, KEYBOARD_MOVE_STEP, 0);
        return;
      }

      if (!onMarkerSizeChange) {
        return;
      }

      const isPlus = event.key === "+" || event.key === "=";
      const isMinus = event.key === "-" || event.key === "_";
      if (!isPlus && !isMinus) {
        return;
      }
      event.preventDefault();
      const isDesktopInput = !window.matchMedia(
        "(hover: none) and (pointer: coarse)",
      ).matches;
      const step = isDesktopInput ? KEYBOARD_RESIZE_STEP : 1;
      const delta = isPlus ? step : -step;
      const nextSize = clamp(
        marker.size + delta,
        MIN_MARKER_SIZE,
        MAX_MARKER_SIZE,
      );
      onMarkerSizeChange(marker.id, nextSize);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isMarkerEditMode,
    markers,
    nudgeMarkerByScreenDelta,
    onMarkerSizeChange,
    selectedMarkerId,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const sync = () => {
      setRenderTick((value) => value + 1);
    };

    map.on("move", sync);
    map.on("moveend", sync);
    map.on("rotate", sync);
    map.on("resize", sync);
    map.on("load", sync);

    return () => {
      map.off("move", sync);
      map.off("moveend", sync);
      map.off("rotate", sync);
      map.off("resize", sync);
      map.off("load", sync);
    };
  }, [mapRef]);

  if (projectedMarkers.length === 0) {
    return null;
  }

  return (
    <div
      ref={overlayRef}
      className={`poster-marker-overlay${isMarkerEditMode ? " is-edit-mode" : ""}`}
      aria-hidden={!isMarkerEditMode ? "true" : undefined}
      onWheel={handleOverlayWheel}
    >
      {projectedMarkers.map(({ marker, icon, x, y }) => (
        <div
          key={marker.id}
          className={`poster-marker${isMarkerEditMode ? " is-draggable" : ""}${
            draggingMarkerId === marker.id ? " is-dragging" : ""
          }${selectedMarkerId === marker.id ? " is-selected" : ""}${
            touchResizeState?.markerId === marker.id ? " is-resizing" : ""
          }`}
          style={
            {
              left: `${x}px`,
              top: `${y}px`,
              "--marker-highlight-color": getOppositeHighlightColor(marker.color),
            } as CSSProperties
          }
          onPointerDown={(event) => handleMarkerPointerDown(event, marker.id)}
          onWheel={(event) => handleMarkerWheel(event, marker.id, marker.size)}
          onTouchStart={(event) =>
            handleMarkerTouchStart(event, marker.id, marker.size)
          }
          onTouchEnd={handleMarkerTouchEnd}
          onTouchCancel={handleMarkerTouchEnd}
        >
          <MarkerVisual icon={icon} size={marker.size} color={marker.color} />
        </div>
      ))}
    </div>
  );
}
