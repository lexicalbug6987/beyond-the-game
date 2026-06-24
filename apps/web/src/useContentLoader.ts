import { useEffect } from "react";
import { useContentStore } from "./content";

/** Keep screens in sync with the latest saved page content from the API. */
export function useContentLoader() {
  const refresh = useContentStore((s) => s.refresh);

  useEffect(() => {
    const onRefresh = () => {
      refresh();
    };

    refresh();
    window.addEventListener("focus", onRefresh);
    window.addEventListener("pageshow", onRefresh);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") onRefresh();
    });

    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel("btg-content");
      channel.onmessage = onRefresh;
    } catch {
      // BroadcastChannel not available in this environment.
    }

    return () => {
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener("pageshow", onRefresh);
      channel?.close();
    };
  }, [refresh]);
}
