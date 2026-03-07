import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MODEL WARS — AI Battleship Arena",
  description: "Watch AI models battle in real-time Battleship matches",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&family=VT323&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
