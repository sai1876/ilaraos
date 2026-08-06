"use client";

import * as React from "react";
import { WifiOff, Wifi } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function OnlineState() {
  const [isOnline, setIsOnline] = React.useState(true);
  const [showStatus, setShowStatus] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnline(window.navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      setShowStatus(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowStatus(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  React.useEffect(() => {
    if (isOnline && showStatus) {
      const timer = setTimeout(() => {
        setShowStatus(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, showStatus]);

  if (isOnline && !showStatus) return null;

  return (
    <AnimatePresence>
      {(!isOnline || showStatus) && (
        <motion.div
          initial={{ opacity: 0, y: -50, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: -50, x: "-50%" }}
          className="fixed top-4 left-1/2 z-[100] flex items-center gap-2.5 px-4 py-2.5 rounded-full shadow-lg border text-xs font-bold select-none"
          style={{
            backgroundColor: isOnline ? "#eefbf3" : "#fdf2f2",
            color: isOnline ? "#1e8a44" : "#e02424",
            borderColor: isOnline ? "#c2f0d1" : "#fde8e8",
          }}
        >
          {isOnline ? (
            <>
              <Wifi size={14} />
              <span>Back online — connection restored</span>
            </>
          ) : (
            <>
              <WifiOff size={14} className="animate-pulse" />
              <span>Connection lost — working offline</span>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
