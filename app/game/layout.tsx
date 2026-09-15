import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Game — Higher or Lower",
  description: "Play Higher or Lower",
};

/**
 * Shared layout wrapping all /game/* routes.
 * Keeps the dark canvas without repeating the landing-page hero chrome.
 */
export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-dvh flex flex-col overflow-hidden">
      {children}
    </div>
  );
}
