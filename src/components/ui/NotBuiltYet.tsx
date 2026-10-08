import { Construction } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

export function NotBuiltYet({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto mt-6 max-w-xl rounded-xl border border-dashed border-ink-600 bg-ink-850/60 p-8 text-center">
      <Construction aria-hidden className="mx-auto size-10 text-fog-400" />
      <Badge tone="soon" className="mt-4">
        Not built yet
      </Badge>
      <h1 className="mt-3 font-display text-3xl font-bold">{title}</h1>
      <p className="mt-2 text-fog-300">{description}</p>
    </div>
  );
}
