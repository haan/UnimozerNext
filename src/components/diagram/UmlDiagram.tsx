import { useEffect, useMemo, useRef, useState } from "react";

import type { DiagramState } from "../../models/diagram";
import type { UmlGraph, UmlNode } from "../../models/uml";
import { Association } from "./Association";
import { Class } from "./Class";
import { Dependency } from "./Dependency";
import { Implementation } from "./Implementation";
import { Inheritance } from "./Inheritance";
import { ReflexiveAssociation } from "./ReflexiveAssociation";
import {
  HEADER_HEIGHT,
  NODE_WIDTH,
  ROW_HEIGHT,
  SECTION_PADDING,
  TEXT_PADDING,
  UML_FONT_SIZE,
  EDGE_CORNER_GUTTER,
  EDGE_RADIUS,
  REFLEXIVE_LOOP_INSET,
  EDGE_SNAP_DELTA
} from "./constants";

const computeNodeHeight = (node: UmlNode, diagram: DiagramState) => {
  const showFields = diagram.showFields && node.fields.length > 0;
  const showMethods = diagram.showMethods && node.methods.length > 0;
  let height = HEADER_HEIGHT;

  if (showFields) {
    height += 2*SECTION_PADDING + (node.fields.length) * ROW_HEIGHT;
  }
  if (showMethods) {
    height += 2*SECTION_PADDING + (node.methods.length) * ROW_HEIGHT;
  }

  return height;
};

const UML_FONT_FAMILY =
  "\"JetBrains Mono\", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace";
let measureCanvas: HTMLCanvasElement | null = null;

const measureTextWidth = (text: string, font: string) => {
  if (!measureCanvas) {
    measureCanvas = document.createElement("canvas");
  }
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return text.length * 8;
  ctx.font = font;
  return ctx.measureText(text).width;
};

const computeNodeWidth = (node: UmlNode, diagram: DiagramState) => {
  const padding = TEXT_PADDING;
  const nameWidth = measureTextWidth(node.name, `600 ${UML_FONT_SIZE}px ${UML_FONT_FAMILY}`);
  const fieldWidth = diagram.showFields
    ? Math.max(
        0,
        ...node.fields.map((field) => {
          const visibility = field.visibility ? `${field.visibility} ` : "";
          return measureTextWidth(
            `${visibility}${field.signature}`,
            `${UML_FONT_SIZE}px ${UML_FONT_FAMILY}`
          );
        })
      )
    : 0;
  const methodWidth = diagram.showMethods
    ? Math.max(
        0,
        ...node.methods.map((method) => {
          const visibility = method.visibility ? `${method.visibility} ` : "";
          return measureTextWidth(
            `${visibility}${method.signature}`,
            `${UML_FONT_SIZE}px ${UML_FONT_FAMILY}`
          );
        })
      )
    : 0;

  const contentWidth = Math.max(nameWidth, fieldWidth, methodWidth);
  return Math.max(NODE_WIDTH, Math.ceil(contentWidth + padding * 2));
};

const getSvgPoint = (
  svg: SVGSVGElement | null,
  clientX: number,
  clientY: number,
  view: { x: number; y: number; scale: number }
) => {
  if (!svg) return { x: clientX, y: clientY };
  const rect = svg.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  return {
    x: x / view.scale - view.x,
    y: y / view.scale - view.y
  };
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const getEdgeGutter = (rect: { width: number; height: number }) =>
  Math.max(0, Math.min(rect.width / 2 - 2, rect.height / 2 - 2, EDGE_CORNER_GUTTER));

const getRectEdgeAnchor = (
  rect: { x: number; y: number; width: number; height: number },
  target: { x: number; y: number }
) => {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  if (dx === 0 && dy === 0) {
    return { x: cx, y: cy, normal: { x: 0, y: 0 } };
  }

  const maxGutter = getEdgeGutter(rect);
  const preferHorizontal = Math.abs(dx) >= Math.abs(dy);
  if (preferHorizontal && dx !== 0) {
    const sideX = dx > 0 ? rect.x + rect.width : rect.x;
    const t = (sideX - cx) / dx;
    const y = clamp(
      cy + dy * t,
      rect.y + maxGutter,
      rect.y + rect.height - maxGutter
    );
    return { x: sideX, y, normal: { x: Math.sign(dx) || 1, y: 0 } };
  }

  const sideY = dy > 0 ? rect.y + rect.height : rect.y;
  const t = dy === 0 ? 0 : (sideY - cy) / dy;
  const x = clamp(
    cx + dx * t,
    rect.x + maxGutter,
    rect.x + rect.width - maxGutter
  );
  return { x, y: sideY, normal: { x: 0, y: Math.sign(dy) || 1 } };
};

const buildOrthogonalPath = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  startNormal: { x: number; y: number },
  endNormal: { x: number; y: number }
) => {
  const s1 = { x: start.x + startNormal.x, y: start.y + startNormal.y };
  const s2 = { x: end.x + endNormal.x, y: end.y + endNormal.y };
  const dx = s2.x - s1.x;
  const dy = s2.y - s1.y;

  if (Math.abs(dx) < 1 || Math.abs(dy) < 1) {
    return `M ${start.x} ${start.y} L ${s1.x} ${s1.y} L ${s2.x} ${s2.y} L ${end.x} ${end.y}`;
  }

  const radius = EDGE_RADIUS;
  const r = Math.min(radius, Math.abs(dx) / 2, Math.abs(dy) / 2);
  const sx = Math.sign(dx) || 1;
  const sy = Math.sign(dy) || 1;

  if (startNormal.x !== 0) {
    const midX = s1.x + dx / 2;
    const x1a = midX - sx * r;
    const x2a = midX + sx * r;
    const y1a = s1.y + sy * r;
    const y2a = s2.y - sy * r;
    return `M ${start.x} ${start.y} L ${s1.x} ${s1.y} L ${x1a} ${s1.y} Q ${midX} ${s1.y} ${midX} ${y1a} L ${midX} ${y2a} Q ${midX} ${s2.y} ${x2a} ${s2.y} L ${s2.x} ${s2.y} L ${end.x} ${end.y}`;
  }

  const midY = s1.y + dy / 2;
  const y1a = midY - sy * r;
  const y2a = midY + sy * r;
  const x1a = s1.x + sx * r;
  const x2a = s2.x - sx * r;
  return `M ${start.x} ${start.y} L ${s1.x} ${s1.y} L ${s1.x} ${y1a} Q ${s1.x} ${midY} ${x1a} ${midY} L ${x2a} ${midY} Q ${s2.x} ${midY} ${s2.x} ${y2a} L ${s2.x} ${s2.y} L ${end.x} ${end.y}`;
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

type PanState = {
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  scale: number;
};

export const UmlDiagram = ({
  graph,
  diagram,
  onNodePositionChange,
  onNodeSelect
}: UmlDiagramProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [panning, setPanning] = useState<PanState | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [fontReady, setFontReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ensureFont = async () => {
      if (typeof document === "undefined" || !document.fonts) {
        if (!cancelled) setFontReady(true);
        return;
      }
      try {
        await document.fonts.load(`400 ${UML_FONT_SIZE}px "JetBrains Mono"`);
        await document.fonts.load(`600 ${UML_FONT_SIZE}px "JetBrains Mono"`);
        await document.fonts.ready;
      } catch {
        // If font loading fails, we still want a layout pass.
      }
      if (!cancelled) setFontReady(true);
    };
    void ensureFont();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (dragging) {
        const point = getSvgPoint(svgRef.current, event.clientX, event.clientY, view);
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
        return;
      }

      if (panning) {
        const dx = (event.clientX - panning.startClientX) / panning.scale;
        const dy = (event.clientY - panning.startClientY) / panning.scale;
        setView((current) => ({
          ...current,
          x: panning.startX + dx,
          y: panning.startY + dy
        }));
      }
    };

    const handleUp = () => {
      if (dragging) {
        const { id, moved } = dragging;
        setDragging(null);
        const position = diagram.nodes[id];
        if (position) {
          onNodePositionChange(id, position.x, position.y, true);
        }
        if (!moved && onNodeSelect) {
          onNodeSelect(id);
        }
      }
      if (panning) {
        setPanning(null);
      }
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragging, panning, diagram.nodes, onNodePositionChange, onNodeSelect, view]);

  const nodesWithLayout = useMemo(
    () =>
      graph.nodes.map((node) => {
        const position = diagram.nodes[node.id] ?? { x: 0, y: 0 };
        return {
          ...node,
          x: position.x,
          y: position.y,
          width: fontReady ? computeNodeWidth(node, diagram) : NODE_WIDTH,
          height: computeNodeHeight(node, diagram)
        };
      }),
    [diagram, graph.nodes, fontReady]
  );

  const nodeMap = useMemo(() => {
    const map = new Map<string, (typeof nodesWithLayout)[number]>();
    nodesWithLayout.forEach((node) => map.set(node.id, node));
    return map;
  }, [nodesWithLayout]);

  return (
    <svg
      ref={svgRef}
      className="h-full w-full select-none touch-none"
      role="img"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        if (event.target !== svgRef.current) return;
        event.preventDefault();
        setPanning({
          startClientX: event.clientX,
          startClientY: event.clientY,
          startX: view.x,
          startY: view.y,
          scale: view.scale
        });
      }}
      onWheel={(event) => {
        event.preventDefault();
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const sx = event.clientX - rect.left;
        const sy = event.clientY - rect.top;
        const worldX = sx / view.scale - view.x;
        const worldY = sy / view.scale - view.y;
        const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
        const nextScale = Math.min(2.5, Math.max(0.4, view.scale * zoomFactor));
        const nextX = sx / nextScale - worldX;
        const nextY = sy / nextScale - worldY;
        setView({ x: nextX, y: nextY, scale: nextScale });
      }}
    >
      <defs>
        <filter id="node-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.12" />
        </filter>
        <marker
          id="edge-arrow"
          viewBox="0 0 12 12"
          refX="11"
          refY="6"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path
            d="M 0 0 L 12 6 L 0 12"
            fill="none"
            stroke="hsl(var(--foreground) / 0.5)"
            strokeWidth={1.2}
          />
        </marker>
        <marker
          id="edge-triangle"
          viewBox="0 0 18 18"
          refX="17"
          refY="9"
          markerWidth="12"
          markerHeight="12"
          orient="auto-start-reverse"
        >
          <path
            d="M 0 0 L 18 9 L 0 18 z"
            fill="white"
            stroke="hsl(var(--foreground) / 0.4)"
            strokeWidth={1.8}
          />
        </marker>
      </defs>

      <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`} pointerEvents="none">
        {graph.edges
          .filter((edge) => edge.kind !== "reflexive-association")
          .map((edge) => {
          const from = nodeMap.get(edge.from);
          const to = nodeMap.get(edge.to);
          if (!from || !to) return null;
          const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
          const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
          const dx = toCenter.x - fromCenter.x;
          const dy = toCenter.y - fromCenter.y;
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);
          const snapHorizontal = absDy <= EDGE_SNAP_DELTA && absDy <= absDx;
          const snapVertical = !snapHorizontal && absDx <= EDGE_SNAP_DELTA;
          let start = getRectEdgeAnchor(from, toCenter);
          let end = getRectEdgeAnchor(to, fromCenter);

          if (snapHorizontal) {
            const fromGutter = getEdgeGutter(from);
            const toGutter = getEdgeGutter(to);
            const yMin = Math.max(from.y + fromGutter, to.y + toGutter);
            const yMax = Math.min(
              from.y + from.height - fromGutter,
              to.y + to.height - toGutter
            );
            if (yMin <= yMax) {
              const y = clamp((fromCenter.y + toCenter.y) / 2, yMin, yMax);
              const startX = dx >= 0 ? from.x + from.width : from.x;
              const endX = dx >= 0 ? to.x : to.x + to.width;
              start = { x: startX, y, normal: { x: dx >= 0 ? 1 : -1, y: 0 } };
              end = { x: endX, y, normal: { x: dx >= 0 ? -1 : 1, y: 0 } };
            }
          } else if (snapVertical) {
            const fromGutter = getEdgeGutter(from);
            const toGutter = getEdgeGutter(to);
            const xMin = Math.max(from.x + fromGutter, to.x + toGutter);
            const xMax = Math.min(
              from.x + from.width - fromGutter,
              to.x + to.width - toGutter
            );
            if (xMin <= xMax) {
              const x = clamp((fromCenter.x + toCenter.x) / 2, xMin, xMax);
              const startY = dy >= 0 ? from.y + from.height : from.y;
              const endY = dy >= 0 ? to.y : to.y + to.height;
              start = { x, y: startY, normal: { x: 0, y: dy >= 0 ? 1 : -1 } };
              end = { x, y: endY, normal: { x: 0, y: dy >= 0 ? -1 : 1 } };
            }
          }
          const path =
            edge.kind === "extends"
              ? `M ${start.x} ${start.y} L ${end.x} ${end.y}`
              : buildOrthogonalPath(start, end, start.normal, end.normal);
          if (edge.kind === "association") {
            return <Association key={edge.id} d={path} />;
          }
          if (edge.kind === "dependency") {
            return <Dependency key={edge.id} d={path} />;
          }
          if (edge.kind === "extends") {
            return <Inheritance key={edge.id} d={path} />;
          }
          if (edge.kind === "implements") {
            return <Implementation key={edge.id} d={path} />;
          }

          return (
            <path
              key={edge.id}
              d={path}
              fill="none"
              stroke="hsl(var(--foreground) / 0.35)"
              strokeWidth={1}
              strokeDasharray="6 3"
              strokeLinejoin="round"
              strokeLinecap="round"
              markerEnd="url(#edge-arrow)"
            />
          );
        })}
      </g>

      <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
        {nodesWithLayout.map((node) => (
          <Class
            key={node.id}
            node={node}
            diagram={diagram}
            onHeaderPointerDown={(event) => {
              event.preventDefault();
              const point = getSvgPoint(svgRef.current, event.clientX, event.clientY, view);
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

        {graph.edges
          .filter((edge) => edge.kind === "reflexive-association")
          .map((edge) => {
            const from = nodeMap.get(edge.from);
            if (!from) return null;
            const loopInset = REFLEXIVE_LOOP_INSET;
            const startX = from.x + from.width / 2;
            const startY = from.y;
            const cornerX = from.x + from.width + loopInset;
            const cornerY = from.y - loopInset;
            const endX = from.x + from.width;
            const endY = from.y + from.height / 2;
            const d = `M ${startX} ${startY} L ${startX} ${cornerY} L ${cornerX} ${cornerY} L ${cornerX} ${endY} L ${endX} ${endY}`;
            return <ReflexiveAssociation key={edge.id} d={d} />;
          })}
      </g>
    </svg>
  );
};
