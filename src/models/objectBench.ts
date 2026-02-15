export type ObjectField = {
  name: string;
  type: string;
  value: string;
  visibility: "public" | "protected" | "private" | "package";
  isStatic?: boolean;
  isInherited?: boolean;
};

export type ObjectMethod = {
  name: string;
  returnType?: string | null;
  paramTypes?: string[];
  visibility?: string;
  isStatic?: boolean;
  declaringClass?: string;
};

export type ObjectInheritedMethodGroup = {
  className: string;
  methods: ObjectMethod[];
};

export type ObjectInstance = {
  name: string;
  type: string;
  compatibleTypes?: string[];
  fields: ObjectField[];
  inheritedMethods?: ObjectInheritedMethodGroup[];
};
