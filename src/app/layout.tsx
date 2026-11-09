import type { Metadata, Viewport } from "next";
import "./globals.css";
import { UserProvider } from "@/components/useUser";
import LedgerNotice from "@/components/LedgerNotice";

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
  themeColor: "#070807",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LedgerNotice />
        <UserProvider>{children}</UserProvider>
      </body>
    </html>
  );
}
