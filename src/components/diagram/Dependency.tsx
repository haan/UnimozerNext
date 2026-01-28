export type EdgePathProps = {
  d: string;
};

export const Dependency = ({ d }: EdgePathProps) => (
  <path
    d={d}
    fill="none"
    stroke="hsl(var(--foreground) / 0.35)"
    strokeWidth={1}
    strokeDasharray="6 3"
    strokeLinejoin="round"
    strokeLinecap="round"
    markerEnd="url(#edge-arrow)"
  />
);
