import type { Metadata } from "next";
import "./globals.css";
import { UserProvider } from "@/components/useUser";

export const metadata: Metadata = {
  title: "Pit — Private Tables",
  description: "Pit is a 21+ sandbox casino. Local ledger. Not a licensed operator.",
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
