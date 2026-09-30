import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/forecast")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const { loadForecast } = await import("#/server/simepar/forecast");
				const params = new URL(request.url).searchParams;
				const lat = Number(params.get("lat"));
				const lon = Number(params.get("lon"));
				if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
					return Response.json(
						{ error: "lat and lon are required" },
						{ status: 400 },
					);
				}
				try {
					return Response.json(await loadForecast(lat, lon), {
						headers: { "Cache-Control": "public, max-age=300" },
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
