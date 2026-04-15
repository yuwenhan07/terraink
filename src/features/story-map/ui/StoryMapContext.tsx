import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type { ImportedMediaAsset } from "@/features/media/domain/types";
import {
  INITIAL_STORY_MAP_STATE,
  storyMapReducer,
  type StoryMapAction,
} from "@/features/story-map/application/storyMapReducer";
import type { StoryMapState } from "@/features/story-map/domain/types";

interface StoryMapContextValue {
  state: StoryMapState;
  dispatch: React.Dispatch<StoryMapAction>;
}

const StoryMapContext = createContext<StoryMapContextValue | null>(null);

function revokeMediaPreviewUrls(items: ImportedMediaAsset[]) {
  for (const item of items) {
    if (item.revokeOnDispose) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }
}

export function StoryMapProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(storyMapReducer, INITIAL_STORY_MAP_STATE);
  const previousAssetsRef = useRef<ImportedMediaAsset[]>([]);

  useEffect(() => {
    const previousAssets = previousAssetsRef.current;
    const currentAssetIds = new Set(state.mediaAssets.map((item) => item.id));

    revokeMediaPreviewUrls(
      previousAssets.filter((item) => !currentAssetIds.has(item.id)),
    );

    previousAssetsRef.current = state.mediaAssets;
  }, [state.mediaAssets]);

  useEffect(
    () => () => {
      revokeMediaPreviewUrls(previousAssetsRef.current);
    },
    [],
  );

  const value = useMemo(
    () => ({ state, dispatch }),
    [state, dispatch],
  );

  return (
    <StoryMapContext.Provider value={value}>{children}</StoryMapContext.Provider>
  );
}

export function useStoryMapContext(): StoryMapContextValue {
  const context = useContext(StoryMapContext);
  if (!context) {
    throw new Error("useStoryMapContext must be used within a StoryMapProvider");
  }
  return context;
}
