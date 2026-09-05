import type { Metadata, Viewport } from "next";
import "./globals.css";
import { UserProvider } from "@/components/useUser";

export const metadata: Metadata = {
  title: "Pit — Private Tables",
  description: "Pit is a 21+ sandbox casino. Local ledger. Not a licensed operator.",
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
        <UserProvider>{children}</UserProvider>
      </body>
    </html>
  );
}
