import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./roulette3d.css";
import "./cabinet.css";
import "./mine.css";
import "./stag.css";
import { Nunito, Passion_One, PT_Sans_Narrow } from "next/font/google";

import { UserProvider } from "@/components/useUser";
import LedgerNotice from "@/components/LedgerNotice";

const body = Nunito({ subsets: ["latin"], weight: ["400", "500", "700", "800"], variable: "--font-body", display: "swap" });
const display = Passion_One({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-display", display: "swap" });
const narrow = PT_Sans_Narrow({ subsets: ["latin"], weight: ["700"], variable: "--font-narrow", display: "swap" });

export const metadata: Metadata = {
  title: "Pit — Sandbox Casino",
  description: "Pit is a 21+ sandbox casino. Local ledger. Not a licensed operator.",
  applicationName: "Pit",
  appleWebApp: { capable: true, title: "Pit", statusBarStyle: "black-translucent" },
  icons: { apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }] },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#311515",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} ${narrow.variable}`}>
      <body>
        <LedgerNotice />
        <UserProvider>{children}</UserProvider>
      </body>
    </html>
  );
}
