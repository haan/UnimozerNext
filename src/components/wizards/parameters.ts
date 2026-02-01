export type ParameterRow = {
  id: string;
  name: string;
  type: string;
};

export const createParameterRow = (): ParameterRow => ({
  id:
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `param-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  name: "",
  type: "int"
});
