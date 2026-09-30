import { createFileRoute } from "@tanstack/react-router";

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

export const Route = createFileRoute("/api/frames")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const { buildFrames } = await import("#/server/goes/frames");
				const params = new URL(request.url).searchParams;
				const lat = Number(params.get("lat"));
				const lon = Number(params.get("lon"));
				if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
					return Response.json(
						{ error: "lat and lon are required" },
						{ status: 400 },
					);
				}
				const frames = clamp(Number(params.get("frames") ?? 6) || 6, 2, 12);
				const radius = clamp(
					Number(params.get("radius") ?? 400) || 400,
					100,
					800,
				);
				try {
					const data = await buildFrames({ lat, lon }, frames, radius);
					return Response.json(data, {
						headers: { "Cache-Control": "no-store" },
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
