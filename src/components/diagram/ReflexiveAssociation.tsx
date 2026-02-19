export type ReflexiveAssociationProps = {
  d: string;
  strokeWidth?: number;
};

export const ReflexiveAssociation = ({ d, strokeWidth = 1 }: ReflexiveAssociationProps) => (
  <path
    d={d}
    fill="none"
    stroke="var(--uml-edge-stroke)"
    strokeWidth={strokeWidth}
    strokeDasharray="0"
    strokeLinejoin="round"
    strokeLinecap="round"
    markerEnd="url(#edge-arrow)"
  />
);
