export type EdgePathProps = {
  d: string;
  strokeWidth?: number;
};

export const Inheritance = ({ d, strokeWidth = 1 }: EdgePathProps) => (
  <path
    d={d}
    fill="none"
    stroke="var(--uml-edge-stroke)"
    strokeWidth={strokeWidth}
    strokeDasharray="0"
    strokeLinejoin="round"
    strokeLinecap="round"
    markerEnd="url(#edge-triangle)"
  />
);
