import { Button } from "../ui/button";
import { TypeSelect } from "./TypeSelect";
import type { ParameterRow } from "./parameters";

type ParameterListProps = {
  params: ParameterRow[];
  invalidIds: Set<string>;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<ParameterRow>) => void;
  onRemove: (id: string) => void;
  autoFocusNameInputId?: string | null;
  addLabel?: string;
  emptyLabel?: string;
  containerClassName?: string;
};

export const ParameterList = ({
  params,
  invalidIds,
  onAdd,
  onUpdate,
  onRemove,
  autoFocusNameInputId,
  addLabel = "Add parameter",
  emptyLabel = "No parameters",
  containerClassName = "aspect-[21/9] w-full"
}: ParameterListProps) => (
  <div className="space-y-3">
    <div>
      <Button type="button" variant="secondary" size="sm" onClick={onAdd}>
        {addLabel}
      </Button>
    </div>

    <div
      className={`${containerClassName} overflow-y-auto rounded-md border border-border px-3 py-3`}
    >
      <div className="space-y-2">
        {params.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : null}

        {params.map((param) => {
          const isInvalid = invalidIds.has(param.id);
          return (
            <div key={param.id} className="grid grid-cols-[1fr_180px_2.5rem] gap-2">
              <input
                className="h-8 w-full rounded border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive"
                placeholder="Parameter name"
                value={param.name}
                required
                autoFocus={autoFocusNameInputId === param.id}
                aria-invalid={isInvalid}
                onChange={(event) => onUpdate(param.id, { name: event.target.value })}
              />
              <TypeSelect
                value={param.type}
                onValueChange={(value) => onUpdate(param.id, { type: value })}
                triggerClassName="h-8 w-full"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 justify-self-end"
                onClick={() => onRemove(param.id)}
              >
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
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);
