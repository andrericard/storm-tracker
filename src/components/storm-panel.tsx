import {
	ArrowDownRight,
	ArrowUpRight,
	CloudLightning,
	Crosshair,
	Loader2,
	MapPin,
	Navigation,
	RefreshCw,
	Zap,
} from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Separator } from "#/components/ui/separator";
import {
	formatAge,
	formatMinutes,
	headline,
	STATUS_LABELS,
} from "#/lib/format";
import { compass } from "#/lib/geo";
import { kelvinToCelsius, SEVERITY_COLORS } from "#/lib/map-data";
import type { FramesResponse, TrackSummary } from "#/lib/storm-types";
import { cn } from "#/lib/utils";

interface StormPanelProps {
	data: FramesResponse | undefined;
	locationName: string;
	isLoading: boolean;
	isFetching: boolean;
	error: Error | null;
	picking: boolean;
	selectedTrackId: number | null;
	onTogglePicking: () => void;
	onRefresh: () => void;
	onSelectTrack: (track: TrackSummary) => void;
}

const TONE_STYLES = {
	alert: "border-red-500/40 bg-red-500/10 text-red-100",
	watch: "border-amber-500/40 bg-amber-500/10 text-amber-100",
	calm: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
};

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="flex flex-col">
			<span className="text-[10px] uppercase tracking-wider text-muted-foreground">
				{label}
			</span>
			<span className="text-sm font-medium tabular-nums">{value}</span>
		</div>
	);
}

function Trend({
	value,
	unit,
	invert,
}: {
	value: number;
	unit: string;
	invert?: boolean;
}) {
	if (value === 0) return null;
	const worsening = invert ? value < 0 : value > 0;
	const Icon = value > 0 ? ArrowUpRight : ArrowDownRight;
	return (
		<span
			className={cn(
				"ml-1 inline-flex items-center text-xs",
				worsening ? "text-red-400" : "text-emerald-400",
			)}
		>
			<Icon className="size-3" />
			{Math.abs(value)}
			{unit}
		</span>
	);
}

function TrackCard({
	track,
	selected,
	onSelect,
}: {
	track: TrackSummary;
	selected: boolean;
	onSelect: () => void;
}) {
	const color = SEVERITY_COLORS[track.severity];
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"w-full rounded-lg border bg-card/60 p-3 text-left transition-colors hover:bg-accent/60",
				selected && "ring-2 ring-sky-400/70",
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<span
						className="size-2.5 rounded-full"
						style={{ background: color }}
					/>
					<span className="font-semibold">Storm #{track.trackId}</span>
					<Badge
						variant="outline"
						className="capitalize"
						style={{ borderColor: color, color }}
					>
						{track.severity}
					</Badge>
				</div>
				<span className="text-xs text-muted-foreground">
					{STATUS_LABELS[track.status]}
				</span>
			</div>
			<div className="mt-1 text-xs text-muted-foreground">
				{track.distanceKm} km {compass(track.bearingFromTargetDeg)} of target
				{track.speedKmh >= 5 &&
					` · moving ${compass(track.headingDeg)} ${track.speedKmh} km/h${track.motionInferred ? " (est.)" : ""}`}
				{track.etaMinutes !== null &&
					track.etaMinutes > 0 &&
					` · ETA ${formatMinutes(track.etaMinutes)}`}
			</div>
			<div className="mt-3 grid grid-cols-4 gap-2">
				<Metric
					label="Top temp"
					value={
						<>
							{kelvinToCelsius(track.minBrightnessTempK)}°C
							<Trend value={track.coolingRateK} unit="°" invert />
						</>
					}
				/>
				<Metric
					label="Top height"
					value={`${(track.maxHeightM / 1000).toFixed(1)} km`}
				/>
				<Metric
					label="Flashes"
					value={
						<>
							{track.flashCount}
							<Trend value={track.flashTrend} unit="" />
						</>
					}
				/>
				<Metric
					label="Area"
					value={`${Math.round(track.areaKm2).toLocaleString()} km²`}
				/>
			</div>
		</button>
	);
}

export function StormPanel({
	data,
	locationName,
	isLoading,
	isFetching,
	error,
	picking,
	selectedTrackId,
	onTogglePicking,
	onRefresh,
	onSelectTrack,
}: StormPanelProps) {
	const status = data ? headline(data.tracks[0], data.radiusKm) : null;
	const latestFrame = data?.frames.at(-1);
	return (
		<div className="pointer-events-auto flex max-h-[calc(100vh-2rem)] w-[380px] flex-col rounded-xl border bg-background/85 shadow-2xl backdrop-blur-md">
			<div className="flex items-center justify-between p-4 pb-3">
				<div className="flex items-center gap-2">
					<CloudLightning className="size-5 text-sky-400" />
					<div>
						<h1 className="text-base font-semibold leading-none">
							Storm Tracker
						</h1>
						<p className="mt-1 text-xs text-muted-foreground">
							GOES-19 · ABI + GLM
						</p>
					</div>
				</div>
				<Button
					variant="ghost"
					size="icon"
					onClick={onRefresh}
					disabled={isFetching}
					aria-label="Refresh"
				>
					{isFetching ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<RefreshCw className="size-4" />
					)}
				</Button>
			</div>

			<div className="flex items-center justify-between gap-2 px-4 pb-3">
				<div className="flex min-w-0 items-center gap-1.5 text-sm">
					<MapPin className="size-4 shrink-0 text-sky-400" />
					<span className="truncate">{locationName}</span>
				</div>
				<Button
					variant={picking ? "default" : "outline"}
					size="sm"
					onClick={onTogglePicking}
				>
					<Crosshair className="size-3.5" />
					{picking ? "Click the map" : "Change"}
				</Button>
			</div>

			<Separator />

			<div className="p-4">
				{isLoading && (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
						Downloading GOES-19 data from NOAA… the first load can take a
						minute.
					</div>
				)}
				{error && !data && (
					<div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
						{error.message}
					</div>
				)}
				{status && (
					<div
						className={cn("rounded-lg border p-3", TONE_STYLES[status.tone])}
					>
						<div className="font-semibold">{status.title}</div>
						<div className="mt-1 text-xs opacity-80">{status.detail}</div>
					</div>
				)}
				{latestFrame && (
					<div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
						<span className="flex items-center gap-1">
							<Navigation className="size-3" />
							{data?.tracks.length ?? 0} active cells
						</span>
						<span className="flex items-center gap-1">
							<Zap className="size-3" />
							Latest scan {formatAge(latestFrame.time)}
						</span>
					</div>
				)}
			</div>

			{data && data.tracks.length > 0 && (
				<>
					<Separator />
					<div className="min-h-0 flex-1 overflow-y-auto">
						<div className="flex flex-col gap-2 p-4">
							{data.tracks.map((track) => (
								<TrackCard
									key={track.trackId}
									track={track}
									selected={track.trackId === selectedTrackId}
									onSelect={() => onSelectTrack(track)}
								/>
							))}
						</div>
					</div>
				</>
			)}
		</div>
	);
}
