import type { ReactNode } from "react";
import { PosterProvider } from "@/features/poster/ui/PosterContext";
import { StoryMapProvider } from "@/features/story-map/ui/StoryMapContext";

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Wraps the application in all required context providers.
 * Add new providers here as needed.
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <PosterProvider>
      <StoryMapProvider>{children}</StoryMapProvider>
    </PosterProvider>
  );
}
