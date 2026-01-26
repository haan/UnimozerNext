import { useEffect, useMemo, useRef, useState } from "react";

import type { DiagramState } from "../../models/diagram";
import type { UmlGraph, UmlNode } from "../../models/uml";
import { ClassNode } from "./ClassNode";
import { HEADER_HEIGHT, NODE_WIDTH, ROW_HEIGHT, SECTION_PADDING } from "./constants";

const computeNodeHeight = (node: UmlNode, diagram: DiagramState) => {
  const showFields = diagram.showFields && node.fields.length > 0;
  const showMethods = diagram.showMethods && node.methods.length > 0;
  let height = HEADER_HEIGHT;

  if (showFields) {
    height += SECTION_PADDING + node.fields.length * ROW_HEIGHT;
  }
  if (showMethods) {
    height += SECTION_PADDING + node.methods.length * ROW_HEIGHT;
  }

  return height;
};

const getSvgPoint = (svg: SVGSVGElement | null, clientX: number, clientY: number) => {
  if (!svg) return { x: clientX, y: clientY };
  const rect = svg.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
};

export type UmlDiagramProps = {
  graph: UmlGraph;
  diagram: DiagramState;
  onNodePositionChange: (id: string, x: number, y: number, commit: boolean) => void;
  onNodeSelect?: (id: string) => void;
};

type DragState = {
  id: string;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  moved: boolean;
};

export const UmlDiagram = ({
  graph,
  diagram,
  onNodePositionChange,
  onNodeSelect
}: UmlDiagramProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragging, setDragging] = useState<DragState | null>(null);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (!dragging) return;
      const point = getSvgPoint(svgRef.current, event.clientX, event.clientY);
      const x = point.x - dragging.offsetX;
      const y = point.y - dragging.offsetY;
      const moved =
        dragging.moved ||
        Math.abs(point.x - dragging.startX) > 3 ||
        Math.abs(point.y - dragging.startY) > 3;
      if (moved !== dragging.moved) {
        setDragging({ ...dragging, moved });
      }
      onNodePositionChange(dragging.id, x, y, false);
    };

    const handleUp = () => {
      if (!dragging) return;
      const { id, moved } = dragging;
      setDragging(null);
      const position = diagram.nodes[id];
      if (position) {
        onNodePositionChange(id, position.x, position.y, true);
      }
      if (!moved && onNodeSelect) {
        onNodeSelect(id);
      }
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragging, diagram.nodes, onNodePositionChange]);

  const nodesWithLayout = useMemo(
    () =>
      graph.nodes.map((node) => {
        const position = diagram.nodes[node.id] ?? { x: 0, y: 0 };
        return {
          ...node,
          x: position.x,
          y: position.y,
          width: NODE_WIDTH,
          height: computeNodeHeight(node, diagram)
        };
      }),
    [diagram, graph.nodes]
  );

  return (
    <svg ref={svgRef} className="h-full w-full" role="img">
      <defs>
        <filter id="node-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.12" />
        </filter>
      </defs>

      {nodesWithLayout.map((node) => (
        <ClassNode
          key={node.id}
          node={node}
          diagram={diagram}
          onHeaderPointerDown={(event) => {
            event.preventDefault();
            const point = getSvgPoint(svgRef.current, event.clientX, event.clientY);
            setDragging({
              id: node.id,
              offsetX: point.x - node.x,
              offsetY: point.y - node.y,
              startX: point.x,
              startY: point.y,
              moved: false
            });
          }}
        />
      ))}
    </svg>
  );
};
