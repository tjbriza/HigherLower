import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Higher or Lower — The Ultimate Comparison Game",
  description:
    "Test your knowledge of movie ratings, game playerbases, game scores, and item prices. Pick a category, choose a mode, and see how long you can last!",
  keywords: ["higher or lower", "trivia game", "comparison game", "movie ratings", "game playerbase"],
  authors: [{ name: "Higher or Lower" }],
  openGraph: {
    title: "Higher or Lower",
    description: "The ultimate comparison game — movies, games, and prices.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full flex flex-col bg-grid bg-noise">
        {children}
      </body>
    </html>
  );
}
