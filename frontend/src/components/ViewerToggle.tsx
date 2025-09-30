// no default React import needed
import type { ViewerMode } from "../lib/viewer";
import { VIEWER_LABELS } from "../lib/viewer";


type Props = {
  value: ViewerMode;
  onChange: (mode: ViewerMode) => void;
  className?: string;
};

const OPTIONS: ViewerMode[] = ["recruiter", "ethics", "dev"];

export default function ViewerToggle({ value, onChange, className = "" }: Props) {
  return (
    <div
      className={`inline-flex items-center rounded-xl bg-white p-1 ring-1 ring-slate-300 shadow-sm ${className}`}
      role="tablist"
      aria-label="Viewer mode"
    >
      {OPTIONS.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt)}
            className={[
              "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
              active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
            ].join(" ")}
          >
            {VIEWER_LABELS[opt]}
          </button>
        );
      })}
    </div>
  );
}
