"use client";
import { useEffect, useSyncExternalStore } from "react";

function subscribe(notify: () => void) {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}
export function PhoneApp() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // Browsers can disable workers. The online app must remain usable.
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {});
    }
  }, []);
  return (
    <>
      {!online && (
        <div role="status" className="connection-notice">
          You’re offline. Keep this screen open to preserve unsaved edits.
          Reconnect before saving; changes are not queued automatically.
        </div>
      )}
      <details className="phone-install">
        <summary>Install on your phone</summary>
        <p>
          On iPhone, open this site in Safari, tap Share, then Add to Home
          Screen. Turn on Open as Web App if offered, then tap Add.
        </p>
        <p>
          On Android, use your browser’s Install app or Add to Home screen
          option.
        </p>
        <p>
          Open the new icon while online and sign in there. If your email opens
          Safari, use “Sign in inside this app” on the sign-in screen. Inventory
          and photos need an internet connection.
        </p>
      </details>
    </>
  );
}
