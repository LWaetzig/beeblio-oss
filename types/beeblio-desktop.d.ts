/** Exposed by the desktop app's preload script (desktop/src/preload.cts); absent in a browser. */
interface BeeblioDesktopBridge {
  platform: string;
  /** Opens the native folder picker; resolves null when the person cancels. */
  selectFolder(): Promise<string | null>;
}

interface Window {
  beeblioDesktop?: BeeblioDesktopBridge;
}
