export type ReflexiveCompositionProps = {
  d: string;
};

export const ReflexiveComposition = ({ d }: ReflexiveCompositionProps) => (
  <path
    d={d}
    fill="none"
    stroke="hsl(var(--foreground) / 0.35)"
    strokeWidth={1}
    strokeDasharray="6 3"
    strokeLinejoin="round"
    strokeLinecap="round"
    markerStart="url(#edge-diamond-filled)"
    markerEnd="url(#edge-arrow)"
  />
);
