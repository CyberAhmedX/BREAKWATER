// Only the Latin character set of each font is bundled. The game is written in
// English, and the other scripts would add over half a megabyte to the file.
import "@fontsource/silkscreen/latin-400.css";
import "@fontsource/silkscreen/latin-700.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./styles.css";
import { App } from "./ui/app";
import { installDesktopKeys } from "./ui/platform";

const app = document.getElementById("app");
const bg = document.getElementById("bg") as HTMLCanvasElement | null;

if (app && bg) {
  new App(app, bg);
  installDesktopKeys();
}
