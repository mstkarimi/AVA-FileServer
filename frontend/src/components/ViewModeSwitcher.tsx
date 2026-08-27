import { AlignJustify, List, LayoutGrid, Image as ImageIcon } from 'lucide-react';
import { ViewMode, VIEW_MODES, VIEW_LABEL, VIEW_HINT } from '../lib/viewModes';

// Icon choice is constrained: lucide-react is pinned at ^0.344.0 and a name it
// does not export fails `vite build` outright. These four are all long-standing
// (Feather-lineage / early-lucide) names — unlike Rows3 / Grid2x2, which were
// introduced by later renames and would be a build gamble.
const ICON: Record<ViewMode, typeof List> = {
  details: AlignJustify,
  list: List,
  tiles: LayoutGrid,
  gallery: ImageIcon,
};

interface Props {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}

/**
 * Segmented control for the four view modes. A radio group rather than four
 * buttons, so a screen reader announces "2 of 4" and arrow keys move between
 * options the way they do in a native toolbar.
 */
export default function ViewModeSwitcher({ mode, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="View mode"
      className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-700/60"
    >
      {VIEW_MODES.map(m => {
        const Icon = ICON[m];
        const active = m === mode;
        return (
          <button
            key={m}
            role="radio"
            aria-checked={active}
            aria-label={VIEW_LABEL[m]}
            title={`${VIEW_LABEL[m]} — ${VIEW_HINT[m]}`}
            onClick={() => onChange(m)}
            className={`p-1.5 rounded-md transition-colors ${
              active
                ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-blue-400'
                : 'text-slate-500 hover:text-slate-900 hover:bg-white/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60'
            }`}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </div>
  );
}
