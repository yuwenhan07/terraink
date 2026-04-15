import type { ImportedMediaAsset } from "@/features/media/domain/types";
import type { StoryMapImportSummary, StoryMapState } from "@/features/story-map/domain/types";

export type StoryMapAction =
  | { type: "SET_IMPORTING"; importing: boolean; error?: string }
  | {
      type: "REPLACE_MEDIA_ASSETS";
      items: ImportedMediaAsset[];
      summary: StoryMapImportSummary;
      error?: string;
    }
  | { type: "SET_ACTIVE_MEDIA"; mediaId: string | null }
  | { type: "SET_SHOW_MEDIA_OVERLAY"; visible: boolean }
  | { type: "CLEAR_MEDIA_ASSETS" };

export const INITIAL_STORY_MAP_STATE: StoryMapState = {
  mediaAssets: [],
  activeMediaId: null,
  showMediaOverlay: true,
  isImporting: false,
  importError: "",
  importSummary: null,
};

export function storyMapReducer(
  state: StoryMapState,
  action: StoryMapAction,
): StoryMapState {
  switch (action.type) {
    case "SET_IMPORTING":
      return {
        ...state,
        isImporting: action.importing,
        importError: action.importing ? "" : (action.error ?? state.importError),
      };

    case "REPLACE_MEDIA_ASSETS":
      return {
        ...state,
        mediaAssets: action.items,
        activeMediaId:
          action.items.find((item) => item.locationSource === "exif")?.id ?? null,
        importSummary: action.summary,
        isImporting: false,
        importError: action.error ?? "",
      };

    case "SET_ACTIVE_MEDIA":
      return {
        ...state,
        activeMediaId: action.mediaId,
      };

    case "SET_SHOW_MEDIA_OVERLAY":
      return {
        ...state,
        showMediaOverlay: action.visible,
      };

    case "CLEAR_MEDIA_ASSETS":
      return {
        ...state,
        mediaAssets: [],
        activeMediaId: null,
        importSummary: null,
        importError: "",
        isImporting: false,
      };

    default:
      return state;
  }
}
