import type {
  ImportedMediaAsset,
  MediaImportBatch,
  MediaImportDescriptor,
  MediaImportSource,
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

export async function importMediaBatch(
  descriptors: MediaImportDescriptor[],
  sourceLabel: string,
): Promise<MediaImportBatch> {
  const items: ImportedMediaAsset[] = [];
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

      items.push({
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

  return { items, skipped, sourceLabel };
}
