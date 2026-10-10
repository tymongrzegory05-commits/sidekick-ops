interface LogoMarkProps {
  size?: number;
  className?: string;
}

/**
 * Ikona marki Sidekicka — zaokrąglona "tarcza pomocnika" z literą S,
 * w gradiencie baby blue → głęboki błękit. Czysty SVG, więc skaluje się
 * ostro na każdym rozmiarze i działa identycznie w Light i Dark Mode.
 */
export function LogoMark({ size = 36, className = '' }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Sidekick"
    >
      <defs>
        <linearGradient id="sidekickShieldGradient" x1="24" y1="2" x2="24" y2="45" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="45%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id="sidekickShineGradient" x1="24" y1="3" x2="24" y2="19" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <filter id="sidekickShieldShadow" x="-30%" y="-20%" width="160%" height="150%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.75" floodColor="#0369a1" floodOpacity="0.4" />
        </filter>
      </defs>

      {/* Tarcza — zaokrąglony, geometryczny kształt nawiązujący do klasycznego symbolu pomocnika */}
      <g filter="url(#sidekickShieldShadow)">
        <path
          d="M24 3L37.6 9.3C38.5 9.7 39.1 10.6 39.1 11.6V21C39.1 31.9 33 39.2 24 44C15 39.2 8.9 31.9 8.9 21V11.6C8.9 10.6 9.5 9.7 10.4 9.3L24 3Z"
          fill="url(#sidekickShieldGradient)"
        />
      </g>

      {/* Subtelny połysk u góry tarczy — efekt głębi */}
      <path
        d="M24 3L37.6 9.3C38.5 9.7 39.1 10.6 39.1 11.6V17C34.5 14 29.5 12.4 24 12.4C18.5 12.4 13.5 14 8.9 17V11.6C8.9 10.6 9.5 9.7 10.4 9.3L24 3Z"
        fill="url(#sidekickShineGradient)"
      />

      {/* Litera S */}
      <text
        x="24"
        y="30.5"
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui, 'Segoe UI', Helvetica, Arial, sans-serif"
        fontWeight="800"
        fontSize="21"
        fill="white"
        style={{ paintOrder: 'stroke' }}
      >
        S
      </text>
    </svg>
  );
}

interface LogoProps {
  className?: string;
  iconSize?: number;
  subtitle?: string;
}

/** Pełne logo Sidekicka: ikona tarczy S + napis marki (i opcjonalny podtytuł). */
export function Logo({ className = '', iconSize = 36, subtitle }: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={iconSize} />
      <div className="min-w-0">
        <p className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
          Sidekick
        </p>
        {subtitle && (
          <p className="text-xs text-slate-400 dark:text-slate-500 leading-tight truncate">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
