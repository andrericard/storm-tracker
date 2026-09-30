export const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const REFRESH_OFFSET_MS = 2 * 60 * 1000;

export function nextRefreshSlot(now: number) {
	return (
		(Math.floor((now - REFRESH_OFFSET_MS) / REFRESH_INTERVAL_MS) + 1) *
			REFRESH_INTERVAL_MS +
		REFRESH_OFFSET_MS
	);
}
