import { useEffect, useMemo } from "react";
import type { FeatureCollection, Point } from "geojson";
import type { GeoJSONSource, MapMouseEvent } from "maplibre-gl";
import type { MapInstanceRef } from "@/features/map/domain/types";
import type { ImportedMediaAsset } from "@/features/media/domain/types";
import type { ResolvedTheme } from "@/features/theme/domain/types";
import {
  hslToHexColor,
  normalizeHexColor,
  parseHex,
  rgbToHsl,
} from "@/shared/utils/color";
import { useStoryMapContext } from "@/features/story-map/ui/StoryMapContext";
import StoryPopup from "@/features/map-story-overlay/ui/StoryPopup";

const SOURCE_ID = "story-media-source";
const CLUSTER_LAYER_ID = "story-media-clusters";
const CLUSTER_COUNT_LAYER_ID = "story-media-cluster-count";
const POINT_LAYER_ID = "story-media-points";

interface StoryNodeOverlayProps {
  mapRef: MapInstanceRef;
  theme: ResolvedTheme;
}

interface StoryOverlayPalette {
  fill: string;
  stroke: string;
  selectedFill: string;
  selectedStroke: string;
  clusterText: string;
}

function getRelativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) {
    return 0;
  }

  const channelToLinear = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  const red = channelToLinear(rgb.r);
  const green = channelToLinear(rgb.g);
  const blue = channelToLinear(rgb.b);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function getContrastRatio(left: string, right: string): number {
  const leftLuminance = getRelativeLuminance(left);
  const rightLuminance = getRelativeLuminance(right);
  const lighter = Math.max(leftLuminance, rightLuminance);
  const darker = Math.min(leftLuminance, rightLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function makeThemeColorPop(color: string, darkBackground: boolean): string {
  const normalized = normalizeHexColor(color);
  const rgb = parseHex(normalized);
  if (!rgb) {
    return "";
  }

  const hsl = rgbToHsl(rgb);
  return hslToHexColor({
    h: hsl.h,
    s: Math.max(hsl.s, 0.72),
    l: darkBackground ? Math.max(hsl.l, 0.62) : Math.min(hsl.l, 0.4),
  });
}

function deriveOverlayPalette(theme: ResolvedTheme): StoryOverlayPalette {
  const background = normalizeHexColor(theme.ui.bg) || "#0b1620";
  const land = normalizeHexColor(theme.map.land) || background;
  const darkBackground =
    (getRelativeLuminance(background) + getRelativeLuminance(land)) / 2 < 0.32;

  const candidates = [
    theme.ui.text,
    theme.map.water,
    theme.map.roads.major,
    theme.map.roads.minor_high,
    theme.map.parks,
    theme.map.buildings,
  ]
    .map((color) => makeThemeColorPop(color, darkBackground))
    .filter(Boolean);

  const fill =
    candidates
      .map((color) => ({
        color,
        score:
          getContrastRatio(color, background) + getContrastRatio(color, land),
      }))
      .sort((left, right) => right.score - left.score)[0]?.color ||
    (darkBackground ? "#ffd84d" : "#004aad");

  const lightStroke = "#f8fbff";
  const darkStroke = "#081219";
  const stroke =
    getContrastRatio(fill, lightStroke) >= getContrastRatio(fill, darkStroke)
      ? lightStroke
      : darkStroke;

  return {
    fill,
    stroke,
    selectedFill: stroke,
    selectedStroke: fill,
    clusterText:
      getContrastRatio(fill, darkStroke) >= getContrastRatio(fill, lightStroke)
        ? darkStroke
        : lightStroke,
  };
}

function createOverlayData(
  items: ImportedMediaAsset[],
): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: items
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))
      .map((item) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [item.lon as number, item.lat as number],
        },
        properties: {
          id: item.id,
          fileName: item.fileName,
          previewUrl: item.previewUrl,
          capturedAt: item.capturedAt ?? "",
        },
      })),
  };
}

export default function StoryNodeOverlay({
  mapRef,
  theme,
}: StoryNodeOverlayProps) {
  const { state, dispatch } = useStoryMapContext();
  const overlayData = useMemo(() => createOverlayData(state.mediaAssets), [state.mediaAssets]);
  const palette = useMemo(() => deriveOverlayPalette(theme), [theme]);
  const activeItem =
    state.activeMediaId !== null
      ? state.mediaAssets.find((item) => item.id === state.activeMediaId) ?? null
      : null;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !state.showMediaOverlay) {
      return;
    }

    const ensureSourceAndLayers = () => {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: overlayData,
          cluster: true,
          clusterMaxZoom: 13,
          clusterRadius: 52,
        });
      }

      if (!map.getLayer(CLUSTER_LAYER_ID)) {
        map.addLayer({
          id: CLUSTER_LAYER_ID,
          type: "circle",
          source: SOURCE_ID,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": palette.fill,
            "circle-opacity": 0.96,
            "circle-radius": [
              "step",
              ["get", "point_count"],
              24,
              5,
              30,
              20,
              38,
            ],
            "circle-stroke-width": 3,
            "circle-stroke-color": palette.stroke,
          },
        });
      }

      if (!map.getLayer(CLUSTER_COUNT_LAYER_ID)) {
        map.addLayer({
          id: CLUSTER_COUNT_LAYER_ID,
          type: "symbol",
          source: SOURCE_ID,
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["Arial Unicode MS Bold"],
            "text-size": 14,
          },
          paint: {
            "text-color": palette.clusterText,
          },
        });
      }

      if (!map.getLayer(POINT_LAYER_ID)) {
        map.addLayer({
          id: POINT_LAYER_ID,
          type: "circle",
          source: SOURCE_ID,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": [
              "case",
              ["==", ["get", "id"], state.activeMediaId ?? ""],
              palette.selectedFill,
              palette.fill,
            ],
            "circle-radius": [
              "case",
              ["==", ["get", "id"], state.activeMediaId ?? ""],
              13,
              9,
            ],
            "circle-stroke-width": 3,
            "circle-stroke-color": [
              "case",
              ["==", ["get", "id"], state.activeMediaId ?? ""],
              palette.selectedStroke,
              palette.stroke,
            ],
          },
        });
      }
    };

    const syncData = () => {
      if (!map.isStyleLoaded()) {
        return;
      }
      ensureSourceAndLayers();
      const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      source?.setData(overlayData);
    };

    const handleClick = (event: MapMouseEvent) => {
      const features = map.queryRenderedFeatures(event.point, {
        layers: [CLUSTER_LAYER_ID, POINT_LAYER_ID],
      });

      if (features.length === 0) {
        dispatch({ type: "SET_ACTIVE_MEDIA", mediaId: null });
        return;
      }

      const topFeature = features[0];
      const clusterId = topFeature.properties?.cluster_id;
      if (typeof clusterId === "number") {
        const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
        if (!source) {
          return;
        }
        void source.getClusterExpansionZoom(clusterId).then((zoom) => {
          if (topFeature.geometry.type !== "Point") {
            return;
          }
          const [lon, lat] = topFeature.geometry.coordinates as [number, number];
          map.easeTo({
            center: [lon, lat],
            zoom,
            duration: 500,
          });
        });
        return;
      }

      const mediaId = String(topFeature.properties?.id ?? "");
      dispatch({
        type: "SET_ACTIVE_MEDIA",
        mediaId: mediaId || null,
      });
    };

    const handleMouseMove = (event: MapMouseEvent) => {
      const features = map.queryRenderedFeatures(event.point, {
        layers: [CLUSTER_LAYER_ID, POINT_LAYER_ID],
      });
      map.getCanvas().style.cursor = features.length > 0 ? "pointer" : "";
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    if (map.isStyleLoaded()) {
      syncData();
    } else {
      map.once("load", syncData);
    }
    map.on("styledata", syncData);
    map.on("click", handleClick);
    map.on("mousemove", handleMouseMove);
    map.on("mouseleave", handleMouseLeave);

    return () => {
      map.off("load", syncData);
      map.off("styledata", syncData);
      map.off("click", handleClick);
      map.off("mousemove", handleMouseMove);
      map.off("mouseleave", handleMouseLeave);
      map.getCanvas().style.cursor = "";
    };
  }, [
    dispatch,
    mapRef,
    overlayData,
    palette.clusterText,
    palette.fill,
    palette.selectedFill,
    palette.selectedStroke,
    palette.stroke,
    state.activeMediaId,
    state.showMediaOverlay,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      return;
    }

    if (!state.showMediaOverlay) {
      if (map.getLayer(CLUSTER_COUNT_LAYER_ID)) {
        map.removeLayer(CLUSTER_COUNT_LAYER_ID);
      }
      if (map.getLayer(CLUSTER_LAYER_ID)) {
        map.removeLayer(CLUSTER_LAYER_ID);
      }
      if (map.getLayer(POINT_LAYER_ID)) {
        map.removeLayer(POINT_LAYER_ID);
      }
      if (map.getSource(SOURCE_ID)) {
        map.removeSource(SOURCE_ID);
      }
      return;
    }

    if (map.getLayer(POINT_LAYER_ID)) {
      map.setPaintProperty(POINT_LAYER_ID, "circle-color", [
        "case",
        ["==", ["get", "id"], state.activeMediaId ?? ""],
        palette.selectedFill,
        palette.fill,
      ]);
      map.setPaintProperty(POINT_LAYER_ID, "circle-radius", [
        "case",
        ["==", ["get", "id"], state.activeMediaId ?? ""],
        13,
        9,
      ]);
      map.setPaintProperty(POINT_LAYER_ID, "circle-stroke-color", [
        "case",
        ["==", ["get", "id"], state.activeMediaId ?? ""],
        palette.selectedStroke,
        palette.stroke,
      ]);
    }
    if (map.getLayer(CLUSTER_LAYER_ID)) {
      map.setPaintProperty(CLUSTER_LAYER_ID, "circle-color", palette.fill);
      map.setPaintProperty(CLUSTER_LAYER_ID, "circle-stroke-color", palette.stroke);
    }
    if (map.getLayer(CLUSTER_COUNT_LAYER_ID)) {
      map.setPaintProperty(
        CLUSTER_COUNT_LAYER_ID,
        "text-color",
        palette.clusterText,
      );
    }
  }, [mapRef, palette, state.activeMediaId, state.showMediaOverlay]);

  if (!state.showMediaOverlay || !activeItem) {
    return null;
  }

  return (
    <StoryPopup
      item={activeItem}
      mapRef={mapRef}
      onClose={() => dispatch({ type: "SET_ACTIVE_MEDIA", mediaId: null })}
    />
  );
}
