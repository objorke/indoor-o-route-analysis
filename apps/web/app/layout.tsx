"use client";

import "@/lib/polyfills";
import { useEffect } from "react";
import { AppDataProvider } from "@indoor-o-route-analysis/ui";
import UpdateNotification from "@/components/update-notification";
import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  useEffect(() => {
    // Set page title and meta tags dynamically
    document.title = "Indoor Orienteering Route Analysis";

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute("content", "Indoor orienteering route analysis tool");
    } else {
      const meta = document.createElement("meta");
      meta.name = "description";
      meta.content = "Indoor o route analysis tool";
      document.head.appendChild(meta);
    }

    // Service worker registration + update detection live in
    // UpdateNotification (see lib/use-service-worker-update.ts), so the user
    // gets a reload prompt instead of a silent, half-updated app.
  }, []);

  return (
    <html lang="en" data-theme="dark" className="dark" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon-32x32.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        {/* Apply the saved theme before first paint (no flash). Keep in sync with
            applyTheme() in packages/ui/src/contexts/settings-context.tsx. */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static, constant pre-paint theme script; contains no user or external data
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("app-theme");if(t!=="light"&&t!=="medium"&&t!=="dark")t="dark";var r=document.documentElement;r.dataset.theme=t;r.classList.toggle("dark",t!=="light");r.style.colorScheme=t==="light"?"light":"dark";}catch(e){}})();`,
          }}
        />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
      </head>
      <body className={`font-sans antialiased`}>
        <AppDataProvider>
          {children}
          <UpdateNotification />
        </AppDataProvider>
      </body>
    </html>
  );
}
