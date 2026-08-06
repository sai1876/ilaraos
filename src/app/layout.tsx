import type { Metadata, Viewport } from "next";
import { Poppins, Playfair_Display, Space_Mono } from "next/font/google";
import "@/styles/globals.css";
import 'leaflet/dist/leaflet.css';
import 'leaflet-geosearch/dist/geosearch.css';
import { cn } from "@/lib/utils";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { restaurantConfig } from "@/config/restaurant";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
  display: "swap",
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-space-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: restaurantConfig.restaurantName,
  description: restaurantConfig.restaurantDescription,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: restaurantConfig.restaurantName,
  },
};

export const viewport: Viewport = {
  themeColor: "#FAF6F0",
  width: "device-width",
  initialScale: 1,
};

import { MotionProvider } from "@/components/ui/motion-provider";
import { OnlineState } from "@/components/ui/online-state";
import Footer from "@/components/Footer";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn(poppins.variable, playfairDisplay.variable, spaceMono.variable)}>
      <body className="antialiased min-h-screen w-full max-w-full bg-background text-foreground font-sans selection:bg-primary selection:text-primary-foreground">
        <ServiceWorkerRegister />
        <OnlineState />
        <MotionProvider>
          {children}
          <Footer />
        </MotionProvider>
      </body>
    </html>
  );
}
