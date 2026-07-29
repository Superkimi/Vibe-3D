import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const basePath = process.env.NEXT_PUBLIC_VIBE_3D_BASE_PATH || "";
  return {
    title: {
      default: "Vibe 3D | 用对话塑造三维",
      template: "%s | Vibe 3D",
    },
    description: "一个 schema-first 的在线 3D 建模工作台。人工精调或与 AI 对话，实时预览并导出生产可用模型。",
    icons: { icon: `${basePath}/favicon.svg`, shortcut: `${basePath}/favicon.svg` },
    openGraph: {
      title: "Vibe 3D | 用对话塑造三维",
      description: "对话、参数与代码共享同一个三维场景。",
      type: "website",
      images: [{ url: `${origin}${basePath}/og.png`, width: 1200, height: 630, alt: "Vibe 3D，用对话塑造三维" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Vibe 3D | 用对话塑造三维",
      description: "对话、参数与代码共享同一个三维场景。",
      images: [`${origin}${basePath}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
