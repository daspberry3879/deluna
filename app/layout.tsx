import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deluna — Korean skincare, together",
  description: "Buy Korean skincare together at wholesale prices. Group buying powered by Solana.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
