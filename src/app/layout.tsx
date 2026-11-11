import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./dragon.css";
import "./roulette3d.css";
import { Cinzel } from "next/font/google";

import { UserProvider } from "@/components/useUser";
import LedgerNotice from "@/components/LedgerNotice";

const display = Cinzel({ subsets: ["latin"], weight: ["700", "900"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "Pit — Private Tables",
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
  themeColor: "#6a0710",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={display.variable}>
      <body>
        <LedgerNotice />
        <UserProvider>{children}</UserProvider>
      </body>
    </html>
  );
}
