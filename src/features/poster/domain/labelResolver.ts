interface PosterLabelInput {
  displayCity?: string;
  displayCountry?: string;
  location?: string;
}

export interface PosterLabels {
  city: string;
  country: string;
}

export function resolvePosterLabels({
  displayCity,
  displayCountry,
  location,
}: PosterLabelInput): PosterLabels {
  return {
    city: String(displayCity ?? "").trim() || String(location ?? "").trim(),
    country: String(displayCountry ?? "").trim(),
  };
}
