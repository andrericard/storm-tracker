import { createFileRoute } from "@tanstack/react-router";

const SOURCE_URL = "https://lb01.simepar.br/riak/pgw-radar/product1.jpeg";
const CACHE_TTL_MS = 2 * 60 * 1000;

let cached: {
	at: number;
	body: ArrayBuffer;
	lastModified: string | null;
} | null = null;

async function loadImage() {
	if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached;
	const response = await fetch(SOURCE_URL, {
		headers: {
			Referer: "https://www.simepar.br/simepar/radar_msc",
			"User-Agent": "storm-tracker (personal weather dashboard)",
		},
	});
	if (!response.ok) throw new Error(`Simepar responded ${response.status}`);
	cached = {
		at: Date.now(),
		body: await response.arrayBuffer(),
		lastModified: response.headers.get("last-modified"),
	};
	return cached;
}

export const Route = createFileRoute("/api/simepar")({
	server: {
		handlers: {
			GET: async () => {
				try {
					const image = await loadImage();
					return new Response(image.body, {
						headers: {
							"Content-Type": "image/jpeg",
							"Cache-Control": "public, max-age=60",
							...(image.lastModified
								? { "Last-Modified": image.lastModified }
								: {}),
						},
					});
				} catch (error) {
					console.error(error);
					return Response.json(
						{ error: error instanceof Error ? error.message : "Unknown error" },
						{ status: 502 },
					);
				}
			},
		},
	},
});
