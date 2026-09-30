import { type ColorScale, colorScale } from "#/lib/color-scale";
import type { EnvironmentResponse, OverlayField } from "#/lib/storm-types";

export type OverlayChoice = OverlayField | "none";

export interface OverlaySpec {
	label: string;
	unit: string;
	scale: ColorScale;
	ticks: number[];
	contourInterval?: number;
}

export const OVERLAYS: Record<OverlayField, OverlaySpec> = {
	mslp: {
		label: "Pressure (MSL)",
		unit: "hPa",
		scale: colorScale([
			[996, "#7c3aed", 0.55],
			[1002, "#2563eb", 0.5],
			[1008, "#0ea5e9", 0.45],
			[1013, "#22c55e", 0.4],
			[1018, "#facc15", 0.45],
			[1024, "#f97316", 0.5],
			[1030, "#dc2626", 0.55],
		]),
		ticks: [996, 1008, 1018, 1030],
		contourInterval: 2,
	},
	cape: {
		label: "CAPE",
		unit: "J/kg",
		scale: colorScale([
			[0, "#0ea5e9", 0],
			[250, "#0ea5e9", 0.35],
			[750, "#22c55e", 0.45],
			[1500, "#facc15", 0.55],
			[2500, "#f97316", 0.6],
			[4000, "#dc2626", 0.65],
		]),
		ticks: [250, 1500, 2500, 4000],
	},
	shear6: {
		label: "Shear 0-6 km",
		unit: "m/s",
		scale: colorScale([
			[8, "#0ea5e9", 0],
			[12, "#0ea5e9", 0.35],
			[18, "#22c55e", 0.45],
			[25, "#facc15", 0.55],
			[32, "#f97316", 0.6],
			[40, "#dc2626", 0.65],
		]),
		ticks: [12, 18, 25, 40],
	},
	srh3: {
		label: "|SRH| 0-3 km (GFS)",
		unit: "m²/s²",
		scale: colorScale([
			[50, "#0ea5e9", 0],
			[100, "#0ea5e9", 0.35],
			[200, "#22c55e", 0.45],
			[300, "#facc15", 0.55],
			[400, "#f97316", 0.6],
			[500, "#dc2626", 0.65],
		]),
		ticks: [100, 200, 300, 500],
	},
};

export const RAIN_SCALE = colorScale([
	[0.2, "#93c5fd", 0.55],
	[1, "#3b82f6", 0.7],
	[3, "#22c55e", 0.8],
	[8, "#facc15", 0.85],
	[16, "#f97316", 0.9],
	[32, "#dc2626", 0.95],
	[64, "#a21caf", 1],
	[100, "#f5d0fe", 1],
]);

export const RAIN_TICKS = [1, 8, 32, 100];

export function overlayValues(
	environment: EnvironmentResponse,
	field: OverlayField,
) {
	return environment.fields[field];
}
