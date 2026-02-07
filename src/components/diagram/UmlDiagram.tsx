import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeImage } from "@tauri-apps/plugin-clipboard-manager";
import { Image as TauriImage } from "@tauri-apps/api/image";

import type { DiagramState } from "../../models/diagram";
import type { UmlConstructor, UmlGraph, UmlNode } from "../../models/uml";
import { basename, joinPath } from "../../services/paths";
import { Association } from "./Association";
import { Class } from "./Class";
import { Dependency } from "./Dependency";
import { Implementation } from "./Implementation";
import { Inheritance } from "./Inheritance";
import { ReflexiveAssociation } from "./ReflexiveAssociation";
import {
  NODE_WIDTH,
  SECTION_PADDING,
  TEXT_PADDING,
  UML_FONT_SIZE,
  UML_LINE_HEIGHT,
  EDGE_CORNER_GUTTER,
  EDGE_RADIUS,
  REFLEXIVE_LOOP_INSET,
  EDGE_SNAP_DELTA,
  UML_CORNER_RADIUS,
  UML_PACKAGE_PADDING,
  EXPORT_PADDING,
  EXPORT_SCALE,
  DEFAULT_VIEW_SCALE,
  DEFAULT_VIEW_X,
  DEFAULT_VIEW_Y,
  DRAG_MOVE_THRESHOLD_PX,
  FONT_MEASURE_FALLBACK_CHAR_WIDTH,
  HEADER_VERTICAL_PADDING,
  MAX_ZOOM_SCALE,
  MIN_ZOOM_SCALE,
  PACKAGE_LABEL_BASELINE_OFFSET,
  ZOOM_STEP_IN,
  ZOOM_STEP_OUT
} from "./constants";

const computeNodeHeight = (
  node: UmlNode,
  diagram: DiagramState,
  headerHeight: number,
  rowHeight: number
) => {
  const showFields = diagram.showFields;
  const showMethods = diagram.showMethods;
  let height = headerHeight;

  if (showFields) {
    height += 2 * SECTION_PADDING + node.fields.length * rowHeight;
  }
  if (showMethods) {
    height += 2 * SECTION_PADDING + node.methods.length * rowHeight;
  }

  return height;
};

const UML_FONT_FAMILY =
  "\"JetBrains Mono\", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace";
let measureCanvas: HTMLCanvasElement | null = null;
const EXPORT_CSS_VARIABLES = [
  "--foreground",
  "--accent-foreground",
  "--uml-font",
  "--uml-class-bg",
  "--uml-class-border",
  "--uml-class-invalid-bg",
  "--uml-class-invalid-border",
  "--uml-class-compiled-bg",
  "--uml-class-compiled-border",
  "--uml-package-bg",
  "--uml-package-border",
  "--uml-package-name-bg"
];

const measureTextWidth = (text: string, font: string) => {
  if (!measureCanvas) {
    measureCanvas = document.createElement("canvas");
  }
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return text.length * FONT_MEASURE_FALLBACK_CHAR_WIDTH;
  ctx.font = font;
  return ctx.measureText(text).width;
};

const computeNodeWidth = (node: UmlNode, diagram: DiagramState, fontSize: number) => {
  const padding = TEXT_PADDING;
  const nameWidth = measureTextWidth(node.name, `600 ${fontSize}px ${UML_FONT_FAMILY}`);
  const fieldWidth = diagram.showFields
    ? Math.max(
        0,
        ...node.fields.map((field) => {
          const visibility = field.visibility ? `${field.visibility} ` : "";
          return measureTextWidth(
            `${visibility}${field.signature}`,
            `${fontSize}px ${UML_FONT_FAMILY}`
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
            `${fontSize}px ${UML_FONT_FAMILY}`
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
  compiled?: boolean;
  showPackages?: boolean;
  fontSize?: number;
  backgroundColor?: string | null;
  exportDefaultPath?: string | null;
  onNodePositionChange: (id: string, x: number, y: number, commit: boolean) => void;
  onNodeSelect?: (id: string) => void;
  onCompileClass?: (node: UmlNode) => void;
  onRunMain?: (node: UmlNode) => void;
  onCreateObject?: (node: UmlNode, constructor: UmlConstructor) => void;
  onRemoveClass?: (node: UmlNode) => void;
  onAddField?: (node: UmlNode) => void;
  onAddConstructor?: (node: UmlNode) => void;
  onAddMethod?: (node: UmlNode) => void;
  onFieldSelect?: (field: UmlNode["fields"][number], node: UmlNode) => void;
  onMethodSelect?: (method: UmlNode["methods"][number], node: UmlNode) => void;
  onRegisterZoom?: (controls: ZoomControls | null) => void;
  onRegisterExport?: (controls: ExportControls | null) => void;
  onExportStatus?: (message: string) => void;
};

export type ZoomControls = {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
};

export type ExportStyle = "compiled" | "uncompiled";

export type ExportControls = {
  exportDiagramPng: (style?: ExportStyle) => void;
  exportNodePng: (nodeId: string, style?: ExportStyle) => void;
  copyDiagramPng: (style?: ExportStyle) => void;
  copyNodePng: (nodeId: string, style?: ExportStyle) => void;
};

type DragState = {
  id: string;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  moved: boolean;
};

type PackageDragState = {
  name: string;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  nodes: { id: string; x: number; y: number }[];
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
  compiled,
  showPackages,
  fontSize,
  backgroundColor,
  exportDefaultPath,
  onNodePositionChange,
  onNodeSelect,
  onCompileClass,
  onRunMain,
  onCreateObject,
  onRemoveClass,
  onAddField,
  onAddConstructor,
  onAddMethod,
  onFieldSelect,
  onMethodSelect,
  onRegisterZoom,
  onRegisterExport,
  onExportStatus
}: UmlDiagramProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [draggingPackage, setDraggingPackage] = useState<PackageDragState | null>(null);
  const [panning, setPanning] = useState<PanState | null>(null);
  const [view, setView] = useState({
    x: DEFAULT_VIEW_X,
    y: DEFAULT_VIEW_Y,
    scale: DEFAULT_VIEW_SCALE
  });
  const [fontReady, setFontReady] = useState(false);
  const umlFontSize = fontSize ?? UML_FONT_SIZE;
  const headerHeight = umlFontSize + 2 * HEADER_VERTICAL_PADDING;
  const rowHeight = Math.round(umlFontSize * UML_LINE_HEIGHT);
  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const sx =
      typeof clientX === "number" ? clientX - rect.left : rect.width / 2;
    const sy =
      typeof clientY === "number" ? clientY - rect.top : rect.height / 2;
    setView((current) => {
      const nextScale = Math.min(MAX_ZOOM_SCALE, Math.max(MIN_ZOOM_SCALE, current.scale * factor));
      const worldX = sx / current.scale - current.x;
      const worldY = sy / current.scale - current.y;
      const nextX = sx / nextScale - worldX;
      const nextY = sy / nextScale - worldY;
      return { x: nextX, y: nextY, scale: nextScale };
    });
  }, []);

  const resetZoom = useCallback(() => {
    setView({
      x: DEFAULT_VIEW_X,
      y: DEFAULT_VIEW_Y,
      scale: DEFAULT_VIEW_SCALE
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ensureFont = async () => {
      if (typeof document === "undefined" || !document.fonts) {
        if (!cancelled) setFontReady(true);
        return;
      }
      try {
        await document.fonts.load(`400 ${umlFontSize}px "JetBrains Mono"`);
        await document.fonts.load(`600 ${umlFontSize}px "JetBrains Mono"`);
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
  }, [umlFontSize]);

  useEffect(() => {
    if (!onRegisterZoom) return;
    onRegisterZoom({
      zoomIn: () => zoomAt(ZOOM_STEP_IN),
      zoomOut: () => zoomAt(ZOOM_STEP_OUT),
      resetZoom
    });
    return () => {
      onRegisterZoom(null);
    };
  }, [onRegisterZoom, resetZoom, zoomAt]);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (dragging) {
        const point = getSvgPoint(svgRef.current, event.clientX, event.clientY, view);
        const x = point.x - dragging.offsetX;
        const y = point.y - dragging.offsetY;
        const moved =
          dragging.moved ||
          Math.abs(point.x - dragging.startX) > DRAG_MOVE_THRESHOLD_PX ||
          Math.abs(point.y - dragging.startY) > DRAG_MOVE_THRESHOLD_PX;
        if (moved !== dragging.moved) {
          setDragging({ ...dragging, moved });
        }
        onNodePositionChange(dragging.id, x, y, false);
        return;
      }

      if (draggingPackage) {
        const point = getSvgPoint(svgRef.current, event.clientX, event.clientY, view);
        const dx = point.x - draggingPackage.startX;
        const dy = point.y - draggingPackage.startY;
        const moved =
          draggingPackage.moved ||
          Math.abs(point.x - draggingPackage.startX) > DRAG_MOVE_THRESHOLD_PX ||
          Math.abs(point.y - draggingPackage.startY) > DRAG_MOVE_THRESHOLD_PX;
        if (moved !== draggingPackage.moved) {
          setDraggingPackage({ ...draggingPackage, moved });
        }
        draggingPackage.nodes.forEach((node) => {
          onNodePositionChange(node.id, node.x + dx, node.y + dy, false);
        });
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
          onNodePositionChange(id, position.x, position.y, moved);
        }
        if (!moved && onNodeSelect) {
          onNodeSelect(id);
        }
      }
      if (draggingPackage) {
        const { nodes, moved } = draggingPackage;
        setDraggingPackage(null);
        nodes.forEach((node) => {
          const position = diagram.nodes[node.id];
          if (position) {
            onNodePositionChange(node.id, position.x, position.y, moved);
          }
        });
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
  }, [
    dragging,
    draggingPackage,
    panning,
    diagram.nodes,
    onNodePositionChange,
    onNodeSelect,
    view
  ]);

  const layerTransform = useMemo(
    () =>
      `matrix(${view.scale} 0 0 ${view.scale} ${view.x * view.scale} ${view.y * view.scale})`,
    [view.scale, view.x, view.y]
  );

  const nodesWithLayout = useMemo(
    () =>
      graph.nodes.map((node) => {
        const position = diagram.nodes[node.id] ?? { x: 0, y: 0 };
        return {
          ...node,
          x: position.x,
          y: position.y,
          width: fontReady ? computeNodeWidth(node, diagram, umlFontSize) : NODE_WIDTH,
          height: computeNodeHeight(node, diagram, headerHeight, rowHeight)
        };
      }),
    [diagram, graph.nodes, fontReady, headerHeight, rowHeight, umlFontSize]
  );

  const nodeMap = useMemo(() => {
    const map = new Map<string, (typeof nodesWithLayout)[number]>();
    nodesWithLayout.forEach((node) => map.set(node.id, node));
    return map;
  }, [nodesWithLayout]);

  const packages = useMemo(() => {
    if (!showPackages) return [];
    const grouped = new Map<string, (typeof nodesWithLayout)[number][]>();
    nodesWithLayout.forEach((node) => {
      const lastDot = node.id.lastIndexOf(".");
      if (lastDot <= 0) return;
      const pkg = node.id.slice(0, lastDot);
      if (!pkg) return;
      const list = grouped.get(pkg);
      if (list) {
        list.push(node);
      } else {
        grouped.set(pkg, [node]);
      }
    });
    if (grouped.size === 0) return [];
    const paddingX = UML_PACKAGE_PADDING;
    const paddingBottom = UML_PACKAGE_PADDING;
    const paddingTop = UML_PACKAGE_PADDING + headerHeight;
    return Array.from(grouped.entries()).map(([pkg, nodes]) => {
      const minX = Math.min(...nodes.map((node) => node.x));
      const minY = Math.min(...nodes.map((node) => node.y));
      const maxX = Math.max(...nodes.map((node) => node.x + node.width));
      const maxY = Math.max(...nodes.map((node) => node.y + node.height));
      return {
        name: pkg,
        nodeIds: nodes.map((node) => node.id),
        x: minX - paddingX,
        y: minY - paddingTop,
        width: maxX - minX + paddingX * 2,
        height: maxY - minY + paddingTop + paddingBottom
      };
    });
  }, [nodesWithLayout, showPackages, headerHeight]);

  const diagramBounds = useMemo(() => {
    if (nodesWithLayout.length === 0) return null;
    let minX = Math.min(...nodesWithLayout.map((node) => node.x));
    let minY = Math.min(...nodesWithLayout.map((node) => node.y));
    let maxX = Math.max(...nodesWithLayout.map((node) => node.x + node.width));
    let maxY = Math.max(...nodesWithLayout.map((node) => node.y + node.height));
    if (packages.length > 0) {
      minX = Math.min(minX, ...packages.map((pkg) => pkg.x));
      minY = Math.min(minY, ...packages.map((pkg) => pkg.y));
      maxX = Math.max(maxX, ...packages.map((pkg) => pkg.x + pkg.width));
      maxY = Math.max(maxY, ...packages.map((pkg) => pkg.y + pkg.height));
    }
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY)
    };
  }, [nodesWithLayout, packages]);

  const reportExportStatus = useCallback(
    (message: string) => {
      onExportStatus?.(message);
    },
    [onExportStatus]
  );

  const buildExportSvg = useCallback(
    (
      bounds: { minX: number; minY: number; width: number; height: number },
      nodeId?: string,
      exportStyle?: ExportStyle
    ) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
      clone.removeAttribute("class");

      clone.querySelectorAll("[data-uml-layer]").forEach((layer) => {
        layer.setAttribute("transform", "translate(0 0) scale(1)");
      });

      if (nodeId) {
        clone
          .querySelectorAll(
            '[data-uml-layer="edges"], [data-uml-layer="reflexive"], [data-uml-layer="packages"]'
          )
          .forEach((layer) => layer.remove());
        clone.querySelectorAll("[data-uml-node-id]").forEach((node) => {
          if (node.getAttribute("data-uml-node-id") !== nodeId) {
            node.remove();
          }
        });
      }

      const padding = EXPORT_PADDING;
      const minX = bounds.minX - padding;
      const minY = bounds.minY - padding;
      const width = bounds.width + padding * 2;
      const height = bounds.height + padding * 2;
      clone.setAttribute("viewBox", `${minX} ${minY} ${width} ${height}`);
      clone.setAttribute("width", `${width}`);
      clone.setAttribute("height", `${height}`);

      const rootStyles = getComputedStyle(document.documentElement);
      const getVar = (name: string) => rootStyles.getPropertyValue(name).trim();
      const variableStyles = EXPORT_CSS_VARIABLES.map((name) => {
        const value = getVar(name);
        return value ? `${name}: ${value};` : "";
      })
        .filter(Boolean)
        .join(" ");
      const overrides: string[] = [];
      if (exportStyle === "compiled") {
        const compiledBg = getVar("--uml-class-compiled-bg");
        const compiledBorder = getVar("--uml-class-compiled-border");
        if (compiledBg) overrides.push(`--uml-class-bg: ${compiledBg};`);
        if (compiledBorder) overrides.push(`--uml-class-border: ${compiledBorder};`);
      } else if (exportStyle === "uncompiled") {
        const baseBg = getVar("--uml-class-bg");
        const baseBorder = getVar("--uml-class-border");
        if (baseBg) overrides.push(`--uml-class-compiled-bg: ${baseBg};`);
        if (baseBorder) overrides.push(`--uml-class-compiled-border: ${baseBorder};`);
      }
      const exportStyleOverrides = overrides.join(" ");
      if (variableStyles) {
        const existingStyle = clone.getAttribute("style") ?? "";
        clone.setAttribute(
          "style",
          `${existingStyle} ${variableStyles} ${exportStyleOverrides}`.trim()
        );
      } else if (exportStyleOverrides) {
        clone.setAttribute("style", exportStyleOverrides.trim());
      }

      const background = backgroundColor ?? "#ffffff";
      const backgroundRect = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect"
      );
      backgroundRect.setAttribute("x", `${minX}`);
      backgroundRect.setAttribute("y", `${minY}`);
      backgroundRect.setAttribute("width", `${width}`);
      backgroundRect.setAttribute("height", `${height}`);
      backgroundRect.setAttribute("fill", background);
      clone.insertBefore(backgroundRect, clone.firstChild);

      return { svg: clone, width, height };
    },
    [backgroundColor]
  );

  const renderSvgToCanvas = useCallback(
    (svg: SVGSVGElement, width: number, height: number) =>
      new Promise<HTMLCanvasElement>((resolve, reject) => {
        const serializer = new XMLSerializer();
        const raw = serializer.serializeToString(svg);
        const blob = new Blob([raw], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const image = new Image();
        image.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(width * EXPORT_SCALE));
            canvas.height = Math.max(1, Math.round(height * EXPORT_SCALE));
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              reject(new Error("Failed to create canvas context."));
              return;
            }
            ctx.imageSmoothingEnabled = true;
            ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
            ctx.drawImage(image, 0, 0, width, height);
            resolve(canvas);
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          } finally {
            URL.revokeObjectURL(url);
          }
        };
        image.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Failed to render SVG."));
        };
        image.src = url;
      }),
    []
  );

  const renderSvgToPngDataUrl = useCallback(
    async (svg: SVGSVGElement, width: number, height: number) => {
      const canvas = await renderSvgToCanvas(svg, width, height);
      return canvas.toDataURL("image/png");
    },
    [renderSvgToCanvas]
  );

  const normalizePngPath = useCallback((path: string) => {
    if (path.toLowerCase().endsWith(".png")) return path;
    return `${path}.png`;
  }, []);

  const buildDefaultPath = useCallback(
    (fileName: string) => {
      if (!exportDefaultPath) return undefined;
      return joinPath(exportDefaultPath, fileName);
    },
    [exportDefaultPath]
  );

  const formatExportError = useCallback((error: unknown) => {
    if (typeof error === "string") return error;
    if (error instanceof Error) return error.message;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }, []);

  const exportPng = useCallback(
    async (options: {
      title: string;
      fileName: string;
      bounds: { minX: number; minY: number; width: number; height: number };
      nodeId?: string;
      style?: ExportStyle;
      successLabel: string;
    }) => {
      try {
        if (document.fonts?.ready) {
          await document.fonts.ready;
        }
        const payload = buildExportSvg(options.bounds, options.nodeId, options.style);
        if (!payload) {
          reportExportStatus("UML diagram not ready for export.");
          return;
        }

        const selection = await save({
          title: options.title,
          defaultPath: buildDefaultPath(options.fileName),
          filters: [{ name: "PNG Image", extensions: ["png"] }]
        });
        if (!selection || typeof selection !== "string") {
          reportExportStatus("Export cancelled.");
          return;
        }

        const pngDataUrl = await renderSvgToPngDataUrl(
          payload.svg,
          payload.width,
          payload.height
        );
        const base64 = pngDataUrl.split(",")[1] ?? "";
        const targetPath = normalizePngPath(selection);
        await invoke("write_binary_file", {
          path: targetPath,
          contentsBase64: base64
        });
        reportExportStatus(`${options.successLabel} ${targetPath}`);
      } catch (error) {
        reportExportStatus(`Failed to export PNG: ${formatExportError(error)}`);
      }
    },
    [
      buildDefaultPath,
      buildExportSvg,
      formatExportError,
      normalizePngPath,
      renderSvgToPngDataUrl,
      reportExportStatus
    ]
  );

  const copyPng = useCallback(
    async (options: {
      bounds: { minX: number; minY: number; width: number; height: number };
      nodeId?: string;
      style?: ExportStyle;
      successLabel: string;
    }) => {
      try {
        if (document.fonts?.ready) {
          await document.fonts.ready;
        }
        const payload = buildExportSvg(options.bounds, options.nodeId, options.style);
        if (!payload) {
          reportExportStatus("UML diagram not ready for export.");
          return;
        }
        const canvas = await renderSvgToCanvas(
          payload.svg,
          payload.width,
          payload.height
        );
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reportExportStatus("Failed to copy PNG: canvas unavailable.");
          return;
        }
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const rgba = new Uint8Array(imageData.data);
        const image = await TauriImage.new(rgba, canvas.width, canvas.height);
        await writeImage(image);
        reportExportStatus(options.successLabel);
      } catch (error) {
        reportExportStatus(`Failed to copy PNG: ${formatExportError(error)}`);
      }
    },
    [buildExportSvg, formatExportError, renderSvgToCanvas, reportExportStatus]
  );

  const exportDiagramPng = useCallback(
    async (style?: ExportStyle) => {
      if (!diagramBounds) {
        reportExportStatus("No UML diagram to export.");
        return;
      }
      const projectName = exportDefaultPath ? basename(exportDefaultPath) : "uml-diagram";
      await exportPng({
        title: "Export UML diagram as PNG",
        fileName: `${projectName}-uml.png`,
        bounds: diagramBounds,
        style,
        successLabel: "Exported diagram to"
      });
    },
    [diagramBounds, exportDefaultPath, exportPng, reportExportStatus]
  );

  const copyDiagramPng = useCallback(
    async (style?: ExportStyle) => {
      if (!diagramBounds) {
        reportExportStatus("No UML diagram to copy.");
        return;
      }
      await copyPng({
        bounds: diagramBounds,
        style,
        successLabel: "Copied diagram PNG to clipboard."
      });
    },
    [copyPng, diagramBounds, reportExportStatus]
  );

  const exportNodePng = useCallback(
    async (nodeId: string, style?: ExportStyle) => {
      const target = nodesWithLayout.find((node) => node.id === nodeId);
      if (!target) {
        reportExportStatus("Class not found for export.");
        return;
      }
      const bounds = {
        minX: target.x,
        minY: target.y,
        width: Math.max(1, target.width),
        height: Math.max(1, target.height)
      };
      await exportPng({
        title: `Export ${target.name} as PNG`,
        fileName: `${target.name}.png`,
        bounds,
        nodeId: target.id,
        style,
        successLabel: `Exported ${target.name} to`
      });
    },
    [nodesWithLayout, exportPng, reportExportStatus]
  );

  const copyNodePng = useCallback(
    async (nodeId: string, style?: ExportStyle) => {
      const target = nodesWithLayout.find((node) => node.id === nodeId);
      if (!target) {
        reportExportStatus("Class not found for export.");
        return;
      }
      const bounds = {
        minX: target.x,
        minY: target.y,
        width: Math.max(1, target.width),
        height: Math.max(1, target.height)
      };
      await copyPng({
        bounds,
        nodeId: target.id,
        style,
        successLabel: `Copied ${target.name} PNG to clipboard.`
      });
    },
    [copyPng, nodesWithLayout, reportExportStatus]
  );

  useEffect(() => {
    if (!onRegisterExport) return;
    onRegisterExport({
      exportDiagramPng,
      exportNodePng,
      copyDiagramPng,
      copyNodePng
    });
    return () => {
      onRegisterExport(null);
    };
  }, [copyDiagramPng, copyNodePng, exportDiagramPng, exportNodePng, onRegisterExport]);

  return (
    <svg
      ref={svgRef}
      className="h-full w-full select-none touch-none"
      role="img"
      onContextMenu={(event) => {
        const target = event.target as Element | null;
        if (target && target.closest("[data-uml-package]")) {
          return;
        }
        if (event.target !== svgRef.current) {
          event.stopPropagation();
        }
      }}
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
        const zoomFactor = event.deltaY > 0 ? ZOOM_STEP_OUT : ZOOM_STEP_IN;
        zoomAt(zoomFactor, event.clientX, event.clientY);
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

      <g data-uml-layer="packages" transform={layerTransform}>
        {packages.map((pkg) => {
          const labelWidth = Math.ceil(
            measureTextWidth(pkg.name, `600 ${umlFontSize}px ${UML_FONT_FAMILY}`) +
              TEXT_PADDING
          );
          return (
            <g key={pkg.name} data-uml-package>
              <rect
                x={pkg.x}
                y={pkg.y}
                width={pkg.width}
                height={pkg.height}
                rx={UML_CORNER_RADIUS}
                ry={UML_CORNER_RADIUS}
                fill="var(--uml-package-bg)"
                stroke="var(--uml-package-border)"
                strokeWidth={1}
                style={{ cursor: "grab" }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const point = getSvgPoint(svgRef.current, event.clientX, event.clientY, view);
                  const nodes = pkg.nodeIds
                    .map((id) => nodeMap.get(id))
                    .filter(Boolean)
                    .map((node) => ({ id: node!.id, x: node!.x, y: node!.y }));
                  setDraggingPackage({
                    name: pkg.name,
                    startX: point.x,
                    startY: point.y,
                    offsetX: point.x - pkg.x,
                    offsetY: point.y - pkg.y,
                    nodes,
                    moved: false
                  });
                }}
              />
              <rect
                x={pkg.x}
                y={pkg.y}
                width={labelWidth}
                height={headerHeight}
                rx={UML_CORNER_RADIUS}
                ry={UML_CORNER_RADIUS}
                fill="var(--uml-package-name-bg)"
                stroke="var(--uml-package-border)"
                strokeWidth={1}
                style={{ cursor: "grab" }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const point = getSvgPoint(svgRef.current, event.clientX, event.clientY, view);
                  const nodes = pkg.nodeIds
                    .map((id) => nodeMap.get(id))
                    .filter(Boolean)
                    .map((node) => ({ id: node!.id, x: node!.x, y: node!.y }));
                  setDraggingPackage({
                    name: pkg.name,
                    startX: point.x,
                    startY: point.y,
                    offsetX: point.x - pkg.x,
                    offsetY: point.y - pkg.y,
                    nodes,
                    moved: false
                  });
                }}
              />
              <text
                x={pkg.x + TEXT_PADDING / 2}
                y={pkg.y + headerHeight / 2 + PACKAGE_LABEL_BASELINE_OFFSET}
                textAnchor="start"
                dominantBaseline="middle"
                style={{
                  fill: "hsl(var(--foreground) / 0.8)",
                  fontSize: umlFontSize,
                  fontWeight: 600,
                  fontFamily: "var(--uml-font)"
                }}
                pointerEvents="none"
              >
                {pkg.name}
              </text>
            </g>
          );
        })}
      </g>

      <g
        data-uml-layer="edges"
        transform={layerTransform}
        pointerEvents="none"
      >
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

      <g data-uml-layer="nodes" transform={layerTransform}>
        {nodesWithLayout.map((node) => (
          <Class
            key={node.id}
            node={node}
            diagram={diagram}
            compiled={compiled}
            fontSize={umlFontSize}
            headerHeight={headerHeight}
            rowHeight={rowHeight}
            onHeaderPointerDown={(event) => {
              if (event.button !== 0) return;
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
            onCompile={() => onCompileClass?.(node)}
            onRunMain={() => onRunMain?.(node)}
            onCreateObject={onCreateObject ? (target, constructor) => onCreateObject(target, constructor) : undefined}
            onRemove={() => onRemoveClass?.(node)}
            onAddField={() => onAddField?.(node)}
            onAddConstructor={() => onAddConstructor?.(node)}
            onAddMethod={() => onAddMethod?.(node)}
            onFieldSelect={onFieldSelect}
            onMethodSelect={onMethodSelect}
            onExportPng={(target, style) => exportNodePng(target.id, style)}
            onCopyPng={(target, style) => copyNodePng(target.id, style)}
          />
        ))}
      </g>

      <g data-uml-layer="reflexive" transform={layerTransform}>
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
