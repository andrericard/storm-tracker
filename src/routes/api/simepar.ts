import { createFileRoute } from "@tanstack/react-router";
import { SIMEPAR_FRAME_COUNT } from "#/lib/simepar-image";

const SOURCE_URL = "https://lb01.simepar.br/riak/pgw-radar";
const CACHE_TTL_MS = 2 * 60 * 1000;

const cache = new Map<number, { at: number; body: ArrayBuffer }>();

async function loadImage(frame: number) {
	const cached = cache.get(frame);
	if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.body;
	const response = await fetch(`${SOURCE_URL}/product${frame}.jpeg`, {
		headers: {
			Referer: "https://www.simepar.br/simepar/radar_msc",
			"User-Agent": "storm-tracker (personal weather dashboard)",
		},
	});
	if (!response.ok) throw new Error(`Simepar responded ${response.status}`);
	const body = await response.arrayBuffer();
	cache.set(frame, { at: Date.now(), body });
	return body;
}

export const Route = createFileRoute("/api/simepar")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const frame = Number(
					new URL(request.url).searchParams.get("frame") ?? 1,
				);
				if (
					!Number.isInteger(frame) ||
					frame < 1 ||
					frame > SIMEPAR_FRAME_COUNT
				)
					return Response.json({ error: "Invalid frame" }, { status: 400 });
				try {
					return new Response(await loadImage(frame), {
						headers: {
							"Content-Type": "image/jpeg",
							"Cache-Control": "public, max-age=60",
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
