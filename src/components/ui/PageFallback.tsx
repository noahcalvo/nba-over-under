export function PageFallback({ label }: { label: string }) {
  return (
    <p role="status" className="py-16 text-center text-fog-400">
      {label}
    </p>
  );
}
