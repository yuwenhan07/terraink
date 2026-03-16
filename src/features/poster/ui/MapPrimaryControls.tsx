import { LockIcon, RecenterIcon, UnlockIcon } from "@/shared/ui/Icons";

interface MapPrimaryControlsProps {
  isMapEditing: boolean;
  isMarkerEditorActive: boolean;
  hasMarkers: boolean;
  recenterHint: string;
  unlockHint: string;
  onRecenter: () => void;
  onStartEditing: () => void;
  onFinishEditing: () => void;
  onToggleMarkerEditing: () => void;
}

export default function MapPrimaryControls({
  isMapEditing,
  isMarkerEditorActive,
  hasMarkers,
  recenterHint,
  unlockHint,
  onRecenter,
  onStartEditing,
  onFinishEditing,
  onToggleMarkerEditing,
}: MapPrimaryControlsProps) {
  return (
    <>
      <button
        type="button"
        className="map-control-btn"
        onClick={onRecenter}
        title={recenterHint}
      >
        <RecenterIcon />
        <span>Recenter</span>
      </button>
      {isMapEditing ? (
        <button
          type="button"
          className="map-control-btn map-control-btn--primary map-control-btn--mode"
          onClick={onFinishEditing}
          title="Lock map editing"
        >
          <LockIcon />
          <span>Lock Map</span>
        </button>
      ) : (
        <button
          type="button"
          className="map-control-btn map-control-btn--primary map-control-btn--mode"
          onClick={onStartEditing}
          title={unlockHint}
          disabled={isMarkerEditorActive}
        >
          <UnlockIcon />
          <span>Edit Map</span>
        </button>
      )}
      <button
        type="button"
        className={`map-control-btn map-control-btn--marker-toggle${isMarkerEditorActive ? " is-active" : ""}`}
        onClick={onToggleMarkerEditing}
        disabled={!isMarkerEditorActive && !hasMarkers}
      >
        {isMarkerEditorActive ? <UnlockIcon /> : <LockIcon />}
        <span>{isMarkerEditorActive ? "Lock Markers" : "Unlock Markers"}</span>
      </button>
    </>
  );
}
