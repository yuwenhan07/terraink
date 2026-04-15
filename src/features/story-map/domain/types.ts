import type { ImportedMediaAsset } from "@/features/media/domain/types";

export interface StoryMapImportSummary {
  sourceLabel: string;
  importedCount: number;
  geotaggedCount: number;
  missingLocationCount: number;
  skippedCount: number;
  filteredOutCount: number;
  filterLabel: string;
}

export interface StoryMapState {
  mediaAssets: ImportedMediaAsset[];
  activeMediaId: string | null;
  showMediaOverlay: boolean;
  isImporting: boolean;
  importError: string;
  importSummary: StoryMapImportSummary | null;
}
