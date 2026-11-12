// The game runs in two places: a browser tab, and the desktop app (a native
// window around the same single-file build). This is the one file that knows
// the difference. Everything here falls back to plain browser behaviour, so the
// web build carries no desktop code beyond these few lines.

interface DesktopBridge {
  core: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> };
}

function bridge(): DesktopBridge | null {
  return (globalThis as { __TAURI__?: DesktopBridge }).__TAURI__ ?? null;
}

export function isDesktop(): boolean {
  return bridge() !== null;
}

export type SaveResult = "downloads" | "saved" | "cancelled" | "failed";

/**
 * Hand the player a file. In a browser it lands in their downloads; in the
 * desktop app a native "Save as" dialog asks where to put it.
 */
export async function saveFile(name: string, data: Blob): Promise<SaveResult> {
  const desktop = bridge();
  if (!desktop) {
    // No await before the click: browsers only allow a download that follows
    // straight on from the player's own click.
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return "downloads";
  }
  try {
    const bytes = Array.from(new Uint8Array(await data.arrayBuffer()));
    return (await desktop.core.invoke<boolean>("save_file", { name, bytes })) ? "saved" : "cancelled";
  } catch {
    return "failed";
  }
}

/** The line to show under a download button once saveFile has settled. */
export function saveStatus(result: SaveResult, tail = ""): string {
  if (result === "cancelled") return "Not saved.";
  if (result === "failed") return "Could not write the file there. Try another folder.";
  const head = result === "saved" ? "Saved." : "Saved to your downloads.";
  return tail ? `${head} ${tail}` : head;
}

export function toggleFullscreen(): void {
  void bridge()?.core.invoke("toggle_fullscreen");
}

export function quitGame(): void {
  void bridge()?.core.invoke("quit");
}

/** F11 or Alt+Enter, the two keys PC games use for fullscreen. */
export function installDesktopKeys(): void {
  if (!isDesktop()) return;
  addEventListener("keydown", (e) => {
    if (e.key === "F11" || (e.key === "Enter" && e.altKey)) {
      e.preventDefault();
      toggleFullscreen();
    }
  });
}
