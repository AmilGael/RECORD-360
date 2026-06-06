import type { CSSProperties } from "react";

// Monochrome line icons. Stroke uses currentColor so callers control color via
// CSS/text color. Decorative by default (aria-hidden). NO emoji anywhere in the
// app — these replace them.

export type IconProps = { size?: number; className?: string; style?: CSSProperties };

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  } as const;
}

export function Folder({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

export function Layers({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <polygon points="12 2 22 8.5 12 15 2 8.5 12 2" />
      <polyline points="2 15.5 12 22 22 15.5" />
    </svg>
  );
}

export function Branch({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <circle cx="6" cy="6" r="2.3" />
      <circle cx="6" cy="18" r="2.3" />
      <circle cx="18" cy="9" r="2.3" />
      <path d="M6 8.3v7.4" />
      <path d="M18 11.2c0 4.2-4 4-6 5.6" />
    </svg>
  );
}

export function BarChart({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <line x1="5" y1="21" x2="5" y2="13" />
      <line x1="12" y1="21" x2="12" y2="5" />
      <line x1="19" y1="21" x2="19" y2="9" />
    </svg>
  );
}

export function Sliders({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <line x1="4" y1="8" x2="20" y2="8" />
      <circle cx="9" cy="8" r="2.2" />
      <line x1="4" y1="16" x2="20" y2="16" />
      <circle cx="15" cy="16" r="2.2" />
    </svg>
  );
}

export function Pin({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z" />
      <circle cx="12" cy="11" r="2.2" />
    </svg>
  );
}

export function Search({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  );
}

export function Plus({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function Check({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <polyline points="4 12 10 18 20 6" />
    </svg>
  );
}

export function Key({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.8 12.2 20 3" />
      <path d="M16.5 6.5l3 3" />
    </svg>
  );
}

export function Pencil({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <path d="M4 20h4.5L19 9.5 14.5 5 4 15.5z" />
      <path d="M13.5 6 18 10.5" />
    </svg>
  );
}

export function MoveRight({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <path d="M4 12h14" />
      <path d="m13 7 5 5-5 5" />
      <path d="M4 6h6" />
      <path d="M4 18h6" />
    </svg>
  );
}

export function Mic({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      {/* mic body */}
      <rect x="9" y="2" width="6" height="11" rx="3" />
      {/* stand arc */}
      <path d="M5 10a7 7 0 0 0 14 0" />
      {/* stem */}
      <line x1="12" y1="17" x2="12" y2="22" />
      {/* base */}
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

export function Bell({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function ChevronRight({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function Sun({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2.5" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="21.5" />
      <line x1="2.5" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="21.5" y2="12" />
      <line x1="5.2" y1="5.2" x2="6.9" y2="6.9" />
      <line x1="17.1" y1="17.1" x2="18.8" y2="18.8" />
      <line x1="17.1" y1="6.9" x2="18.8" y2="5.2" />
      <line x1="5.2" y1="18.8" x2="6.9" y2="17.1" />
    </svg>
  );
}

export function Moon({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <path d="M20 14.4A8 8 0 1 1 9.6 4 7 7 0 1 0 20 14.4z" />
    </svg>
  );
}

export function Users({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="9" r="2.3" />
      <path d="M14.5 20a4.5 4.5 0 0 1 6 0" />
    </svg>
  );
}
