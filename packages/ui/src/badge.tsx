import type { ReactNode } from "react";
import { cn } from "./cn";

export function Badge({
	children,
	tone = "neutral",
	className,
}: {
	children: ReactNode;
	tone?:
		| "neutral"
		| "success"
		| "warning"
		| "info"
		| "accent"
		| "violet"
		| "teal";
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold tracking-tight transition-colors",
				tone === "neutral" && "bg-lavender-mist text-muted-violet",
				tone === "success" && "bg-success-green/10 text-success-green",
				tone === "warning" && "bg-warning-orange/10 text-warning-orange",
				tone === "info" && "bg-info-blue/10 text-info-blue",
				tone === "accent" && "bg-electric-violet/10 text-electric-violet",
				tone === "violet" && "bg-violet-50 text-electric-violet",
				tone === "teal" && "bg-accent-teal/10 text-accent-teal",
				className,
			)}
		>
			{children}
		</span>
	);
}
