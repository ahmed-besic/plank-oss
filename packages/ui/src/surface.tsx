import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function Surface({
	children,
	className,
	glass = false,
	...props
}: HTMLAttributes<HTMLDivElement> & {
	children: ReactNode;
	glass?: boolean;
}) {
	return (
		<div
			className={cn(
				"rounded-2xl border transition-all duration-200",
				glass
					? "border-white/40 bg-white/72 shadow-subtle-2 backdrop-blur-xl"
					: "border-border-subtle bg-cloud-white shadow-subtle-2",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}
