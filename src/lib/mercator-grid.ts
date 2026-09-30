import type { Frame, GridSpec } from "#/lib/storm-types";

export interface MercatorGrid {
	width: number;
	height: number;
	west: number;
	east: number;
	north: number;
	south: number;
	cellAt: Int32Array;
	corners: [
		[number, number],
		[number, number],
		[number, number],
		[number, number],
	];
}

function mercatorY(lat: number) {
	const phi = (lat * Math.PI) / 180;
	return (1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2;
}

function latFromMercatorY(y: number) {
	return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
}

const cache = new WeakMap<Frame, MercatorGrid>();

export function mercatorGrid(grid: GridSpec, frame: Frame): MercatorGrid {
	const cached = cache.get(frame);
	if (cached) return cached;

	const lookup = new Int32Array(grid.cols * grid.rows).fill(-1);
	frame.cells.index.forEach((cell, i) => {
		lookup[cell] = i;
	});

	const west = grid.west;
	const east = grid.west + grid.cols * grid.step;
	const south = grid.south;
	const north = grid.south + grid.rows * grid.step;
	const width = grid.cols;
	const height = grid.rows;
	const yNorth = mercatorY(north);
	const ySouth = mercatorY(south);
	const cellAt = new Int32Array(width * height).fill(-1);

	for (let j = 0; j < height; j++) {
		const lat = latFromMercatorY(
			yNorth + ((j + 0.5) / height) * (ySouth - yNorth),
		);
		const row = Math.floor((lat - south) / grid.step);
		if (row < 0 || row >= grid.rows) continue;
		for (let i = 0; i < width; i++) {
			cellAt[j * width + i] = lookup[row * grid.cols + i];
		}
	}

	const result: MercatorGrid = {
		width,
		height,
		west,
		east,
		north,
		south,
		cellAt,
		corners: [
			[west, north],
			[east, north],
			[east, south],
			[west, south],
		],
	};
	cache.set(frame, result);
	return result;
}
