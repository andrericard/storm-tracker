import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/forecast")({
	server: {
		handlers: {
			GET: async () => {
				const { loadForecast } = await import("#/server/forecast");
				try {
					return Response.json(await loadForecast(), {
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
