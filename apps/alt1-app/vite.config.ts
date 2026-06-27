import { defineConfig } from "vite";

// Alt1 apps are plain static sites. `base` must match the GitHub Pages subpath
// so asset URLs resolve. For https://USER.github.io/daemonheim-tracker/ use that.
export default defineConfig({
  base: "./",
  build: { outDir: "dist", target: "es2021" },
});
