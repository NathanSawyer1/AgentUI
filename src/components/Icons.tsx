interface IconProps {
  name: string;
  size?: number;
  stroke?: number;
}

export function Icon({ name, size = 14, stroke = 1.6 }: IconProps) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const paths: Record<string, JSX.Element> = {
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrowUp: <><path d="M12 19V5M5 12l7-7 7 7" /></>,
    chevDown: <><path d="M6 9l6 6 6-6" /></>,
    chevRight: <><path d="M9 6l6 6-6 6" /></>,
    chevLeft: <><path d="M15 6l-6 6 6 6" /></>,
    x: <><path d="M18 6L6 18M6 6l12 12" /></>,
    terminal: <><path d="M4 17l6-6-6-6M12 19h8" /></>,
    diff: <><path d="M8 3h10v10M18 3l-7 7M16 21H6V11M6 21l7-7" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 010-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 014 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 010 4h-.1a1.6 1.6 0 00-1.5 1z" /></>,
    split: <><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M12 3v18" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
    file: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></>,
    folder: <><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></>,
    tool: <><path d="M14.7 6.3a4 4 0 105.7 5.7L22 10.3l-2-2a5 5 0 00-7.1 0l-8.1 8.2a2 2 0 000 2.8l.9.8a2 2 0 002.8 0L16.7 12" /></>,
    play: <><path d="M5 3l14 9-14 9z" /></>,
    check: <><path d="M20 6L9 17l-5-5" /></>,
    code: <><path d="M8 6l-6 6 6 6M16 6l6 6-6 6" /></>,
    cpu: <><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" /></>,
    spinner: <><path d="M12 2a10 10 0 0110 10" strokeLinecap="round" /></>,
    plug: <><path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 11-12 0zM12 18v4" /></>,
    list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>,
    layers: <><path d="M12 2l10 5-10 5L2 7l10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
    pin: <><path d="M12 17v5" /><path d="M5 17h14" /><path d="M7 3h10l-2 7 3 4H6l3-4z" /></>,
    gitBranch: <><circle cx="6" cy="3" r="2" /><circle cx="6" cy="21" r="2" /><circle cx="18" cy="8" r="2" /><path d="M6 5v14M18 10a6 6 0 01-6 6H8" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M2 12h2M20 12h2M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5" /></>,
    moon: <><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></>,
    monitor: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  };
  return <svg {...props}>{paths[name] || null}</svg>;
}
