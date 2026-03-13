import * as esbuild from "esbuild";
import { cpSync } from "fs";

const watch = process.argv.includes("--watch");

const buildOptions: esbuild.BuildOptions = {
  entryPoints: ["src/background.ts", "src/blocked.ts", "src/popup.ts"],
  bundle: true,
  outdir: "dist",
  format: "esm",
  target: "esnext",
  sourcemap: true,
};

// Copy static files to dist
cpSync("static", "dist", { recursive: true });

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(buildOptions);
  console.log("Build complete.");
}
