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

  const nodeMap = useMemo(() => {
    const map = new Map<string, (typeof nodesWithLayout)[number]>();
    nodesWithLayout.forEach((node) => map.set(node.id, node));
    return map;
  }, [nodesWithLayout]);

  return (
    <svg ref={svgRef} className="h-full w-full" role="img">
      <defs>
        <filter id="node-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.12" />
        </filter>
        <marker
          id="edge-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--foreground) / 0.35)" />
        </marker>
        <marker
          id="edge-triangle"
          viewBox="0 0 12 12"
          refX="11"
          refY="6"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 12 6 L 0 12 z" fill="white" stroke="hsl(var(--foreground) / 0.4)" />
        </marker>
      </defs>

      <g>
        {graph.edges.map((edge) => {
          const from = nodeMap.get(edge.from);
          const to = nodeMap.get(edge.to);
          if (!from || !to) return null;
          const x1 = from.x + from.width / 2;
          const y1 = from.y + from.height / 2;
          const x2 = to.x + to.width / 2;
          const y2 = to.y + to.height / 2;
          const dx = (x2 - x1) * 0.5;
          const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
          const marker =
            edge.kind === "association" ? "url(#edge-arrow)" : "url(#edge-triangle)";
          const dash = edge.kind === "implements" ? "6 4" : "0";
          return (
            <path
              key={edge.id}
              d={path}
              fill="none"
              stroke="hsl(var(--foreground) / 0.35)"
              strokeWidth={1}
              strokeDasharray={dash}
              markerEnd={marker}
            />
          );
        })}
      </g>

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
