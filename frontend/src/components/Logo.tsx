import { useState } from 'react';

interface Props {
  size?: number;
  className?: string;
}

/**
 * Brand logo. Tries `/branding/logo.png` (mounted at runtime, swappable
 * without rebuild). Falls back to a stylised "AVA" disc if absent.
 */
export default function Logo({ size = 40, className = '' }: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`rounded-full flex items-center justify-center font-extrabold text-white shadow-sm ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: size * 0.32,
          letterSpacing: '0.04em',
          background:
            'radial-gradient(circle at 30% 30%, #facc15 0%, #f59e0b 35%, #1e3a8a 100%)',
          border: `${Math.max(2, size * 0.06)}px solid #dc2626`,
        }}
        aria-label="A.V.A"
      >
        AVA
      </div>
    );
  }

  return (
    <img
      src="/branding/logo.png"
      alt="A.V.A SERVER FILES"
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`rounded-full object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
