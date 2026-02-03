import type { ObjectInstance } from "../../models/objectBench";
import type { UmlMethod } from "../../models/uml";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from "../ui/context-menu";

type ObjectBenchPanelProps = {
  objects: ObjectInstance[];
  showPrivate: boolean;
  showInherited: boolean;
  showStatic: boolean;
  getMethodsForObject?: (object: ObjectInstance) => UmlMethod[];
  onCallMethod?: (object: ObjectInstance, method: UmlMethod) => void;
  onRemoveObject?: (object: ObjectInstance) => void;
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
  showStatic,
  getMethodsForObject,
  onCallMethod,
  onRemoveObject
}: ObjectBenchPanelProps) => {
  return (
    <div className="flex h-full flex-col bg-muted/30">
      <div className="flex-1 overflow-auto p-3">
        {objects.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No objects yet. Right-click a compiled class to create one.
          </div>
        ) : (
            <div className="flex flex-wrap items-start gap-3">
              {objects.map((object) => {
                const methods = getMethodsForObject?.(object) ?? [];
                return (
                  <ContextMenu key={object.name}>
                    <ContextMenuTrigger asChild>
                      <div
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
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      {methods.length > 0 ? (
                        methods.map((method) => (
                          <ContextMenuItem
                            key={`${object.name}-${method.signature}`}
                            disabled={!onCallMethod}
                            onSelect={() => onCallMethod?.(object, method)}
                          >
                            <span className="inline-flex items-center gap-2">
                              <svg
                                width="15"
                                height="15"
                                viewBox="0 0 15 15"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <path
                                  d="M3.24182 2.32181C3.3919 2.23132 3.5784 2.22601 3.73338 2.30781L12.7334 7.05781C12.8974 7.14436 13 7.31457 13 7.5C13 7.68543 12.8974 7.85564 12.7334 7.94219L3.73338 12.6922C3.5784 12.774 3.3919 12.7687 3.24182 12.6782C3.09175 12.5877 3 12.4252 3 12.25V2.75C3 2.57476 3.09175 2.4123 3.24182 2.32181ZM4 3.57925V11.4207L11.4288 7.5L4 3.57925Z"
                                  fill="currentColor"
                                  fillRule="evenodd"
                                  clipRule="evenodd"
                                />
                              </svg>
                              {method.signature}
                            </span>
                          </ContextMenuItem>
                        ))
                      ) : (
                        <ContextMenuItem disabled>
                          No public methods
                        </ContextMenuItem>
                      )}
                      {methods.length > 0 ? <ContextMenuSeparator /> : null}
                      <ContextMenuItem
                        disabled={!onRemoveObject}
                        onSelect={() => onRemoveObject?.(object)}
                      >
                        <span className="inline-flex items-center gap-2">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth="1.5"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                            />
                          </svg>
                          Remove object
                        </span>
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
};
