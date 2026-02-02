import type { ObjectInstance } from "../../models/objectBench";

type ObjectBenchPanelProps = {
  objects: ObjectInstance[];
  showPrivate: boolean;
  showInherited: boolean;
  showStatic: boolean;
};

const shouldShowField = (
  visibility: ObjectInstance["fields"][number]["visibility"],
  showPrivate: boolean,
  isInherited: boolean | undefined,
  showInherited: boolean,
  isStatic: boolean | undefined,
  showStatic: boolean
) => {
  if (!showPrivate && visibility === "private") return false;
  if (!showInherited && isInherited) return false;
  if (!showStatic && isStatic) return false;
  return true;
};

export const ObjectBenchPanel = ({
  objects,
  showPrivate,
  showInherited,
  showStatic
}: ObjectBenchPanelProps) => {
  return (
    <div className="flex h-full flex-col bg-muted/30">
      <div className="flex-1 overflow-auto p-3">
        {objects.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No objects yet. Right-click a compiled class to create one.
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {objects.map((object) => (
              <div
                key={object.name}
                className="min-w-[220px] rounded-md border border-border bg-background/80 shadow-sm"
                style={{
                  backgroundColor: "hsl(var(--objectbench-card-bg))",
                  borderColor: "hsl(var(--objectbench-card-border))"
                }}
              >
                <div
                  className="border-b px-3 py-2 text-sm font-semibold"
                  style={{ borderColor: "hsl(var(--objectbench-card-border))" }}
                >
                  {object.name}: {object.type}
                </div>
                <div className="space-y-1 px-3 py-2 text-xs text-muted-foreground">
                  {object.fields
                    .filter((field) =>
                      shouldShowField(
                        field.visibility,
                        showPrivate,
                        field.isInherited,
                        showInherited,
                        field.isStatic,
                        showStatic
                      )
                    )
                    .map((field) => (
                      <div key={`${object.name}-${field.name}`} className="flex gap-2">
                        <span className="font-medium text-foreground">
                          {field.name}
                        </span>
                        <span>=</span>
                        <span className="truncate">{field.value}</span>
                      </div>
                    ))}
                  {object.fields.filter((field) =>
                    shouldShowField(
                      field.visibility,
                      showPrivate,
                      field.isInherited,
                      showInherited,
                      field.isStatic,
                      showStatic
                    )
                  ).length === 0 ? (
                    <div className="text-muted-foreground">No visible fields.</div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
