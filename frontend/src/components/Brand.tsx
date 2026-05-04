import Logo from './Logo';

interface Props {
  /** "stack" centers everything (used on the login card). "row" puts logo + text inline (used in headers). */
  variant?: 'stack' | 'row';
  size?: number;
  showSubtitle?: boolean;
}

export default function Brand({ variant = 'row', size = 32, showSubtitle = true }: Props) {
  if (variant === 'stack') {
    return (
      <div className="flex flex-col items-center gap-3">
        <Logo size={size} />
        <div className="text-center">
          <h1 className="text-xl font-bold tracking-wide text-slate-900 dark:text-white">
            A.V.A <span className="text-blue-600 dark:text-blue-400">SERVER FILES</span>
          </h1>
          {showSubtitle && (
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 mt-1">
              SafirGofteman
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Logo size={size} />
      <div className="leading-tight">
        <div className="font-bold text-sm text-slate-900 dark:text-white whitespace-nowrap">
          A.V.A <span className="text-blue-600 dark:text-blue-400">SERVER FILES</span>
        </div>
        {showSubtitle && (
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            SafirGofteman
          </div>
        )}
      </div>
    </div>
  );
}
