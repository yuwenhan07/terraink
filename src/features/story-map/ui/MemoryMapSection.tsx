import { useRef, useState } from "react";
import type {
  ImportedMediaAsset,
  MediaImportBatch,
  MediaImportDateFilter,
} from "@/features/media/domain/types";
import {
  createBundledPicDescriptors,
  createLocalFileDescriptors,
  importMediaBatch,
} from "@/features/media/infrastructure/mediaImport";
import { usePosterContext } from "@/features/poster/ui/PosterContext";
import { useStoryMapContext } from "@/features/story-map/ui/StoryMapContext";

function formatCapturedAt(input: string | null): string {
  if (!input) {
    return "No capture time";
  }

  return input.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
}

function getGeotaggedAssets(items: ImportedMediaAsset[]): ImportedMediaAsset[] {
  return items.filter(
    (item) => Number.isFinite(item.lat) && Number.isFinite(item.lon),
  );
}

function getFilterLabel(filter: MediaImportDateFilter): string {
  if (filter.mode !== "date-range") {
    return "All images";
  }
  return `${filter.startDate} to ${filter.endDate}`;
}

export default function MemoryMapSection() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isLoadingSamples, setIsLoadingSamples] = useState(false);
  const [importFilter, setImportFilter] = useState<MediaImportDateFilter>({
    mode: "all",
    startDate: "",
    endDate: "",
  });
  const { mapRef } = usePosterContext();
  const { state, dispatch } = useStoryMapContext();
  const geotaggedAssets = getGeotaggedAssets(state.mediaAssets);
  const unlocatedAssets = state.mediaAssets.filter(
    (item) => item.locationSource !== "exif",
  );
  const isDateRangeValid =
    importFilter.mode !== "date-range" ||
    (Boolean(importFilter.startDate) &&
      Boolean(importFilter.endDate) &&
      importFilter.startDate <= importFilter.endDate);

  const applyImportedBatch = async (load: () => Promise<MediaImportBatch>) => {
    dispatch({ type: "SET_IMPORTING", importing: true });

    try {
      const result = await load();
      dispatch({
        type: "REPLACE_MEDIA_ASSETS",
        items: result.items,
        summary: {
          sourceLabel: result.sourceLabel,
          importedCount: result.items.length,
          geotaggedCount: result.items.filter((item) => item.locationSource === "exif").length,
          missingLocationCount: result.items.filter((item) => item.locationSource !== "exif").length,
          skippedCount: result.skipped.length,
          filteredOutCount: result.filteredOut.length,
          filterLabel: getFilterLabel(importFilter),
        },
        error:
          result.items.length === 0 &&
          result.filteredOut.length > 0 &&
          importFilter.mode === "date-range"
            ? "No images matched the selected EXIF date range."
            : result.items.length === 0 && result.skipped.length > 0
              ? "No readable images were imported."
            : "",
      });
    } catch {
      dispatch({
        type: "SET_IMPORTING",
        importing: false,
        error: "Import failed. Try another folder or image batch.",
      });
    }
  };

  const focusImportedMedia = (items: ImportedMediaAsset[]) => {
    const map = mapRef.current;
    if (!map || items.length === 0) {
      return;
    }

    if (items.length === 1) {
      map.flyTo({
        center: [items[0].lon as number, items[0].lat as number],
        zoom: Math.max(map.getZoom(), 12),
        duration: 800,
      });
      return;
    }

    let minLat = Number.POSITIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;
    let minLon = Number.POSITIVE_INFINITY;
    let maxLon = Number.NEGATIVE_INFINITY;

    for (const item of items) {
      minLat = Math.min(minLat, item.lat as number);
      maxLat = Math.max(maxLat, item.lat as number);
      minLon = Math.min(minLon, item.lon as number);
      maxLon = Math.max(maxLon, item.lon as number);
    }

    map.fitBounds(
      [
        [minLon, minLat],
        [maxLon, maxLat],
      ],
      {
        padding: 52,
        duration: 900,
        maxZoom: 12,
      },
    );
  };

  const handleFolderImport = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const { files } = event.target;
    if (!files || files.length === 0) {
      return;
    }

    await applyImportedBatch(() =>
      importMediaBatch(
        createLocalFileDescriptors(files),
        "Selected folder",
        importFilter,
      ),
    );
    event.target.value = "";
  };

  const handleSampleImport = async () => {
    setIsLoadingSamples(true);
    try {
      await applyImportedBatch(() =>
        importMediaBatch(createBundledPicDescriptors(), "Bundled pic/", importFilter),
      );
    } finally {
      setIsLoadingSamples(false);
    }
  };

  const handleFocusItem = (item: ImportedMediaAsset) => {
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) {
      return;
    }

    dispatch({ type: "SET_ACTIVE_MEDIA", mediaId: item.id });
    const map = mapRef.current;
    if (!map) {
      return;
    }

    map.flyTo({
      center: [item.lon, item.lat],
      zoom: Math.max(map.getZoom(), 13),
      duration: 700,
    });
  };

  return (
    <div className="panel-block memory-map-panel">
      <h2>Memories</h2>

      <div className="memory-map-import-mode" role="group" aria-label="Import mode">
        <button
          type="button"
          className={`memory-map-mode-btn${
            importFilter.mode === "all" ? " is-active" : ""
          }`}
          onClick={() =>
            setImportFilter((current) => ({ ...current, mode: "all" }))
          }
        >
          All Images
        </button>
        <button
          type="button"
          className={`memory-map-mode-btn${
            importFilter.mode === "date-range" ? " is-active" : ""
          }`}
          onClick={() =>
            setImportFilter((current) => ({ ...current, mode: "date-range" }))
          }
        >
          Date Range
        </button>
      </div>

      {importFilter.mode === "date-range" ? (
        <div className="memory-map-date-grid" lang="en">
          <label>
            Start Date
            <input
              type="date"
              className="form-control-tall"
              lang="en-CA"
              title="Start date (YYYY-MM-DD)"
              value={importFilter.startDate}
              onChange={(event) =>
                setImportFilter((current) => ({
                  ...current,
                  startDate: event.target.value,
                }))
              }
            />
          </label>
          <label>
            End Date
            <input
              type="date"
              className="form-control-tall"
              lang="en-CA"
              title="End date (YYYY-MM-DD)"
              value={importFilter.endDate}
              onChange={(event) =>
                setImportFilter((current) => ({
                  ...current,
                  endDate: event.target.value,
                }))
              }
            />
          </label>
        </div>
      ) : null}

      <p className="memory-map-help">
        {importFilter.mode === "date-range"
          ? "Date filtering uses EXIF capture time. Images without capture time will be excluded."
          : "Import all images from a folder, or switch to a date range before importing."}
      </p>

      <div className="memory-map-actions">
        <button
          type="button"
          className="memory-map-btn"
          onClick={() => inputRef.current?.click()}
          disabled={state.isImporting || !isDateRangeValid}
        >
          Import Folder
        </button>
        <button
          type="button"
          className="memory-map-btn"
          onClick={handleSampleImport}
          disabled={state.isImporting || isLoadingSamples || !isDateRangeValid}
        >
          {isLoadingSamples ? "Loading..." : "Load pic/"}
        </button>
      </div>

      <input
        ref={inputRef}
        className="memory-map-file-input"
        type="file"
        accept="image/*"
        multiple
        webkitdirectory=""
        directory=""
        onChange={handleFolderImport}
      />

      <label className="toggle-field">
        <span>Show Memory Overlay</span>
        <span className="theme-switch">
          <input
            type="checkbox"
            checked={state.showMediaOverlay}
            onChange={(event) =>
              dispatch({
                type: "SET_SHOW_MEDIA_OVERLAY",
                visible: event.target.checked,
              })
            }
          />
          <span className="theme-switch-track" />
        </span>
      </label>

      {state.importSummary ? (
        <div className="memory-map-summary">
          <p>
            {state.importSummary.sourceLabel}: {state.importSummary.importedCount} images
          </p>
          <p>Filter: {state.importSummary.filterLabel}</p>
          <p>
            {state.importSummary.geotaggedCount} geotagged,{" "}
            {state.importSummary.missingLocationCount} without GPS
          </p>
          {state.importSummary.filteredOutCount > 0 ? (
            <p>{state.importSummary.filteredOutCount} excluded by date filter</p>
          ) : null}
          {state.importSummary.skippedCount > 0 ? (
            <p>{state.importSummary.skippedCount} files skipped during import</p>
          ) : null}
        </div>
      ) : null}

      <div className="memory-map-actions">
        <button
          type="button"
          className="memory-map-btn memory-map-btn--secondary"
          onClick={() => focusImportedMedia(geotaggedAssets)}
          disabled={geotaggedAssets.length === 0}
        >
          Focus Imported Photos
        </button>
        <button
          type="button"
          className="memory-map-btn memory-map-btn--secondary"
          onClick={() => dispatch({ type: "CLEAR_MEDIA_ASSETS" })}
          disabled={state.mediaAssets.length === 0}
        >
          Clear
        </button>
      </div>

      {geotaggedAssets.length > 0 ? (
        <div className="memory-map-gallery">
          {geotaggedAssets.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`memory-map-card${
                state.activeMediaId === item.id ? " is-active" : ""
              }`}
              onClick={() => handleFocusItem(item)}
            >
              <img src={item.previewUrl} alt={item.fileName} loading="lazy" />
              <span className="memory-map-card__meta">
                <strong>{item.fileName}</strong>
                <span>
                  {(item.lat as number).toFixed(4)}, {(item.lon as number).toFixed(4)}
                </span>
                <span>{formatCapturedAt(item.capturedAt)}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {unlocatedAssets.length > 0 ? (
        <div className="memory-map-unlocated">
          <p className="memory-map-unlocated__title">No GPS found</p>
          <ul className="memory-map-unlocated__list">
            {unlocatedAssets.slice(0, 6).map((item) => (
              <li key={item.id}>{item.relativePath}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.importError ? <p className="error">{state.importError}</p> : null}
      {!isDateRangeValid ? (
        <p className="error">Choose a valid start and end date before importing.</p>
      ) : null}
    </div>
  );
}
