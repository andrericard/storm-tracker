import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip";
import { cn } from "#/lib/utils";

interface HelpProps {
	text: string;
	className?: string;
	children: React.ReactNode;
}

export function Help({ text, className, children }: HelpProps) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					className={cn(
						"cursor-help underline decoration-dotted decoration-muted-foreground/60 underline-offset-2",
						className,
					)}
				>
					{children}
				</span>
			</TooltipTrigger>
			<TooltipContent side="right" className="max-w-64 text-xs leading-snug">
				{text}
			</TooltipContent>
		</Tooltip>
	);
}
