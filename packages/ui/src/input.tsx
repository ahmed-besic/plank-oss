import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";

export function Input({
	className,
	...props
}: InputHTMLAttributes<HTMLInputElement>) {
	return (
		<input
			className={cn(
				"w-full rounded-xl border border-border-subtle bg-cloud-white px-3.5 py-2.5 text-sm text-grape-vine",
				"outline-none transition-all duration-200 placeholder:text-text-placeholder",
				"hover:border-border-default",
				"focus:border-electric-violet focus:shadow-glow-violet",
				"disabled:opacity-40 disabled:pointer-events-none",
				className,
			)}
			{...props}
		/>
	);
}
