import type { FieldImage } from "#/lib/field-image";
import { mercatorGrid } from "#/lib/mercator-grid";
import { RAIN_SCALE } from "#/lib/overlays";
import type { Frame, GridSpec } from "#/lib/storm-types";

export function rainImage(grid: GridSpec, frame: Frame): FieldImage {
	const merc = mercatorGrid(grid, frame, "rain");
	const canvas = document.createElement("canvas");
	canvas.width = merc.width;
	canvas.height = merc.height;
	const context = canvas.getContext("2d");
	if (!context) return { url: "", corners: merc.corners };
	const image = context.createImageData(merc.width, merc.height);
	for (let p = 0; p < merc.cellAt.length; p++) {
		const i = merc.cellAt[p];
		if (i < 0) continue;
		const [r, g, b, a] = RAIN_SCALE.rgba(frame.rain.rate[i] / 10);
		image.data[p * 4] = r;
		image.data[p * 4 + 1] = g;
		image.data[p * 4 + 2] = b;
		image.data[p * 4 + 3] = Math.round(a * 255);
	}
	context.putImageData(image, 0, 0);
	return { url: canvas.toDataURL(), corners: merc.corners };
}
