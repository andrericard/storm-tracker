import {
	ArrowDownRight,
	ArrowUpRight,
	CloudLightning,
	CloudRain,
	Crosshair,
	Loader2,
	MapPin,
	Navigation,
	RefreshCw,
	Tornado,
	TrendingUp,
	Zap,
} from "lucide-react";
import { Help } from "#/components/help";
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
import { GLOSSARY, type GlossaryKey } from "#/lib/glossary";
import { useTranslation } from "#/lib/i18n";
import { kelvinToCelsius, SEVERITY_COLORS } from "#/lib/map-data";
import type {
	FramesResponse,
	StormEnvironment,
	TornadoRisk,
	TrackSummary,
} from "#/lib/storm-types";
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

const RISK_STYLES: Record<TornadoRisk, string> = {
	none: "border-border text-muted-foreground",
	low: "border-yellow-500/60 bg-yellow-500/10 text-yellow-200",
	moderate: "border-orange-500/60 bg-orange-500/10 text-orange-200",
	high: "border-red-500/70 bg-red-500/15 text-red-200",
};

const RISK_LABELS: Record<TornadoRisk, string> = {
	none: "Tornado: none",
	low: "Tornado: low",
	moderate: "Tornado: moderate",
	high: "Tornado: high",
};

function Metric({
	label,
	help,
	value,
}: {
	label: string;
	help: GlossaryKey;
	value: React.ReactNode;
}) {
	const { t } = useTranslation();
	return (
		<div className="flex min-w-0 flex-col whitespace-nowrap">
			<span className="text-[10px] uppercase tracking-wider text-muted-foreground">
				<Help text={GLOSSARY[help]}>{t(label)}</Help>
			</span>
			<span className="flex items-center text-sm font-medium tabular-nums">
				{value}
			</span>
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
				"ml-1 inline-flex shrink-0 items-center text-xs",
				worsening ? "text-red-400" : "text-emerald-400",
			)}
		>
			<Icon className="size-3" />
			{Math.abs(value)}
			{unit}
		</span>
	);
}

function Chip({
	icon: Icon,
	help,
	className,
	children,
}: {
	icon: React.ComponentType<{ className?: string }>;
	help: GlossaryKey;
	className: string;
	children: React.ReactNode;
}) {
	return (
		<Help
			text={GLOSSARY[help]}
			className={cn(
				"inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium no-underline",
				className,
			)}
		>
			<Icon className="size-3" />
			{children}
		</Help>
	);
}

function EnvironmentRow({ environment }: { environment: StormEnvironment }) {
	return (
		<div className="mt-3 grid grid-cols-[5.5rem_1fr_1fr_1fr] gap-2">
			<Metric label="CAPE" help="cape" value={`${environment.capeJkg} J/kg`} />
			<Metric
				label="Shear 0-6"
				help="shear6"
				value={`${environment.shear6Ms} m/s`}
			/>
			<Metric
				label="SRH 0-1"
				help="srh1"
				value={`${environment.srh1M2s2} m²/s²`}
			/>
			<Metric label="LCL" help="lcl" value={`${environment.lclM} m`} />
		</div>
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
	const { t, language } = useTranslation();
	const color = SEVERITY_COLORS[track.severity];
	const environment = track.environment;
	const chips = [
		track.lightningJump && (
			<Chip
				key="jump"
				icon={TrendingUp}
				help="lightningJump"
				className="border-yellow-400/60 bg-yellow-400/10 text-yellow-200"
			>
				{t("Lightning jump")}
			</Chip>
		),
		track.overshootingTop && (
			<Chip
				key="ot"
				icon={ArrowUpRight}
				help="overshootingTop"
				className="border-fuchsia-400/60 bg-fuchsia-400/10 text-fuchsia-200"
			>
				{t("Overshooting top")} {track.overshootDepthK}K
			</Chip>
		),
		track.maxRainRateMmh >= 1 && (
			<Chip
				key="rain"
				icon={CloudRain}
				help="rainRate"
				className="border-sky-400/50 bg-sky-400/10 text-sky-200"
			>
				{track.maxRainRateMmh} mm/h
			</Chip>
		),
		environment && environment.risk !== "none" && (
			<Chip
				key="risk"
				icon={Tornado}
				help="tornadoRisk"
				className={RISK_STYLES[environment.risk]}
			>
				{t(RISK_LABELS[environment.risk])} · STP {environment.stp}
			</Chip>
		),
	].filter(Boolean);
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"w-full rounded-lg border bg-card/60 p-3 text-left transition-colors hover:bg-accent/60",
				selected && "ring-2 ring-sky-400/70",
			)}
		>
			<div className="flex items-center justify-between gap-2 whitespace-nowrap">
				<div className="flex items-center gap-2">
					<span
						className="size-2.5 rounded-full"
						style={{ background: color }}
					/>
					<span className="font-semibold">
						{t("Storm")} #{track.trackId}
					</span>
					<Badge
						variant="outline"
						className="capitalize"
						style={{ borderColor: color, color }}
					>
						{t(track.severity)}
					</Badge>
				</div>
			</div>
			<div className="mt-1 truncate text-xs text-muted-foreground">
				{track.distanceKm} km {compass(track.bearingFromTargetDeg, language)}{" "}
				{t("of target")}
				{!track.motionInferred &&
					track.speedKmh >= 5 &&
					` · ${t("moving")} ${compass(track.headingDeg, language)} ${track.speedKmh} km/h${track.motionInferred ? " (est.)" : ""}`}
				{track.etaMinutes !== null &&
					track.etaMinutes > 0 &&
					` · ETA ${formatMinutes(track.etaMinutes)}`}
			</div>
			<p className="mt-1 text-xs text-muted-foreground">
				{t(STATUS_LABELS[track.status])}
				{!track.motionInferred &&
					` · ${t("{count} motion estimates", { count: track.motionSamples })}`}
			</p>
			{chips.length > 0 && (
				<div className="mt-2 flex flex-wrap gap-1">{chips}</div>
			)}
			<div className="mt-3 grid grid-cols-[5.5rem_1fr_1fr_1fr] gap-2">
				<Metric
					label="Top temp"
					help="topTemp"
					value={
						<>
							{kelvinToCelsius(track.minBrightnessTempK)}°C
							<Trend value={track.coolingRateK} unit="°" invert />
						</>
					}
				/>
				<Metric
					label="Top height"
					help="topHeight"
					value={`${(track.maxHeightM / 1000).toFixed(1)} km`}
				/>
				<Metric
					label="Flashes"
					help="flashes"
					value={
						<>
							{track.flashCount}
							<Trend value={track.flashTrend} unit="" />
						</>
					}
				/>
				<Metric
					label="Area"
					help="area"
					value={`${Math.round(track.areaKm2).toLocaleString()} km²`}
				/>
			</div>
			{environment && <EnvironmentRow environment={environment} />}
		</button>
	);
}

function TargetEnvironment({
	environment,
	rainMmh,
}: {
	environment: StormEnvironment;
	rainMmh: number;
}) {
	const { t } = useTranslation();
	return (
		<div className="mt-3 rounded-lg border bg-card/40 p-3">
			<div className="flex items-center justify-between whitespace-nowrap">
				<span className="text-xs font-medium">
					{t("Environment at target")}
				</span>
				<Chip
					icon={Tornado}
					help="tornadoRisk"
					className={RISK_STYLES[environment.risk]}
				>
					{t(RISK_LABELS[environment.risk])}
				</Chip>
			</div>
			<div className="mt-2 grid grid-cols-[5.5rem_1fr_1fr_1fr] gap-2">
				<Metric
					label="Pressure"
					help="pressure"
					value={`${environment.mslpHpa} hPa`}
				/>
				<Metric
					label="CAPE"
					help="cape"
					value={`${environment.capeJkg} J/kg`}
				/>
				<Metric label="CIN" help="cin" value={`${environment.cinJkg}`} />
				<Metric
					label="Rain now"
					help="rainNow"
					value={rainMmh > 0 ? `${rainMmh} mm/h` : t("dry")}
				/>
			</div>
			<div className="mt-2 grid grid-cols-[5.5rem_1fr_1fr_1fr] gap-2">
				<Metric
					label="Shear 0-6"
					help="shear6"
					value={`${environment.shear6Ms} m/s`}
				/>
				<Metric label="SRH 0-1" help="srh1" value={`${environment.srh1M2s2}`} />
				<Metric label="SRH 0-3" help="srh3" value={`${environment.srh3M2s2}`} />
				<Metric label="LCL" help="lcl" value={`${environment.lclM} m`} />
			</div>
		</div>
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
	const { t, language } = useTranslation();
	const status = data
		? headline(data.tracks[0], data.radiusKm, language)
		: null;
	const latestFrame = data?.frames.at(-1);
	return (
		<div className="pointer-events-auto flex max-h-[calc(100vh-2rem)] w-[400px] flex-col rounded-xl border bg-background/85 shadow-2xl backdrop-blur-md">
			<div className="flex items-center justify-between p-4 pb-3">
				<div className="flex items-center gap-2">
					<CloudLightning className="size-5 text-sky-400" />
					<div>
						<h1 className="text-base font-semibold leading-none">
							Storm Tracker
						</h1>
						<p className="mt-1 text-xs text-muted-foreground">
							GOES-19 · ABI + GLM · GFS
						</p>
					</div>
				</div>
				<Button
					variant="ghost"
					size="icon"
					onClick={onRefresh}
					disabled={isFetching}
					aria-label={t("Refresh")}
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
					{t(picking ? "Click the map" : "Change")}
				</Button>
			</div>

			<Separator />

			<div className="p-4">
				{isLoading && (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
						{t(
							"Downloading GOES-19 data from NOAA… the first load can take a minute.",
						)}
					</div>
				)}
				{error && !data && (
					<div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
						{t("Unable to load weather data. Try again.")}
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
							{data?.tracks.length ?? 0} {t("active cells")}
						</span>
						<span className="flex items-center gap-1">
							<Zap className="size-3" />
							{t("Latest scan")} {formatAge(latestFrame.time, language)}
						</span>
					</div>
				)}
				{data?.environment && latestFrame && (
					<TargetEnvironment
						environment={data.environment.target}
						rainMmh={latestFrame.rainAtTargetMmh}
					/>
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
