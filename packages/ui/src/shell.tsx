import type { ReactNode } from "react";
import { cn } from "./cn";

export function AppShell({
  sidebar,
  header,
  children,
}: {
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-lavender-mist">
      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-6 px-4 py-6 lg:px-6">
        <aside className="hidden w-[248px] shrink-0 lg:block">{sidebar}</aside>
        <main className="flex min-w-0 flex-1 flex-col gap-5">
          <div>{header}</div>
          <div className={cn("min-h-0 flex-1")}>{children}</div>
        </main>
      </div>
    </div>
  );
}
