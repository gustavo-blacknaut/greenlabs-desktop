import type { SVGProps } from 'react';

// Ícones em SVG inline. Ficavam no meio do main.jsx, empurrando a lógica
// da chamada 170 linhas para baixo sem nunca precisarem estar lá.

interface PropsDeIcone {
  size?: number;
}

interface PropsDoMaximizar {
  maximized?: boolean;
}

interface PropsDaEstrela extends PropsDeIcone {
  filled?: boolean;
}

// O retorno anotado nao e decoracao: sem ele o strokeLinecap vira `string`
// solto, e o SVG so aceita butt, round, square ou inherit. Era erro esperando
// acontecer em quem escrevesse 'rounded' por engano.
const iconProps = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

export const GearIcon = ({ size = 18 }: PropsDeIcone) => (
  <svg {...iconProps(size)}>
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </svg>
);

export const ExpandIcon = ({ size = 18 }: PropsDeIcone) => (
  <svg {...iconProps(size)}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
    <path d="M3 16v3a2 2 0 0 0 2 2h3" />
    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
  </svg>
);

export const ShrinkIcon = ({ size = 18 }: PropsDeIcone) => (
  <svg {...iconProps(size)}>
    <path d="M9 3v3a2 2 0 0 1-2 2H4" />
    <path d="M21 9h-3a2 2 0 0 1-2-2V4" />
    <path d="M3 15h3a2 2 0 0 1 2 2v3" />
    <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
  </svg>
);

export const EyeIcon = ({ size = 18 }: PropsDeIcone) => (
  <svg {...iconProps(size)}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const EyeOffIcon = ({ size = 18 }: PropsDeIcone) => (
  <svg {...iconProps(size)}>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.16 13.16 0 0 1-2.34 3.36" />
    <path d="M6.61 6.61C3.9 8.32 2 12 2 12s3.5 7 10 7a9.13 9.13 0 0 0 4.24-1.06" />
    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    <path d="M2 2l20 20" />
  </svg>
);

export const CameraIcon = ({ size = 18 }: PropsDeIcone) => (
  <svg {...iconProps(size)}>
    <path d="M23 7l-7 5 7 5V7Z" />
    <rect x="1" y="5" width="15" height="14" rx="2" />
  </svg>
);

export const MonitorIcon = ({ size = 18 }: PropsDeIcone) => (
  <svg {...iconProps(size)}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8" />
    <path d="M12 17v4" />
  </svg>
);

export const PlugIcon = ({ size = 18 }: PropsDeIcone) => (
  <svg {...iconProps(size)}>
    <path d="M12 22v-5" />
    <path d="M9 8V2" />
    <path d="M15 8V2" />
    <path d="M18 8v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8Z" />
  </svg>
);

export const LogOutIcon = ({ size = 18 }: PropsDeIcone) => (
  <svg {...iconProps(size)}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export const ServerIcon = ({ size = 18 }: PropsDeIcone) => (
  <svg {...iconProps(size)}>
    <rect x="2" y="3" width="20" height="7" rx="2" />
    <rect x="2" y="14" width="20" height="7" rx="2" />
    <path d="M6 7h.01" />
    <path d="M6 18h.01" />
  </svg>
);

export const UsersIcon = ({ size = 18 }: PropsDeIcone) => (
  <svg {...iconProps(size)}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 1-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const CloseIcon = ({ size = 18 }: PropsDeIcone) => (
  <svg {...iconProps(size)}>
    <path d="M18 6 6 18" />
    <path d="M6 6l12 12" />
  </svg>
);

export const PlusIcon = ({ size = 18 }: PropsDeIcone) => (
  <svg {...iconProps(size)}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

export const CheckIcon = ({ size = 16 }: PropsDeIcone) => (
  <svg {...iconProps(size)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const StarIcon = ({ size = 16, filled = false }: PropsDaEstrela) => (
  <svg {...iconProps(size)} fill={filled ? '#37ff94' : 'none'} stroke={filled ? '#37ff94' : 'currentColor'}>
    <path d="m12 2 3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2Z" />
  </svg>
);

export const RadioIcon = ({ size = 18 }: PropsDeIcone) => (
  <svg {...iconProps(size)}>
    <circle cx="12" cy="12" r="2" />
    <path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);

export const GridIcon = ({ size = 18 }: PropsDeIcone) => (
  <svg {...iconProps(size)}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

export const SingleIcon = ({ size = 18 }: PropsDeIcone) => (
  <svg {...iconProps(size)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
  </svg>
);

export const SplitIcon = ({ size = 18 }: PropsDeIcone) => (
  <svg {...iconProps(size)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M12 4v16" />
  </svg>
);

export const WinMinIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <path d="M0 5h10" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

export const WinMaxIcon = ({ maximized = false }: PropsDoMaximizar) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
    {maximized ? (
      <>
        <rect x="0.6" y="2.4" width="7" height="7" />
        <path d="M2.4 2.4V0.6h7v7H7.6" />
      </>
    ) : (
      <rect x="0.6" y="0.6" width="8.8" height="8.8" />
    )}
  </svg>
);

export const WinCloseIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

