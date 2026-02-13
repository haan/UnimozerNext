import type { DiagramState } from "../../models/diagram";
import type { UmlConstructor, UmlNode } from "../../models/uml";
import { SECTION_PADDING, UML_CORNER_RADIUS } from "./constants";
import { UmlAttribute } from "./Attribute";
import { UmlMethod } from "./Method";
import type { ExportStyle } from "./UmlDiagram";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTriggerItem,
  ContextMenuTrigger
} from "../ui/context-menu";

type UmlNodeLayout = UmlNode & {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ClassProps = {
  node: UmlNodeLayout;
  diagram: DiagramState;
  compiled?: boolean;
  fontSize: number;
  headerHeight: number;
  rowHeight: number;
  rowTextBaselineOffset: number;
  headerTextBaselineY: number;
  onHeaderPointerDown: (event: React.PointerEvent<SVGRectElement>) => void;
  onCompile?: () => void;
  onRunMain?: () => void;
  onCreateObject?: (node: UmlNode, constructor: UmlConstructor) => void;
  onRemove?: () => void;
  onAddField?: () => void;
  onAddConstructor?: () => void;
  onAddMethod?: () => void;
  onFieldSelect?: (field: UmlNode["fields"][number], node: UmlNode) => void;
  onMethodSelect?: (method: UmlNode["methods"][number], node: UmlNode) => void;
  onExportPng?: (node: UmlNodeLayout, style: ExportStyle) => void;
  onCopyPng?: (node: UmlNodeLayout, style: ExportStyle) => void;
};

export const Class = ({
  node,
  diagram,
  compiled,
  fontSize,
  headerHeight,
  rowHeight,
  rowTextBaselineOffset,
  headerTextBaselineY,
  onHeaderPointerDown,
  onCompile,
  onRunMain,
  onCreateObject,
  onRemove,
  onAddField,
  onAddConstructor,
  onAddMethod,
  onFieldSelect,
  onMethodSelect,
  onExportPng,
  onCopyPng
}: ClassProps) => {
  const fields = diagram.showFields ? node.fields : [];
  const methods = diagram.showMethods ? node.methods : [];
  let cursorY = headerHeight;
  const hasMain = node.methods.some((method) => Boolean(method.isMain));
  const isCompiled = Boolean(compiled && !node.isInvalid);
  const constructorOptions: UmlConstructor[] = isCompiled
    ? node.methods
        .filter((method) => {
          if (method.name && method.name === node.name) return true;
          if (method.returnType !== undefined && method.returnType !== "") return false;
          return Boolean(method.signature?.startsWith(`${node.name}(`));
        })
        .map((method) => ({
          signature: method.signature || `${node.name}()`,
          params: method.params ?? [],
          visibility: method.visibility
        }))
    : [];
  if (isCompiled && constructorOptions.length === 0) {
    constructorOptions.push({
      signature: `${node.name}()`,
      params: [],
      visibility: "public"
    });
  }
  const strokeColor = node.isInvalid
    ? "var(--uml-class-invalid-border)"
    : isCompiled
    ? "var(--uml-class-compiled-border)"
    : "var(--uml-class-border)";
  const fillColor = node.isInvalid
    ? "var(--uml-class-invalid-bg)"
    : isCompiled
    ? "var(--uml-class-compiled-bg)"
    : "var(--uml-class-bg)";
  const content: React.ReactNode[] = [];

  if (diagram.showFields) {
    content.push(
      <line
        key={`${node.id}-fields-separator`}
        x1={0}
        x2={node.width}
        y1={headerHeight}
        y2={headerHeight}
        stroke={strokeColor}
        strokeWidth={1}
        pointerEvents="none"
      />
    );
    cursorY += SECTION_PADDING;
    fields.forEach((field, index) => {
      const baselineY = cursorY + rowTextBaselineOffset;
      content.push(
        <UmlAttribute
          key={`${node.id}-field-${field.signature}-${index}`}
          field={field}
          baselineY={baselineY}
          fontSize={fontSize}
          onSelect={onFieldSelect ? () => onFieldSelect(field, node) : undefined}
        />
      );
      cursorY += rowHeight;
    });
    cursorY += SECTION_PADDING;
  }

  if (diagram.showMethods) {
    const lineY = diagram.showFields ? cursorY : headerHeight;
    content.push(
      <line
        key={`${node.id}-methods-separator`}
        x1={0}
        x2={node.width}
        y1={lineY}
        y2={lineY}
        stroke={strokeColor}
        strokeWidth={1}
        pointerEvents="none"
      />
    );
    cursorY = lineY + SECTION_PADDING;
    methods.forEach((method, index) => {
      const baselineY = cursorY + rowTextBaselineOffset;
      content.push(
        <UmlMethod
          key={`${node.id}-method-${method.signature}-${index}`}
          method={method}
          baselineY={baselineY}
          fontSize={fontSize}
          onSelect={onMethodSelect ? () => onMethodSelect(method, node) : undefined}
        />
      );
      cursorY += rowHeight;
    });
    cursorY += SECTION_PADDING;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <g data-uml-node-id={node.id} transform={`translate(${node.x}, ${node.y})`}>
          <rect
            width={node.width}
            height={node.height}
            rx={UML_CORNER_RADIUS}
            ry={UML_CORNER_RADIUS}
            style={{ fill: fillColor, cursor: "grab" }}
            filter="url(#node-shadow)"
            onPointerDown={onHeaderPointerDown}
          />
          <rect
            width={node.width}
            height={headerHeight}
            rx={UML_CORNER_RADIUS}
            ry={UML_CORNER_RADIUS}
            style={{ fill: fillColor, cursor: "grab" }}
            pointerEvents="none"
          />
          <rect
            width={node.width}
            height={node.height}
            rx={UML_CORNER_RADIUS}
            ry={UML_CORNER_RADIUS}
            fill="none"
            style={{ stroke: strokeColor, strokeWidth: 1 }}
          />
          <text
            x={node.width / 2}
            y={headerTextBaselineY}
            textAnchor="middle"
            style={{
              fill: "hsl(var(--accent-foreground))",
              fontSize,
              fontWeight: 600,
              fontStyle: node.isAbstract ? "italic" : "normal",
              fontFamily: "var(--uml-font)",
              pointerEvents: "none"
            }}
          >
            {node.name}
          </text>
          {node.isInvalid ? (
            <g
              transform={`translate(${node.width - 18}, ${headerHeight / 2 - 7})`}
              style={{ color: "hsl(36 85% 35%)", pointerEvents: "none" }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="14"
                height="14"
              >
                <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </g>
          ) : null}

          <g>{content}</g>
        </g>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {isCompiled ? (
          constructorOptions.map((constructor) => (
            <ContextMenuItem
              key={`${node.id}-${constructor.signature}`}
              disabled={!onCreateObject}
              onSelect={() => onCreateObject?.(node, constructor)}
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
                New {constructor.signature}
              </span>
            </ContextMenuItem>
          ))
        ) : (
          <ContextMenuItem disabled={!onCompile} onSelect={onCompile}>
            <span className="inline-flex items-center gap-2">
              <svg
                width="15"
                height="15"
                viewBox="0 0 15 15"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M7.07095 0.650238C6.67391 0.650238 6.32977 0.925096 6.24198 1.31231L6.0039 2.36247C5.6249 2.47269 5.26335 2.62363 4.92436 2.81013L4.01335 2.23585C3.67748 2.02413 3.23978 2.07312 2.95903 2.35386L2.35294 2.95996C2.0722 3.2407 2.0232 3.6784 2.23493 4.01427L2.80942 4.92561C2.62307 5.2645 2.47227 5.62594 2.36216 6.00481L1.31209 6.24287C0.924883 6.33065 0.650024 6.6748 0.650024 7.07183V7.92897C0.650024 8.32601 0.924883 8.67015 1.31209 8.75794L2.36228 8.99603C2.47246 9.375 2.62335 9.73652 2.80979 10.0755L2.2354 10.9867C2.02367 11.3225 2.07267 11.7602 2.35341 12.041L2.95951 12.6471C3.24025 12.9278 3.67795 12.9768 4.01382 12.7651L4.92506 12.1907C5.26384 12.377 5.62516 12.5278 6.0039 12.6379L6.24198 13.6881C6.32977 14.0753 6.67391 14.3502 7.07095 14.3502H7.92809C8.32512 14.3502 8.66927 14.0753 8.75705 13.6881L8.99505 12.6383C9.37411 12.5282 9.73573 12.3773 10.0748 12.1909L10.986 12.7653C11.3218 12.977 11.7595 12.928 12.0403 12.6473L12.6464 12.0412C12.9271 11.7604 12.9761 11.3227 12.7644 10.9869L12.1902 10.076C12.3768 9.73688 12.5278 9.37515 12.638 8.99596L13.6879 8.75794C14.0751 8.67015 14.35 8.32601 14.35 7.92897V7.07183C14.35 6.6748 14.0751 6.33065 13.6879 6.24287L12.6381 6.00488C12.528 5.62578 12.3771 5.26414 12.1906 4.92507L12.7648 4.01407C12.9766 3.6782 12.9276 3.2405 12.6468 2.95975L12.0407 2.35366C11.76 2.07292 11.3223 2.02392 10.9864 2.23565L10.0755 2.80989C9.73622 2.62328 9.37437 2.47229 8.99505 2.36209L8.75705 1.31231C8.66927 0.925096 8.32512 0.650238 7.92809 0.650238H7.07095ZM4.92053 3.81251C5.44724 3.44339 6.05665 3.18424 6.71543 3.06839L7.07095 1.50024H7.92809L8.28355 3.06816C8.94267 3.18387 9.5524 3.44302 10.0794 3.81224L11.4397 2.9547L12.0458 3.56079L11.1882 4.92117C11.5573 5.44798 11.8164 6.0575 11.9321 6.71638L13.5 7.07183V7.92897L11.932 8.28444C11.8162 8.94342 11.557 9.55301 11.1878 10.0798L12.0453 11.4402L11.4392 12.0462L10.0787 11.1886C9.55192 11.5576 8.94241 11.8166 8.28355 11.9323L7.92809 13.5002H7.07095L6.71543 11.932C6.0569 11.8162 5.44772 11.5572 4.92116 11.1883L3.56055 12.046L2.95445 11.4399L3.81213 10.0794C3.4431 9.55266 3.18403 8.94326 3.06825 8.2845L1.50002 7.92897V7.07183L3.06818 6.71632C3.18388 6.05765 3.44283 5.44833 3.81171 4.92165L2.95398 3.561L3.56008 2.95491L4.92053 3.81251ZM9.02496 7.50008C9.02496 8.34226 8.34223 9.02499 7.50005 9.02499C6.65786 9.02499 5.97513 8.34226 5.97513 7.50008C5.97513 6.65789 6.65786 5.97516 7.50005 5.97516C8.34223 5.97516 9.02496 6.65789 9.02496 7.50008ZM9.92496 7.50008C9.92496 8.83932 8.83929 9.92499 7.50005 9.92499C6.1608 9.92499 5.07513 8.83932 5.07513 7.50008C5.07513 6.16084 6.1608 5.07516 7.50005 5.07516C8.83929 5.07516 9.92496 6.16084 9.92496 7.50008Z"
                  fill="currentColor"
                  fillRule="evenodd"
                  clipRule="evenodd"
                />
              </svg>
              Compile
            </span>
          </ContextMenuItem>
        )}
        {isCompiled && hasMain ? (
          <ContextMenuItem disabled={!onRunMain} onSelect={onRunMain}>
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
              Run main
            </span>
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!onRemove} onSelect={onRemove}>
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
            Remove Class
          </span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!onAddConstructor} onSelect={onAddConstructor}>
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Constructor
          </span>
        </ContextMenuItem>
        <ContextMenuItem disabled={!onAddField} onSelect={onAddField}>
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Field
          </span>
        </ContextMenuItem>
        <ContextMenuItem disabled={!onAddMethod} onSelect={onAddMethod}>
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Method
          </span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTriggerItem disabled={!onCopyPng}>
            <span className="inline-flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                fill="currentColor"
                viewBox="0 0 16 16"
              >
                <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1z" />
                <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0z" />
              </svg>
              Copy as PNG
            </span>
          </ContextMenuSubTriggerItem>
          <ContextMenuSubContent>
            <ContextMenuItem
              disabled={!onCopyPng}
              onSelect={() => onCopyPng?.(node, "uncompiled")}
            >
              Uncompiled
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!onCopyPng}
              onSelect={() => onCopyPng?.(node, "compiled")}
            >
              Compiled
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTriggerItem disabled={!onExportPng}>
            <span className="inline-flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                fill="currentColor"
                viewBox="0 0 17 17"
              >
                <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5" />
                <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708z" />
              </svg>
              Export as PNG
            </span>
          </ContextMenuSubTriggerItem>
          <ContextMenuSubContent>
            <ContextMenuItem
              disabled={!onExportPng}
              onSelect={() => onExportPng?.(node, "uncompiled")}
            >
              Uncompiled
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!onExportPng}
              onSelect={() => onExportPng?.(node, "compiled")}
            >
              Compiled
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  );
};
