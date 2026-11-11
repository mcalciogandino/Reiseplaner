import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

// Alle Seiten hängen an der Anmeldung (Sitzung wird zur Anfragezeit gelesen).
// Die Dev-Prüfung für sofortige Navigation meldet das sonst als Fehler.
export const instant = false;

export const metadata: Metadata = {
  title: "Kanada-Reiseplaner",
  description: "Gemeinsame Planung der Kanadareise",
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Kanada", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#b91c1c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de-CH" className={`${GeistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
