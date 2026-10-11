interface GameplayStatusProps {
  value: string | number;
  label: string;
  progress?: {
    value: number;
    max: number;
    label?: string;
  };
  className?: string;
}

/** Compact, presentational score/timer metric for a mode-owned header. */
export default function GameplayStatus({
  value,
  label,
  progress,
  className = "",
}: GameplayStatusProps) {
  const progressValue = progress
    ? Math.min(Math.max(progress.value, 0), progress.max)
    : 0;
  const progressPercent = progress?.max
    ? (progressValue / progress.max) * 100
    : 0;

  return (
    <div className={`grid justify-items-center gap-1 text-center ${className}`}>
      <p className="text-base font-bold leading-none text-[var(--accent-highlight)] sm:text-xl">
        {value}
      </p>
      <p className="text-[0.55rem] uppercase tracking-[0.16em] text-[var(--foreground-muted)] sm:text-[0.65rem]">
        {label}
      </p>
      {progress && (
        <div
          role="progressbar"
          aria-label={progress.label ?? label}
          aria-valuemin={0}
          aria-valuemax={progress.max}
          aria-valuenow={progressValue}
          className="mt-1 h-2 w-24 overflow-hidden rounded-full bg-white sm:w-32"
        >
          <div
            className="h-full bg-[var(--status-success)] transition-[width]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
}
