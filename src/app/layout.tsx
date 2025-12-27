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
  description: "お気に入りの写真の色調を、あなたの写真へ瞬時にコピー。フォトグラファーやクリエイターのための無料AIカラーグレーディングツール。",
  keywords: ["色補正", "カラーグレーディング", "写真編集", "AI", "iroAwase", "色調コピー"],
  authors: [{ name: "yu62ballena" }],
  metadataBase: new URL("https://iro-awase.vercel.app"),
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "iroAwase | AI Color Copy & Paste",
    description: "お手本写真の色調を、自分の写真へ瞬時にコピーして再現。登録不要で使える無料AIツール。",
    url: "https://iro-awase.vercel.app",
    siteName: "iroAwase",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "iroAwase Preview",
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "iroAwase | AI Color Copy & Paste",
    description: "写真の色調を、別の写真へ瞬時にコピー。登録不要・ブラウザで完結。",
    images: ["/og-image.jpg"],
  },
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
