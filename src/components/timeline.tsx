import { Pause, Play } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Slider } from "#/components/ui/slider";
import { formatClock } from "#/lib/format";
import { useTranslation } from "#/lib/i18n";
import type { Frame } from "#/lib/storm-types";

interface TimelineProps {
	frames: Frame[];
	index: number;
	playing: boolean;
	onIndexChange: (index: number) => void;
	onTogglePlay: () => void;
}

export function Timeline({
	frames,
	index,
	playing,
	onIndexChange,
	onTogglePlay,
}: TimelineProps) {
	const { t } = useTranslation();
	const frame = frames[index];
	if (!frame) return null;
	const isLatest = index === frames.length - 1;
	return (
		<div className="pointer-events-auto flex w-[min(560px,calc(100vw-2rem))] items-center gap-4 rounded-xl border bg-background/85 px-4 py-3 shadow-2xl backdrop-blur-md">
			<Button
				size="icon"
				variant="secondary"
				onClick={onTogglePlay}
				aria-label={t(playing ? "Pause" : "Play")}
			>
				{playing ? <Pause className="size-4" /> : <Play className="size-4" />}
			</Button>
			<div className="flex flex-1 flex-col gap-2">
				<div className="flex items-center justify-between text-xs">
					<span className="font-medium tabular-nums">
						{formatClock(frame.time)}
					</span>
					<div className="flex items-center gap-2 text-muted-foreground">
						{frame.heightSource === "estimated" && (
							<span
								title={t(
									"Cloud Top Height product not yet available for this scan",
								)}
							>
								{t("height estimated")}
							</span>
						)}
						<span>
							{frame.flashes.length / 2} {t("flashes")}
						</span>
						{isLatest && (
							<Badge className="bg-red-500/90 text-white hover:bg-red-500/90">
								{t("LIVE")}
							</Badge>
						)}
					</div>
				</div>
				<Slider
					aria-label={t("Timeline")}
					min={0}
					max={frames.length - 1}
					step={1}
					value={[index]}
					onValueChange={([value]) => onIndexChange(value)}
				/>
				<div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
					<span>{formatClock(frames[0].time)}</span>
					<span>{formatClock(frames[frames.length - 1].time)}</span>
				</div>
			</div>
		</div>
	);
}
