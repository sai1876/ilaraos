"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      if (process.env.NODE_ENV === 'development') {
        // Unregister service worker in development to prevent caching old files/keys
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister().then((success) => {
              if (success) {
                console.log("Dev: Service Worker unregistered successfully.");
              }
            });
          }
        });
        return;
      }

      const handleLoad = () => {
        navigator.serviceWorker
          .register("/sw.js", { updateViaCache: 'none' })
          .then((registration) => {
            console.log("Service Worker registered with scope:", registration.scope);
            registration.update().catch(console.error);
          })
          .catch((error) => {
            console.error("Service Worker registration failed:", error);
          });
      };

      if (document.readyState === 'complete') {
        handleLoad();
      } else {
        window.addEventListener("load", handleLoad);
        return () => window.removeEventListener("load", handleLoad);
      }
    }
  }, []);

  return null;
}
