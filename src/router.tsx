import { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { refetchOnWindowFocus: false } },
	});

	return createTanStackRouter({
		routeTree,
		context: { queryClient },
		defaultPreload: "intent",
		defaultNotFoundComponent: () => null,
	});
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
