import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
	resolve: { tsconfigPaths: true },
	ssr: { external: ["h5wasm", "@mattnucc/gribberish"] },
	plugins: [
		tailwindcss(),
		tanstackStart({ spa: { enabled: true } }),
		nitro({ traceDeps: ["@mattnucc/gribberish", "h5wasm"] }),
		viteReact(),
	],
});
