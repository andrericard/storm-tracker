import type { MapSettings, ViewMode } from "#/components/storm-map";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { Separator } from "#/components/ui/separator";
import { Slider } from "#/components/ui/slider";
import { Switch } from "#/components/ui/switch";
import { OVERLAY_DESCRIPTIONS } from "#/lib/glossary";
import { BRIGHTNESS_TEMP_STOPS, kelvinToCelsius } from "#/lib/map-data";
import {
	OVERLAYS,
	type OverlayChoice,
	RAIN_SCALE,
	RAIN_TICKS,
} from "#/lib/overlays";
import type { EnvironmentModel } from "#/lib/storm-types";

interface LayerControlsProps {
	settings: MapSettings;
	model: EnvironmentModel | null;
	onChange: (settings: MapSettings) => void;
}

const VIEW_MODES: { value: ViewMode; label: string }[] = [
	{ value: "2d", label: "2D" },
	{ value: "3d", label: "3D" },
];

const TOGGLES: {
	key: "clouds" | "lowClouds" | "rain" | "radar" | "lightning" | "tracks";
	label: string;
}[] = [
	{ key: "clouds", label: "Cloud layer" },
	{ key: "lowClouds", label: "Show warm / low clouds" },
	{ key: "rain", label: "Rain rate (GOES)" },
	{ key: "radar", label: "Radar (Simepar)" },
	{ key: "lightning", label: "Lightning (GLM)" },
	{ key: "tracks", label: "Tracks & forecast" },
];

const OVERLAY_CHOICES: { value: OverlayChoice; label: string }[] = [
	{ value: "none", label: "Off" },
	{ value: "mslp", label: "Air pressure" },
	{ value: "cape", label: "Storm energy (CAPE)" },
	{ value: "shear6", label: "Wind shear" },
	{ value: "srh3", label: "Rotation (helicity)" },
];

const IR_MIN = BRIGHTNESS_TEMP_STOPS[0][0];
const IR_MAX = BRIGHTNESS_TEMP_STOPS[BRIGHTNESS_TEMP_STOPS.length - 1][0];
const IR_GRADIENT = `linear-gradient(90deg, ${BRIGHTNESS_TEMP_STOPS.map(
	([k, color]) => `${color} ${((k - IR_MIN) / (IR_MAX - IR_MIN)) * 100}%`,
).join(", ")})`;

function Legend({
	title,
	gradient,
	min,
	max,
	ticks,
	format,
}: {
	title: string;
	gradient: string;
	min: number;
	max: number;
	ticks: number[];
	format: (value: number) => string;
}) {
	return (
		<div>
			<div className="mb-1.5 text-xs text-muted-foreground">{title}</div>
			<div className="h-2.5 rounded-full" style={{ background: gradient }} />
			<div className="relative mt-1 h-3 text-[10px] text-muted-foreground tabular-nums">
				{ticks.map((value) => (
					<span
						key={value}
						className="absolute -translate-x-1/2"
						style={{ left: `${((value - min) / (max - min)) * 100}%` }}
					>
						{format(value)}
					</span>
				))}
			</div>
		</div>
	);
}

function formatModel(model: EnvironmentModel) {
	const hour = model.cycle.slice(8);
	return `GFS ${hour}z +${model.forecastHour}h`;
}

export function LayerControls({
	settings,
	model,
	onChange,
}: LayerControlsProps) {
	const overlay =
		settings.overlay === "none" ? null : OVERLAYS[settings.overlay];
	return (
		<div className="pointer-events-auto flex w-64 flex-col gap-3 rounded-xl border bg-background/85 p-4 shadow-2xl backdrop-blur-md">
			<div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
				{VIEW_MODES.map(({ value, label }) => (
					<Button
						key={value}
						size="sm"
						variant={settings.view === value ? "default" : "ghost"}
						className="h-7"
						onClick={() => onChange({ ...settings, view: value })}
					>
						{label}
					</Button>
				))}
			</div>
			{TOGGLES.map(({ key, label }) => (
				<div key={key} className="flex items-center justify-between gap-2">
					<Label htmlFor={key} className="text-sm font-normal">
						{label}
					</Label>
					<Switch
						id={key}
						checked={settings[key]}
						onCheckedChange={(checked) =>
							onChange({ ...settings, [key]: checked })
						}
					/>
				</div>
			))}
			<div>
				<div className="mb-1.5 flex items-center justify-between text-sm">
					<span>Environment overlay</span>
					{model && (
						<span className="text-[10px] text-muted-foreground">
							{formatModel(model)}
						</span>
					)}
				</div>
				<div className="flex flex-col gap-1">
					{OVERLAY_CHOICES.map(({ value, label }) => (
						<Button
							key={value}
							size="sm"
							variant={settings.overlay === value ? "default" : "outline"}
							className="h-7 justify-start px-2 text-xs"
							disabled={!model && value !== "none"}
							onClick={() => onChange({ ...settings, overlay: value })}
						>
							{label}
						</Button>
					))}
				</div>
				<p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
					{OVERLAY_DESCRIPTIONS[settings.overlay]}
				</p>
			</div>
			<div>
				<div className="mb-2 flex items-center justify-between text-sm">
					<span>Cloud opacity</span>
					<span className="text-muted-foreground tabular-nums">
						{Math.round(settings.opacity * 100)}%
					</span>
				</div>
				<Slider
					min={0.1}
					max={1}
					step={0.05}
					value={[settings.opacity]}
					onValueChange={([value]) => onChange({ ...settings, opacity: value })}
				/>
			</div>
			<div className={settings.view === "2d" ? "opacity-40" : undefined}>
				<div className="mb-2 flex items-center justify-between text-sm">
					<span>Vertical exaggeration</span>
					<span className="text-muted-foreground tabular-nums">
						{settings.exaggeration}×
					</span>
				</div>
				<Slider
					min={1}
					max={20}
					step={1}
					disabled={settings.view === "2d"}
					value={[settings.exaggeration]}
					onValueChange={([value]) =>
						onChange({ ...settings, exaggeration: value })
					}
				/>
			</div>
			<Separator />
			<Legend
				title="Cloud top temperature"
				gradient={IR_GRADIENT}
				min={IR_MIN}
				max={IR_MAX}
				ticks={[190, 210, 235, 270]}
				format={(k) => `${kelvinToCelsius(k)}°`}
			/>
			{settings.radar && (
				<Legend
					title="Radar intensity (Simepar)"
					gradient="linear-gradient(90deg, #15803d 0%, #22c55e 25%, #facc15 50%, #dc2626 75%, #d946ef 100%)"
					min={0}
					max={100}
					ticks={[10, 50, 90]}
					format={(v) => (v < 30 ? "weak" : v < 70 ? "moderate" : "strong")}
				/>
			)}
			{settings.rain && (
				<Legend
					title="Rain rate (mm/h)"
					gradient={RAIN_SCALE.cssGradient}
					min={RAIN_SCALE.stops[0][0]}
					max={RAIN_SCALE.stops[RAIN_SCALE.stops.length - 1][0]}
					ticks={RAIN_TICKS}
					format={(v) => `${v}`}
				/>
			)}
			{overlay && (
				<Legend
					title={`${overlay.label} (${overlay.unit})`}
					gradient={overlay.scale.cssGradient}
					min={overlay.scale.stops[0][0]}
					max={overlay.scale.stops[overlay.scale.stops.length - 1][0]}
					ticks={overlay.ticks}
					format={(v) => `${v}`}
				/>
			)}
		</div>
	);
}
