import { importanceOption, taskColorVars, type TaskImportance } from '../types';

export default function ImportanceBadge({ importance }: { importance?: TaskImportance }) {
  const option = importanceOption(importance);
  const color = taskColorVars({ importance });
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ background: color.bg, color: color.fg }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color.bar }} />
      {option.label}
    </span>
  );
}
