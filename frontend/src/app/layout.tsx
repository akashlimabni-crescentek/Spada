
import { Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "SPADA",
  description: "Prediction markets",
  appleWebApp: {
    capable: true,
    title: "SPADA",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0D11",
  viewportFit: "cover",
};


const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});





export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body>

        
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}