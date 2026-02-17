import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { JetBrains_Mono, Manrope } from "next/font/google";

import { AppHeader } from "@/components/layout/app-header";

import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Orchestrator Console",
  description: "GitHub-authenticated control panel for GHCR app deployments",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className="dark">
        <body className={`${manrope.variable} ${jetbrainsMono.variable} antialiased`}>
          <AppHeader />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
