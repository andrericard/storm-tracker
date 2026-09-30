import {
	bearingDeg,
	destination,
	distanceKm,
	EARTH_RADIUS_KM,
	toLocalKm,
} from "#/lib/geo";
import type {
	GridSpec,
	LatLon,
	Severity,
	StormSnapshot,
	ThreatStatus,
	TrackSummary,
} from "#/lib/storm-types";

const SEGMENT_THRESHOLDS_K = [235, 225, 215, 205, 195];
const MIN_CELLS = 4;
const MAX_STORM_AREA_KM2 = 6000;
const FLASH_SEARCH_CELLS = 3;
const MATCH_DISTANCE_KM = 60;
const FORECAST_MINUTES = 180;
const NEIGHBOR_MOTION_KM = 250;

export interface DetectedStorm {
	snapshot: StormSnapshot;
	cells: number[];
}

export interface FrameGrid {
	time: number;
	brightnessTemp: Float32Array;
	height: Float32Array;
	flashCells: Int32Array;
}

function cellAreaKm2(grid: GridSpec, row: number) {
	const lat = grid.south + (row + 0.5) * grid.step;
	const side = (grid.step * Math.PI * EARTH_RADIUS_KM) / 180;
	return side * side * Math.cos((lat * Math.PI) / 180);
}

function severityFor(minBrightnessTempK: number, flashCount: number): Severity {
	let score = 0;
	if (minBrightnessTempK < 200) score = 3;
	else if (minBrightnessTempK < 210) score = 2;
	else if (minBrightnessTempK < 220) score = 1;
	if (flashCount >= 60) score += 1;
	const levels: Severity[] = ["moderate", "strong", "severe", "extreme"];
	return levels[Math.min(score, 3)];
}

function convexHull(points: [number, number][]) {
	const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	if (sorted.length < 3) return sorted;
	const cross = (
		o: [number, number],
		a: [number, number],
		b: [number, number],
	) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
	const lower: [number, number][] = [];
	for (const p of sorted) {
		while (
			lower.length >= 2 &&
			cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
		) {
			lower.pop();
		}
		lower.push(p);
	}
	const upper: [number, number][] = [];
	for (let i = sorted.length - 1; i >= 0; i--) {
		const p = sorted[i];
		while (
			upper.length >= 2 &&
			cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
		) {
			upper.pop();
		}
		upper.push(p);
	}
	const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
	hull.push(hull[0]);
	return hull.map(
		([lon, lat]) =>
			[Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4] as [
				number,
				number,
			],
	);
}

function components(
	grid: GridSpec,
	brightnessTemp: Float32Array,
	candidates: number[],
	threshold: number,
) {
	const { cols, rows } = grid;
	const allowed = new Set<number>();
	for (const cell of candidates) {
		if (brightnessTemp[cell] < threshold) allowed.add(cell);
	}
	const visited = new Set<number>();
	const groups: number[][] = [];
	for (const start of allowed) {
		if (visited.has(start)) continue;
		const group: number[] = [];
		const stack = [start];
		visited.add(start);
		while (stack.length) {
			const current = stack.pop() as number;
			group.push(current);
			const r = Math.floor(current / cols);
			const c = current % cols;
			for (let dr = -1; dr <= 1; dr++) {
				for (let dc = -1; dc <= 1; dc++) {
					const nr = r + dr;
					const nc = c + dc;
					if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
					const next = nr * cols + nc;
					if (allowed.has(next) && !visited.has(next)) {
						visited.add(next);
						stack.push(next);
					}
				}
			}
		}
		if (group.length >= MIN_CELLS) groups.push(group);
	}
	return groups;
}

function areaOf(grid: GridSpec, cells: number[]) {
	let area = 0;
	for (const cell of cells) {
		area += cellAreaKm2(grid, Math.floor(cell / grid.cols));
	}
	return area;
}

function segment(
	grid: GridSpec,
	brightnessTemp: Float32Array,
	cells: number[],
	level: number,
): number[][] {
	const nextThreshold = SEGMENT_THRESHOLDS_K[level + 1];
	if (nextThreshold === undefined) return [cells];
	const cores = components(grid, brightnessTemp, cells, nextThreshold);
	const oversized = areaOf(grid, cells) > MAX_STORM_AREA_KM2;
	if (cores.length >= 2 || (cores.length === 1 && oversized)) {
		return cores.flatMap((core) =>
			segment(grid, brightnessTemp, core, level + 1),
		);
	}
	return [cells];
}

function assignFlashes(
	grid: GridSpec,
	groups: number[][],
	flashCells: Int32Array,
) {
	const { cols, rows } = grid;
	const owner = new Int32Array(cols * rows).fill(-1);
	let frontier: number[] = [];
	groups.forEach((group, index) => {
		for (const cell of group) {
			owner[cell] = index;
			frontier.push(cell);
		}
	});
	for (let step = 0; step < FLASH_SEARCH_CELLS; step++) {
		const next: number[] = [];
		for (const cell of frontier) {
			const r = Math.floor(cell / cols);
			const c = cell % cols;
			for (let dr = -1; dr <= 1; dr++) {
				for (let dc = -1; dc <= 1; dc++) {
					const nr = r + dr;
					const nc = c + dc;
					if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
					const neighbor = nr * cols + nc;
					if (owner[neighbor] === -1) {
						owner[neighbor] = owner[cell];
						next.push(neighbor);
					}
				}
			}
		}
		frontier = next;
	}
	const counts = new Array<number>(groups.length).fill(0);
	for (const cell of flashCells) {
		if (owner[cell] >= 0) counts[owner[cell]]++;
	}
	return counts;
}

export function detectStorms(grid: GridSpec, frame: FrameGrid) {
	const all: number[] = [];
	for (let i = 0; i < frame.brightnessTemp.length; i++) {
		if (frame.brightnessTemp[i] < SEGMENT_THRESHOLDS_K[0]) all.push(i);
	}
	const groups = components(
		grid,
		frame.brightnessTemp,
		all,
		SEGMENT_THRESHOLDS_K[0],
	).flatMap((group) => segment(grid, frame.brightnessTemp, group, 0));
	const flashCounts = assignFlashes(grid, groups, frame.flashCells);

	return groups.map((cells, index): DetectedStorm => {
		let weightSum = 0;
		let lonSum = 0;
		let latSum = 0;
		let minBt = Number.POSITIVE_INFINITY;
		let maxHeight = 0;
		const corners: [number, number][] = [];
		const half = grid.step / 2;
		for (const cell of cells) {
			const r = Math.floor(cell / grid.cols);
			const c = cell % grid.cols;
			const lon = grid.west + (c + 0.5) * grid.step;
			const lat = grid.south + (r + 0.5) * grid.step;
			const cellBt = frame.brightnessTemp[cell];
			const weight = SEGMENT_THRESHOLDS_K[0] - cellBt + 1;
			weightSum += weight;
			lonSum += lon * weight;
			latSum += lat * weight;
			minBt = Math.min(minBt, cellBt);
			if (frame.height[cell] > maxHeight) maxHeight = frame.height[cell];
			corners.push(
				[lon - half, lat - half],
				[lon + half, lat - half],
				[lon + half, lat + half],
				[lon - half, lat + half],
			);
		}
		const flashCount = flashCounts[index];
		return {
			cells,
			snapshot: {
				trackId: 0,
				lon: lonSum / weightSum,
				lat: latSum / weightSum,
				areaKm2: Math.round(areaOf(grid, cells)),
				minBrightnessTempK: Math.round(minBt * 10) / 10,
				maxHeightM: Math.round(maxHeight),
				flashCount,
				severity: severityFor(minBt, flashCount),
				hull: convexHull(corners),
			},
		};
	});
}

export function assignTracks(framesStorms: DetectedStorm[][]) {
	let nextId = 1;
	let previous: DetectedStorm[] = [];
	for (const storms of framesStorms) {
		const owner = new Map<number, number>();
		previous.forEach((storm, index) => {
			for (const cell of storm.cells) owner.set(cell, index);
		});
		const taken = new Set<number>();
		const ordered = [...storms].sort((a, b) => b.cells.length - a.cells.length);
		for (const storm of ordered) {
			const overlap = new Map<number, number>();
			for (const cell of storm.cells) {
				const index = owner.get(cell);
				if (index !== undefined) {
					overlap.set(index, (overlap.get(index) ?? 0) + 1);
				}
			}
			let match = -1;
			let best = 0;
			for (const [index, count] of overlap) {
				if (!taken.has(index) && count > best) {
					best = count;
					match = index;
				}
			}
			if (match < 0) {
				let nearest = MATCH_DISTANCE_KM;
				previous.forEach((candidate, index) => {
					if (taken.has(index)) return;
					const d = distanceKm(candidate.snapshot, storm.snapshot);
					if (d < nearest) {
						nearest = d;
						match = index;
					}
				});
			}
			if (match >= 0) {
				taken.add(match);
				storm.snapshot.trackId = previous[match].snapshot.trackId;
			} else {
				storm.snapshot.trackId = nextId++;
			}
		}
		previous = storms;
	}
}

function fitVelocity(points: { t: number; x: number; y: number }[]) {
	if (points.length < 2) return { vx: 0, vy: 0 };
	const n = points.length;
	const meanT = points.reduce((s, p) => s + p.t, 0) / n;
	const meanX = points.reduce((s, p) => s + p.x, 0) / n;
	const meanY = points.reduce((s, p) => s + p.y, 0) / n;
	let stt = 0;
	let stx = 0;
	let sty = 0;
	for (const p of points) {
		stt += (p.t - meanT) ** 2;
		stx += (p.t - meanT) * (p.x - meanX);
		sty += (p.t - meanT) * (p.y - meanY);
	}
	if (stt === 0) return { vx: 0, vy: 0 };
	return { vx: stx / stt, vy: sty / stt };
}

function statusRank(status: ThreatStatus) {
	return [
		"overhead",
		"approaching",
		"passing",
		"stationary",
		"distant",
	].indexOf(status);
}

export function summarizeTracks(
	times: number[],
	framesStorms: DetectedStorm[][],
	target: LatLon,
): TrackSummary[] {
	const latestIndex = framesStorms.length - 1;
	if (latestIndex < 0) return [];
	const latest = framesStorms[latestIndex];
	const motions = latest.map(({ snapshot }) => {
		const history: { t: number; snapshot: StormSnapshot }[] = [];
		const start = Math.max(0, latestIndex - 5);
		for (let i = start; i <= latestIndex; i++) {
			const match = framesStorms[i].find(
				(s) => s.snapshot.trackId === snapshot.trackId,
			);
			if (match) history.push({ t: times[i], snapshot: match.snapshot });
		}
		const origin: LatLon = { lat: snapshot.lat, lon: snapshot.lon };
		const velocity = fitVelocity(
			history.slice(-4).map((h) => ({
				t: (h.t - times[latestIndex]) / 3_600_000,
				...toLocalKm(origin, h.snapshot),
			})),
		);
		return {
			snapshot,
			history,
			origin,
			velocity,
			tracked: history.length >= 2,
		};
	});
	for (const motion of motions) {
		if (motion.tracked) continue;
		let weightSum = 0;
		let vxSum = 0;
		let vySum = 0;
		for (const other of motions) {
			if (!other.tracked) continue;
			const d = distanceKm(motion.origin, other.origin);
			if (d > NEIGHBOR_MOTION_KM) continue;
			const weight = 1 / Math.max(d, 10);
			weightSum += weight;
			vxSum += other.velocity.vx * weight;
			vySum += other.velocity.vy * weight;
		}
		if (weightSum > 0) {
			motion.velocity = { vx: vxSum / weightSum, vy: vySum / weightSum };
		}
	}
	const summaries = motions.map(
		({ snapshot, history, origin, velocity, tracked }) => {
			const { vx, vy } = velocity;
			const speedKmh = Math.hypot(vx, vy);
			const headingDeg = ((Math.atan2(vx, vy) * 180) / Math.PI + 360) % 360;
			const previous = history.length >= 2 ? history[history.length - 2] : null;
			const minutesBetween = previous
				? (times[latestIndex] - previous.t) / 60_000
				: 10;
			const coolingRateK = previous
				? ((snapshot.minBrightnessTempK -
						previous.snapshot.minBrightnessTempK) *
						10) /
					minutesBetween
				: 0;
			const flashTrend = previous
				? snapshot.flashCount - previous.snapshot.flashCount
				: 0;

			const radiusKm = Math.sqrt(snapshot.areaKm2 / Math.PI);
			const relative = toLocalKm(target, origin);
			const vMin = { x: vx / 60, y: vy / 60 };
			const vSquared = vMin.x ** 2 + vMin.y ** 2;
			const tClosest =
				vSquared > 0
					? Math.min(
							FORECAST_MINUTES,
							Math.max(
								0,
								-(relative.x * vMin.x + relative.y * vMin.y) / vSquared,
							),
						)
					: 0;
			const closestApproachKm = Math.hypot(
				relative.x + vMin.x * tClosest,
				relative.y + vMin.y * tClosest,
			);
			const distance = distanceKm(target, origin);
			const reach = radiusKm + 5;
			let etaMinutes: number | null = null;
			if (distance <= radiusKm) {
				etaMinutes = 0;
			} else if (vSquared > 0) {
				const a = vSquared;
				const b = 2 * (relative.x * vMin.x + relative.y * vMin.y);
				const c = relative.x ** 2 + relative.y ** 2 - reach * reach;
				const disc = b * b - 4 * a * c;
				if (disc >= 0) {
					const t = (-b - Math.sqrt(disc)) / (2 * a);
					if (t >= 0 && t <= FORECAST_MINUTES) etaMinutes = Math.round(t);
				}
			}

			let status: ThreatStatus = "distant";
			if (distance <= radiusKm) status = "overhead";
			else if (speedKmh < 5) status = "stationary";
			else if (etaMinutes !== null) status = "approaching";
			else if (closestApproachKm <= radiusKm + 30 && tClosest > 0)
				status = "passing";

			const forecast = [];
			if (speedKmh >= 5) {
				for (let m = 15; m <= FORECAST_MINUTES; m += 15) {
					const p = destination(origin, headingDeg, (speedKmh * m) / 60);
					forecast.push({ minutes: m, lon: p.lon, lat: p.lat });
				}
			}

			return {
				trackId: snapshot.trackId,
				severity: snapshot.severity,
				status,
				lon: snapshot.lon,
				lat: snapshot.lat,
				areaKm2: snapshot.areaKm2,
				radiusKm: Math.round(radiusKm),
				minBrightnessTempK: snapshot.minBrightnessTempK,
				maxHeightM: snapshot.maxHeightM,
				flashCount: snapshot.flashCount,
				flashTrend,
				coolingRateK: Math.round(coolingRateK * 10) / 10,
				speedKmh: Math.round(speedKmh),
				headingDeg: Math.round(headingDeg),
				distanceKm: Math.round(distance),
				bearingFromTargetDeg: Math.round(bearingDeg(target, origin)),
				closestApproachKm: Math.round(closestApproachKm),
				closestApproachMinutes: Math.round(tClosest),
				etaMinutes,
				motionInferred: !tracked,
				history: history.map(
					(h) => [h.snapshot.lon, h.snapshot.lat] as [number, number],
				),
				forecast,
			} satisfies TrackSummary;
		},
	);

	return summaries.sort(
		(a, b) =>
			statusRank(a.status) - statusRank(b.status) ||
			(a.etaMinutes ?? 999) - (b.etaMinutes ?? 999) ||
			a.distanceKm - b.distanceKm,
	);
}
