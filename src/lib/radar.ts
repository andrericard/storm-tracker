import type { MercatorCorners } from "#/lib/mercator-grid";

export const RADAR_BOUNDS = {
	west: -55.876,
	east: -44.516,
	north: -18.08,
	south: -26.4,
};

export const RADAR_CORNERS: MercatorCorners = [
	[RADAR_BOUNDS.west, RADAR_BOUNDS.north],
	[RADAR_BOUNDS.east, RADAR_BOUNDS.north],
	[RADAR_BOUNDS.east, RADAR_BOUNDS.south],
	[RADAR_BOUNDS.west, RADAR_BOUNDS.south],
];
