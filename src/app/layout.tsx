import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { Providers } from "@/components/layout/providers";
import { DemoBanner } from "@/components/demo-banner";
import { ChunkErrorRecovery } from "@/components/chunk-error-recovery";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

// Display serif for headings — matches the marketing site's wordmark + headings.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  weight: ["400", "500", "600"],
  style: ["normal"],
});

export const metadata: Metadata = {
  title: "SimpleScheduleAI",
  description: "ICU Nurse Scheduling for Critical Access Hospitals",
  manifest: "/manifest.webmanifest",
};

// Next 16: themeColor / viewport live in the `viewport` export, not `metadata`
// (putting themeColor in metadata warns at build). theme_color also lives in
// the webmanifest; both are kept in sync at #2D5A4A (forest green).
export const viewport: Viewport = {
  themeColor: "#2D5A4A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${fraunces.variable} font-sans antialiased`}
      >
        <Providers>
          <ChunkErrorRecovery />
          <DemoBanner />
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
