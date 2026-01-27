export type EdgePathProps = {
  d: string;
};

export const Inheritance = ({ d }: EdgePathProps) => (
  <path
    d={d}
    fill="none"
    stroke="hsl(var(--foreground) / 0.35)"
    strokeWidth={1}
    strokeDasharray="0"
    strokeLinejoin="round"
    strokeLinecap="round"
    markerEnd="url(#edge-triangle)"
  />
);
