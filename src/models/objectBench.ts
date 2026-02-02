export type ObjectField = {
  name: string;
  type: string;
  value: string;
  visibility: "public" | "protected" | "private" | "package";
  isStatic?: boolean;
  isInherited?: boolean;
};

export type ObjectInstance = {
  name: string;
  type: string;
  fields: ObjectField[];
};
