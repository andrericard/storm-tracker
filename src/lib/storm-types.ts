export type Severity = "moderate" | "strong" | "severe" | "extreme";

export type ThreatStatus =
	| "overhead"
	| "approaching"
	| "passing"
	| "stationary"
	| "distant"
	| "uncertain";

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
	overshootDepthK: number;
	maxRainRateMmh: number;
	hull: [number, number][];
}

export interface RainCells {
	index: number[];
	rate: number[];
}

export interface Frame {
	time: string;
	heightSource: "acha" | "estimated";
	cells: CloudCells;
	rain: RainCells;
	rainAtTargetMmh: number;
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
	motionSamples: number;
	lightningJump: boolean;
	overshootingTop: boolean;
	overshootDepthK: number;
	maxRainRateMmh: number;
	environment?: StormEnvironment;
	history: [number, number][];
	forecast: ForecastPoint[];
}

export type TornadoRisk = "none" | "low" | "moderate" | "high";

export interface StormEnvironment {
	mslpHpa: number;
	capeJkg: number;
	cinJkg: number;
	liftedIndexK: number;
	lclM: number;
	shear6Ms: number;
	shear1Ms: number;
	srh1M2s2: number;
	srh3M2s2: number;
	stp: number;
	risk: TornadoRisk;
	motionFromTrack: boolean;
}

export interface EnvironmentModel {
	cycle: string;
	forecastHour: number;
	validTime: string;
}

export type OverlayField = "mslp" | "cape" | "shear6" | "srh3";

export interface EnvironmentResponse {
	model: EnvironmentModel;
	grid: GridSpec;
	fields: Record<OverlayField, number[]>;
	target: StormEnvironment;
}

export interface FramesResponse {
	target: LatLon;
	radiusKm: number;
	grid: GridSpec;
	frames: Frame[];
	tracks: TrackSummary[];
	environment: EnvironmentResponse | null;
	generatedAt: string;
}

export interface SimeparForecast {
	city: string;
	url: string;
	hours: {
		day: string;
		time: string;
		condition: string;
		tempC: number;
		rainMm: number;
		rainChance: number;
		wind: string;
	}[];
}
