import type { ParsedExifData } from "@/features/media/domain/types";

const JPEG_SOI_MARKER = 0xffd8;
const APP1_MARKER = 0xffe1;
const SOS_MARKER = 0xffda;
const EXIF_HEADER_BYTES = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
const TYPE_SIZES: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  7: 1,
  9: 4,
  10: 8,
};

interface TiffContext {
  view: DataView;
  littleEndian: boolean;
  tiffStart: number;
}

function readAscii(view: DataView, start: number, length: number): string {
  let output = "";
  for (let index = 0; index < length; index += 1) {
    const value = view.getUint8(start + index);
    if (value === 0) break;
    output += String.fromCharCode(value);
  }
  return output.trim();
}

function hasExifHeader(view: DataView, start: number): boolean {
  return EXIF_HEADER_BYTES.every(
    (value, index) => view.getUint8(start + index) === value,
  );
}

function getEntryDataOffset(
  context: TiffContext,
  entryOffset: number,
  type: number,
  count: number,
): number | null {
  const unitSize = TYPE_SIZES[type];
  if (!unitSize) {
    return null;
  }

  const totalBytes = unitSize * count;
  if (totalBytes <= 4) {
    return entryOffset + 8;
  }

  const relativeOffset = context.view.getUint32(
    entryOffset + 8,
    context.littleEndian,
  );
  return context.tiffStart + relativeOffset;
}

function readAsciiTag(
  context: TiffContext,
  entryOffset: number,
  count: number,
): string | null {
  const dataOffset = getEntryDataOffset(context, entryOffset, 2, count);
  if (dataOffset === null) {
    return null;
  }
  return readAscii(context.view, dataOffset, count);
}

function readRationalArray(
  context: TiffContext,
  entryOffset: number,
  count: number,
): number[] {
  const dataOffset = getEntryDataOffset(context, entryOffset, 5, count);
  if (dataOffset === null) {
    return [];
  }

  const values: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const valueOffset = dataOffset + index * 8;
    const numerator = context.view.getUint32(valueOffset, context.littleEndian);
    const denominator = context.view.getUint32(
      valueOffset + 4,
      context.littleEndian,
    );
    values.push(denominator === 0 ? 0 : numerator / denominator);
  }
  return values;
}

function readIfdPointer(
  context: TiffContext,
  ifdOffset: number,
  targetTag: number,
): number | null {
  const entryCount = context.view.getUint16(ifdOffset, context.littleEndian);

  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = ifdOffset + 2 + index * 12;
    const tag = context.view.getUint16(entryOffset, context.littleEndian);
    if (tag !== targetTag) {
      continue;
    }
    const relativeOffset = context.view.getUint32(
      entryOffset + 8,
      context.littleEndian,
    );
    return context.tiffStart + relativeOffset;
  }

  return null;
}

function readDateTag(
  context: TiffContext,
  ifdOffset: number,
  targetTags: number[],
): string | null {
  const entryCount = context.view.getUint16(ifdOffset, context.littleEndian);

  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = ifdOffset + 2 + index * 12;
    const tag = context.view.getUint16(entryOffset, context.littleEndian);
    if (!targetTags.includes(tag)) {
      continue;
    }

    const type = context.view.getUint16(entryOffset + 2, context.littleEndian);
    const count = context.view.getUint32(entryOffset + 4, context.littleEndian);
    if (type !== 2 || count === 0) {
      continue;
    }

    return readAsciiTag(context, entryOffset, count);
  }

  return null;
}

function toDecimalDegrees(values: number[], reference: string | null): number | null {
  if (values.length < 3) {
    return null;
  }

  const [degrees, minutes, seconds] = values;
  const sign =
    reference === "S" || reference === "W"
      ? -1
      : reference === "N" || reference === "E"
        ? 1
        : 1;

  return sign * (degrees + minutes / 60 + seconds / 3600);
}

function parseGpsData(context: TiffContext, gpsIfdOffset: number): {
  lat: number | null;
  lon: number | null;
} {
  const entryCount = context.view.getUint16(gpsIfdOffset, context.littleEndian);
  let latitudeRef: string | null = null;
  let longitudeRef: string | null = null;
  let latitudeValues: number[] = [];
  let longitudeValues: number[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = gpsIfdOffset + 2 + index * 12;
    const tag = context.view.getUint16(entryOffset, context.littleEndian);
    const type = context.view.getUint16(entryOffset + 2, context.littleEndian);
    const count = context.view.getUint32(entryOffset + 4, context.littleEndian);

    if (tag === 0x0001 && type === 2) {
      latitudeRef = readAsciiTag(context, entryOffset, count);
      continue;
    }

    if (tag === 0x0002 && type === 5) {
      latitudeValues = readRationalArray(context, entryOffset, count);
      continue;
    }

    if (tag === 0x0003 && type === 2) {
      longitudeRef = readAsciiTag(context, entryOffset, count);
      continue;
    }

    if (tag === 0x0004 && type === 5) {
      longitudeValues = readRationalArray(context, entryOffset, count);
    }
  }

  return {
    lat: toDecimalDegrees(latitudeValues, latitudeRef),
    lon: toDecimalDegrees(longitudeValues, longitudeRef),
  };
}

export function extractExifData(input: ArrayBuffer): ParsedExifData {
  const view = new DataView(input);
  if (view.byteLength < 4 || view.getUint16(0, false) !== JPEG_SOI_MARKER) {
    return { lat: null, lon: null, capturedAt: null };
  }

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset, false);
    offset += 2;

    if (marker === SOS_MARKER) {
      break;
    }

    const segmentLength = view.getUint16(offset, false);
    offset += 2;

    if (segmentLength < 2 || offset + segmentLength - 2 > view.byteLength) {
      break;
    }

    if (marker !== APP1_MARKER) {
      offset += segmentLength - 2;
      continue;
    }

    const exifStart = offset;
    if (!hasExifHeader(view, exifStart)) {
      offset += segmentLength - 2;
      continue;
    }

    const tiffStart = exifStart + EXIF_HEADER_BYTES.length;
    const byteOrder = readAscii(view, tiffStart, 2);
    const littleEndian =
      byteOrder === "II" ? true : byteOrder === "MM" ? false : null;
    if (littleEndian === null) {
      return { lat: null, lon: null, capturedAt: null };
    }

    const context: TiffContext = { view, littleEndian, tiffStart };
    const firstIfdOffset =
      tiffStart + view.getUint32(tiffStart + 4, context.littleEndian);
    if (firstIfdOffset >= view.byteLength) {
      return { lat: null, lon: null, capturedAt: null };
    }

    const exifIfdOffset = readIfdPointer(context, firstIfdOffset, 0x8769);
    const gpsIfdOffset = readIfdPointer(context, firstIfdOffset, 0x8825);

    const capturedAt =
      (exifIfdOffset !== null
        ? readDateTag(context, exifIfdOffset, [0x9003, 0x9004])
        : null) || readDateTag(context, firstIfdOffset, [0x0132]);

    if (gpsIfdOffset === null) {
      return { lat: null, lon: null, capturedAt };
    }

    const gps = parseGpsData(context, gpsIfdOffset);
    return {
      lat: gps.lat,
      lon: gps.lon,
      capturedAt,
    };
  }

  return { lat: null, lon: null, capturedAt: null };
}
