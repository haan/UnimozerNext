export type EdgePathProps = {
  d: string;
  strokeWidth?: number;
};

export const Implementation = ({ d, strokeWidth = 1 }: EdgePathProps) => (
  <path
    d={d}
    fill="none"
    stroke="var(--uml-edge-stroke)"
    strokeWidth={strokeWidth}
    strokeDasharray="6 4"
    strokeLinejoin="round"
    strokeLinecap="round"
    markerEnd="url(#edge-triangle)"
  />
);
