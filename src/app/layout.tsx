import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Geist, Geist_Mono, Comfortaa } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const comfortaa = Comfortaa({
  variable: "--font-comfortaa",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "iroAwase | AI Color Copy & Paste",
  description: "Transfer color grading and aesthetics from one photo to another instantly. Free AI-powered tool for photographers and creators.",
  keywords: ["color transfer", "photo editing", "grading", "AI", "iroAwase", "photography tool"],
  authors: [{ name: "yu62ballena" }],
  metadataBase: new URL("https://iro-awase.vercel.app"),
  openGraph: {
    title: "iroAwase | AI Color Copy & Paste",
    description: "Instantly transfer the color world of your favorite photo to your own images.",
    url: "https://iro-awase.vercel.app",
    siteName: "iroAwase",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "iroAwase Logo",
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "iroAwase | AI Color Copy & Paste",
    description: "Instantly transfer color grading between photos.",
    images: ["/logo.png"],
  },
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable} ${comfortaa.variable}`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
