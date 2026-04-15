import type {
  ImportedMediaAsset,
  MediaImportBatch,
  MediaImportDateFilter,
  MediaImportDescriptor,
} from "@/features/media/domain/types";
import { extractExifData } from "@/features/media/infrastructure/exifParser";

const supportedAssetModules = import.meta.glob(
  "../../../../pic/*.{jpg,jpeg,JPG,JPEG,png,PNG,webp,WEBP}",
  { eager: true, import: "default" },
) as Record<string, string>;

const SUPPORTED_IMAGE_PATTERN =
  /\.(jpg|jpeg|png|webp)$/i;

function sanitizeId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function readImageDimensions(previewUrl: string): Promise<{
  width: number | null;
  height: number | null;
}> {
  if (typeof Image === "undefined") {
    return { width: null, height: null };
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth || null, height: image.naturalHeight || null });
    image.onerror = () => resolve({ width: null, height: null });
    image.src = previewUrl;
  });
}

export function createLocalFileDescriptors(
  files: FileList | File[],
): MediaImportDescriptor[] {
  return Array.from(files).map((file, index) => {
    const relativePath =
      typeof file.webkitRelativePath === "string" && file.webkitRelativePath
        ? file.webkitRelativePath
        : file.name;
    const previewUrl = URL.createObjectURL(file);

    return {
      id: `local-${index}-${sanitizeId(relativePath)}`,
      fileName: file.name,
      relativePath,
      mimeType: file.type || "",
      byteSize: file.size,
      previewUrl,
      importSource: "local-folder",
      revokeOnDispose: true,
      readArrayBuffer: () => file.arrayBuffer(),
    };
  });
}

export function createBundledPicDescriptors(): MediaImportDescriptor[] {
  return Object.entries(supportedAssetModules)
    .sort(([left], [right]) => left.localeCompare(right, "zh-CN"))
    .map(([modulePath, previewUrl], index) => {
      const relativePath = modulePath.split("/pic/").pop() ?? modulePath;
      const fileName = relativePath.split("/").pop() ?? relativePath;

      return {
        id: `bundled-${index}-${sanitizeId(relativePath)}`,
        fileName,
        relativePath,
        mimeType: "",
        byteSize: 0,
        previewUrl,
        importSource: "bundled-pic",
        revokeOnDispose: false,
        readArrayBuffer: async () => {
          const response = await fetch(previewUrl);
          return await response.arrayBuffer();
        },
      };
    });
}

function isLikelyImage(descriptor: MediaImportDescriptor): boolean {
  return (
    descriptor.mimeType.startsWith("image/") ||
    SUPPORTED_IMAGE_PATTERN.test(descriptor.fileName)
  );
}

function parseCapturedAtToMillis(value: string | null): number | null {
  const normalized = String(value ?? "").trim();
  const match = normalized.match(
    /^(\d{4}):(\d{2}):(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?$/,
  );
  if (!match) {
    return null;
  }

  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  const asDate = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  return Number.isFinite(asDate.getTime()) ? asDate.getTime() : null;
}

function getDateStartMillis(value: string): number | null {
  if (!value) {
    return null;
  }
  const asDate = new Date(`${value}T00:00:00`);
  return Number.isFinite(asDate.getTime()) ? asDate.getTime() : null;
}

function getDateEndMillis(value: string): number | null {
  if (!value) {
    return null;
  }
  const asDate = new Date(`${value}T23:59:59.999`);
  return Number.isFinite(asDate.getTime()) ? asDate.getTime() : null;
}

function applyDateFilter(
  items: ImportedMediaAsset[],
  filter: MediaImportDateFilter,
): Pick<MediaImportBatch, "items" | "filteredOut"> {
  if (filter.mode !== "date-range") {
    return { items, filteredOut: [] };
  }

  const startMillis = getDateStartMillis(filter.startDate);
  const endMillis = getDateEndMillis(filter.endDate);
  if (startMillis === null || endMillis === null || startMillis > endMillis) {
    return {
      items: [],
      filteredOut: items.map((item) => ({
        fileName: item.fileName,
        relativePath: item.relativePath,
        reason: "Invalid date range",
      })),
    };
  }

  const accepted: ImportedMediaAsset[] = [];
  const filteredOut: MediaImportBatch["filteredOut"] = [];

  for (const item of items) {
    const capturedAtMillis = parseCapturedAtToMillis(item.capturedAt);
    if (capturedAtMillis === null) {
      filteredOut.push({
        fileName: item.fileName,
        relativePath: item.relativePath,
        reason: "Missing EXIF capture time",
      });
      continue;
    }

    if (capturedAtMillis < startMillis || capturedAtMillis > endMillis) {
      filteredOut.push({
        fileName: item.fileName,
        relativePath: item.relativePath,
        reason: "Outside selected date range",
      });
      continue;
    }

    accepted.push(item);
  }

  return { items: accepted, filteredOut };
}

export async function importMediaBatch(
  descriptors: MediaImportDescriptor[],
  sourceLabel: string,
  filter: MediaImportDateFilter = {
    mode: "all",
    startDate: "",
    endDate: "",
  },
): Promise<MediaImportBatch> {
  const importedItems: ImportedMediaAsset[] = [];
  const skipped: MediaImportBatch["skipped"] = [];

  for (const descriptor of descriptors) {
    if (!isLikelyImage(descriptor)) {
      skipped.push({
        fileName: descriptor.fileName,
        relativePath: descriptor.relativePath,
        reason: "Unsupported file type",
      });
      if (descriptor.revokeOnDispose) {
        URL.revokeObjectURL(descriptor.previewUrl);
      }
      continue;
    }

    try {
      const [arrayBuffer, dimensions] = await Promise.all([
        descriptor.readArrayBuffer(),
        readImageDimensions(descriptor.previewUrl),
      ]);
      const exif = extractExifData(arrayBuffer);

      importedItems.push({
        id: descriptor.id,
        fileName: descriptor.fileName,
        relativePath: descriptor.relativePath,
        previewUrl: descriptor.previewUrl,
        width: dimensions.width,
        height: dimensions.height,
        lat: Number.isFinite(exif.lat) ? exif.lat : null,
        lon: Number.isFinite(exif.lon) ? exif.lon : null,
        capturedAt: exif.capturedAt,
        byteSize: descriptor.byteSize,
        mimeType: descriptor.mimeType,
        importSource: descriptor.importSource,
        locationSource:
          Number.isFinite(exif.lat) && Number.isFinite(exif.lon)
            ? "exif"
            : "missing",
        revokeOnDispose: descriptor.revokeOnDispose,
      });
    } catch {
      skipped.push({
        fileName: descriptor.fileName,
        relativePath: descriptor.relativePath,
        reason: "Could not read file",
      });
      if (descriptor.revokeOnDispose) {
        URL.revokeObjectURL(descriptor.previewUrl);
      }
    }
  }

  const { items, filteredOut } = applyDateFilter(importedItems, filter);
  return { items, skipped, filteredOut, sourceLabel };
}
