export type MediaImportSource = "local-folder" | "bundled-pic";

export type MediaLocationSource = "exif" | "missing";

export interface ParsedExifData {
  lat: number | null;
  lon: number | null;
  capturedAt: string | null;
}

export interface ImportedMediaAsset {
  id: string;
  fileName: string;
  relativePath: string;
  previewUrl: string;
  width: number | null;
  height: number | null;
  lat: number | null;
  lon: number | null;
  capturedAt: string | null;
  byteSize: number;
  mimeType: string;
  importSource: MediaImportSource;
  locationSource: MediaLocationSource;
  revokeOnDispose: boolean;
}

export interface MediaImportDescriptor {
  id: string;
  fileName: string;
  relativePath: string;
  mimeType: string;
  byteSize: number;
  previewUrl: string;
  importSource: MediaImportSource;
  revokeOnDispose: boolean;
  readArrayBuffer: () => Promise<ArrayBuffer>;
}

export interface MediaImportBatch {
  items: ImportedMediaAsset[];
  skipped: {
    fileName: string;
    relativePath: string;
    reason: string;
  }[];
  filteredOut: {
    fileName: string;
    relativePath: string;
    reason: string;
  }[];
  sourceLabel: string;
}

export interface MediaImportDateFilter {
  mode: "all" | "date-range";
  startDate: string;
  endDate: string;
}
