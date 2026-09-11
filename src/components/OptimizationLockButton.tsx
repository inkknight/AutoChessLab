interface OptimizationLockButtonProps {
  label: string;
  locked: boolean;
  disabled: boolean;
  onChange: (locked: boolean) => void;
}

export function OptimizationLockButton({ label, locked, disabled, onChange }: OptimizationLockButtonProps) {
  return (
    <button
      type="button"
      className="optimization-lock"
      aria-label={`${locked ? '解锁' : '锁定'}${label}`}
      aria-pressed={locked}
      title={locked ? '已固定当前选择；点击后允许最优配置探索' : '最优配置将探索此项；点击后固定当前选择'}
      disabled={disabled}
      onClick={() => onChange(!locked)}
    >
      <svg className="lock-icon" viewBox="0 0 24 24" aria-hidden="true">
        {locked ? (
          <>
            <rect x="5" y="10" width="14" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </>
        ) : (
          <>
            <rect x="5" y="10" width="14" height="10" rx="2" />
            <path d="M9 10V7a4 4 0 0 1 7.4-2.1" />
          </>
        )}
      </svg>
      <span>{locked ? '已锁定' : '未锁定'}</span>
    </button>
  );
}
