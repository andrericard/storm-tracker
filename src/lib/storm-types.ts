export type Severity = "moderate" | "strong" | "severe" | "extreme";

export type ThreatStatus =
	| "overhead"
	| "approaching"
	| "passing"
	| "stationary"
	| "distant";

export interface LatLon {
	lat: number;
	lon: number;
}

export interface GridSpec {
	west: number;
	south: number;
	step: number;
	cols: number;
	rows: number;
}

export interface CloudCells {
	index: number[];
	brightnessTemp: number[];
	height: number[];
}

export interface StormSnapshot {
	trackId: number;
	lon: number;
	lat: number;
	areaKm2: number;
	minBrightnessTempK: number;
	maxHeightM: number;
	flashCount: number;
	severity: Severity;
	hull: [number, number][];
}

export interface Frame {
	time: string;
	heightSource: "acha" | "estimated";
	cells: CloudCells;
	flashes: number[];
	storms: StormSnapshot[];
}

export interface ForecastPoint {
	minutes: number;
	lon: number;
	lat: number;
}

export interface TrackSummary {
	trackId: number;
	severity: Severity;
	status: ThreatStatus;
	lon: number;
	lat: number;
	areaKm2: number;
	radiusKm: number;
	minBrightnessTempK: number;
	maxHeightM: number;
	flashCount: number;
	flashTrend: number;
	coolingRateK: number;
	speedKmh: number;
	headingDeg: number;
	distanceKm: number;
	bearingFromTargetDeg: number;
	closestApproachKm: number;
	closestApproachMinutes: number;
	etaMinutes: number | null;
	motionInferred: boolean;
	history: [number, number][];
	forecast: ForecastPoint[];
}

export interface FramesResponse {
	target: LatLon;
	radiusKm: number;
	grid: GridSpec;
	frames: Frame[];
	tracks: TrackSummary[];
	generatedAt: string;
}
