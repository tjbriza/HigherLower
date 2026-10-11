import type { Metadata } from "next";
import { Space_Mono } from "next/font/google";
import "./globals.css";

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
});

export const metadata: Metadata = {
  title: "Higher or Lower — The Ultimate Comparison Game",
  description:
    "Test your knowledge of movie ratings, game playerbases, game scores, and item prices. Pick a category, choose a mode, and see how long you can last!",
  keywords: [
    "higher or lower",
    "trivia game",
    "comparison game",
    "movie ratings",
    "game playerbase",
  ],
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
    <html lang="en" className={`${spaceMono.variable} h-full dark`}>
      <body className="min-h-full flex flex-col bg-grid bg-noise antialiased">
        {children}
      </body>
    </html>
  );
}
