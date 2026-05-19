import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function Button({
	children,
	className,
	tone = "primary",
	size = "default",
	...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
	children: ReactNode;
	tone?: "primary" | "ghost" | "danger" | "secondary";
	size?: "default" | "sm" | "lg" | "icon";
}) {
	return (
		<button
			className={cn(
				"inline-flex max-w-full shrink-0 items-center justify-center overflow-hidden whitespace-nowrap rounded-xl font-semibold transition-all duration-200 select-none",
				"focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-violet",
				"active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40",
				size === "sm" && "gap-1.5 px-3 py-1.5 text-xs",
				size === "default" && "gap-2 px-4 py-2.5 text-sm",
				size === "lg" && "gap-2.5 px-6 py-3 text-base",
				size === "icon" && "h-9 w-9 rounded-lg p-0",
				tone === "primary" &&
					"bg-electric-violet text-white shadow-button hover:bg-violet-600 hover:shadow-elevated",
				tone === "secondary" &&
					"bg-lavender-mist text-grape-vine hover:bg-ghost-gray",
				tone === "ghost" &&
					"bg-transparent text-muted-violet hover:bg-lavender-mist hover:text-grape-vine",
				tone === "danger" &&
					"bg-warning-orange text-white shadow-button hover:bg-warning-orange/90 hover:shadow-elevated",
				className,
			)}
			{...props}
		>
			{children}
		</button>
	);
}
