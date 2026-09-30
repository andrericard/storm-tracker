import type { MapSettings } from "#/components/storm-map";
import { Label } from "#/components/ui/label";
import { Separator } from "#/components/ui/separator";
import { Slider } from "#/components/ui/slider";
import { Switch } from "#/components/ui/switch";
import { BRIGHTNESS_TEMP_STOPS, kelvinToCelsius } from "#/lib/map-data";

interface LayerControlsProps {
	settings: MapSettings;
	onChange: (settings: MapSettings) => void;
}

const TOGGLES: {
	key: "clouds" | "lowClouds" | "lightning" | "tracks";
	label: string;
}[] = [
	{ key: "clouds", label: "3D cloud tops" },
	{ key: "lowClouds", label: "Show warm / low clouds" },
	{ key: "lightning", label: "Lightning (GLM)" },
	{ key: "tracks", label: "Tracks & forecast" },
];

function Legend() {
	const min = BRIGHTNESS_TEMP_STOPS[0][0];
	const max = BRIGHTNESS_TEMP_STOPS[BRIGHTNESS_TEMP_STOPS.length - 1][0];
	const gradient = BRIGHTNESS_TEMP_STOPS.map(
		([k, color]) => `${color} ${((k - min) / (max - min)) * 100}%`,
	).join(", ");
	const ticks = [190, 210, 235, 270];
	return (
		<div>
			<div className="mb-1.5 text-xs text-muted-foreground">
				Cloud top temperature
			</div>
			<div
				className="h-2.5 rounded-full"
				style={{ background: `linear-gradient(90deg, ${gradient})` }}
			/>
			<div className="relative mt-1 h-3 text-[10px] text-muted-foreground tabular-nums">
				{ticks.map((k) => (
					<span
						key={k}
						className="absolute -translate-x-1/2"
						style={{ left: `${((k - min) / (max - min)) * 100}%` }}
					>
						{kelvinToCelsius(k)}°
					</span>
				))}
			</div>
		</div>
	);
}

export function LayerControls({ settings, onChange }: LayerControlsProps) {
	return (
		<div className="pointer-events-auto flex w-64 flex-col gap-3 rounded-xl border bg-background/85 p-4 shadow-2xl backdrop-blur-md">
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
					value={[settings.exaggeration]}
					onValueChange={([value]) =>
						onChange({ ...settings, exaggeration: value })
					}
				/>
			</div>
			<Separator />
			<Legend />
		</div>
	);
}
