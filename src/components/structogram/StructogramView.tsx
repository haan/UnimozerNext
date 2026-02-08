import { invoke } from "@tauri-apps/api/core";
import { Image as TauriImage } from "@tauri-apps/api/image";
import { save } from "@tauri-apps/plugin-dialog";
import { writeImage } from "@tauri-apps/plugin-clipboard-manager";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { basename, joinPath } from "../../services/paths";
import type { UmlMethod } from "../../models/uml";
import {
  STRUCTOGRAM_CANVAS_PADDING,
  STRUCTOGRAM_CHAR_WIDTH,
  STRUCTOGRAM_COLORS,
  STRUCTOGRAM_EXPORT_PADDING,
  STRUCTOGRAM_EXPORT_SCALE,
  STRUCTOGRAM_FONT_SIZE,
  STRUCTOGRAM_HEADER_BOTTOM_PADDING,
  STRUCTOGRAM_HEADER_TOP_PADDING,
  STRUCTOGRAM_MONOCHROME_COLORS,
  STRUCTOGRAM_SVG_STROKE_WIDTH,
  STRUCTOGRAM_TEXT_PADDING_X,
  STRUCTOGRAM_VIEWPORT_PADDING
} from "./constants";
import { buildStructogramLayout, toMethodDeclaration } from "./layoutBuilder";
import { renderStructogramNode } from "./renderTree";

export type StructogramExportControls = {
  exportStructogramPng: () => void;
  copyStructogramPng: () => void;
};

type StructogramViewProps = {
  method: UmlMethod;
  fontSize?: number;
  colorsEnabled?: boolean;
  exportDefaultPath?: string | null;
  onExportStatus?: (message: string) => void;
  onRegisterExport?: (controls: StructogramExportControls | null) => void;
};

const EXPORT_CSS_VARIABLES = [
  "--background",
  "--foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--structogram-loop-header",
  "--structogram-if-header",
  "--structogram-switch-header",
  "--uml-font"
];

const sanitizeFileName = (value: string) =>
  value
    .trim()
    .replace(/[<>:"/\\|?*]/g, "_")
    .split("")
    .map((ch) => (ch.charCodeAt(0) < 32 ? "_" : ch))
    .join("")
    .replace(/\s+/g, "-")
    .replace(/_+/g, "_")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "") || "structogram";

const normalizePngPath = (path: string) => (path.toLowerCase().endsWith(".png") ? path : `${path}.png`);

const resolveExportDirectory = (path: string) => {
  const normalized = path.replace(/[\\/]+$/, "");
  if (!normalized.toLowerCase().endsWith(".umz")) {
    return normalized;
  }
  const separatorIndex = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
  if (separatorIndex < 0) {
    return normalized;
  }
  const parent = normalized.slice(0, separatorIndex);
  return parent.length > 0 ? parent : normalized;
};

export const StructogramView = ({
  method,
  fontSize,
  colorsEnabled = true,
  exportDefaultPath,
  onExportStatus,
  onRegisterExport
}: StructogramViewProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const layout = useMemo(() => buildStructogramLayout(method.controlTree), [method.controlTree]);
  const declaration = useMemo(() => toMethodDeclaration(method), [method]);
  const palette = colorsEnabled ? STRUCTOGRAM_COLORS : STRUCTOGRAM_MONOCHROME_COLORS;
  const resolvedFontSize =
    typeof fontSize === "number" && Number.isFinite(fontSize) && fontSize > 0
      ? fontSize
      : STRUCTOGRAM_FONT_SIZE;
  const fontScale = resolvedFontSize / STRUCTOGRAM_FONT_SIZE;
  const renderMetrics = useMemo(() => {
    if (!layout) return null;
    const signatureWidthEstimate =
      declaration.length * STRUCTOGRAM_CHAR_WIDTH + STRUCTOGRAM_TEXT_PADDING_X * 2;
    const contentWidth = Math.max(layout.width, Math.ceil(signatureWidthEstimate));
    const signatureRowHeight =
      STRUCTOGRAM_HEADER_TOP_PADDING + STRUCTOGRAM_FONT_SIZE + STRUCTOGRAM_HEADER_BOTTOM_PADDING;
    const structogramTopY = STRUCTOGRAM_CANVAS_PADDING + signatureRowHeight;
    const signatureTextY =
      STRUCTOGRAM_CANVAS_PADDING + STRUCTOGRAM_HEADER_TOP_PADDING + STRUCTOGRAM_FONT_SIZE;
    const svgWidth = contentWidth + STRUCTOGRAM_CANVAS_PADDING * 2;
    const svgHeight = structogramTopY + layout.height + STRUCTOGRAM_CANVAS_PADDING;
    return {
      contentWidth,
      structogramTopY,
      signatureTextY,
      svgWidth,
      svgHeight
    };
  }, [declaration, layout]);

  const reportExportStatus = useCallback(
    (message: string) => {
      onExportStatus?.(message);
    },
    [onExportStatus]
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

  const buildDefaultPath = useCallback(
    (fileName: string) => {
      if (!exportDefaultPath) return undefined;
      return joinPath(resolveExportDirectory(exportDefaultPath), fileName);
    },
    [exportDefaultPath]
  );

  const buildExportSvg = useCallback(() => {
    if (!renderMetrics) return null;
    const svg = svgRef.current;
    if (!svg) return null;

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    clone.removeAttribute("class");

    const rootStyles = getComputedStyle(document.documentElement);
    const variableStyles = EXPORT_CSS_VARIABLES.map((name) => {
      const value = rootStyles.getPropertyValue(name).trim();
      return value ? `${name}: ${value};` : "";
    })
      .filter(Boolean)
      .join(" ");
    if (variableStyles) {
      const existingStyle = clone.getAttribute("style") ?? "";
      clone.setAttribute("style", `${existingStyle} ${variableStyles}`.trim());
    }

    const minX = -STRUCTOGRAM_EXPORT_PADDING;
    const minY = -STRUCTOGRAM_EXPORT_PADDING;
    const width = renderMetrics.svgWidth + STRUCTOGRAM_EXPORT_PADDING * 2;
    const height = renderMetrics.svgHeight + STRUCTOGRAM_EXPORT_PADDING * 2;

    clone.setAttribute("viewBox", `${minX} ${minY} ${width} ${height}`);
    clone.setAttribute("width", `${width}`);
    clone.setAttribute("height", `${height}`);

    const backgroundRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    backgroundRect.setAttribute("x", `${minX}`);
    backgroundRect.setAttribute("y", `${minY}`);
    backgroundRect.setAttribute("width", `${width}`);
    backgroundRect.setAttribute("height", `${height}`);
    backgroundRect.setAttribute("fill", palette.body);
    clone.insertBefore(backgroundRect, clone.firstChild);

    return { svg: clone, width, height };
  }, [palette.body, renderMetrics]);

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
            canvas.width = Math.max(1, Math.round(width * STRUCTOGRAM_EXPORT_SCALE));
            canvas.height = Math.max(1, Math.round(height * STRUCTOGRAM_EXPORT_SCALE));
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              reject(new Error("Failed to create canvas context."));
              return;
            }
            ctx.imageSmoothingEnabled = true;
            ctx.scale(STRUCTOGRAM_EXPORT_SCALE, STRUCTOGRAM_EXPORT_SCALE);
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
          reject(new Error("Failed to render structogram SVG."));
        };
        image.src = url;
      }),
    []
  );

  const methodFileNamePart = useMemo(
    () => sanitizeFileName(method.name?.trim() || declaration || "structogram"),
    [declaration, method.name]
  );

  const exportStructogramPng = useCallback(async () => {
    try {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      const payload = buildExportSvg();
      if (!payload) {
        reportExportStatus("Structogram is not ready for export.");
        return;
      }

      const projectName = exportDefaultPath
        ? sanitizeFileName(basename(exportDefaultPath).replace(/\.umz$/i, ""))
        : "structogram";
      const selection = await save({
        title: "Export structogram as PNG",
        defaultPath: buildDefaultPath(`${projectName}-${methodFileNamePart}-structogram.png`),
        filters: [{ name: "PNG Image", extensions: ["png"] }]
      });
      if (!selection || typeof selection !== "string") {
        reportExportStatus("Export cancelled.");
        return;
      }

      const canvas = await renderSvgToCanvas(payload.svg, payload.width, payload.height);
      const pngDataUrl = canvas.toDataURL("image/png");
      const base64 = pngDataUrl.split(",")[1] ?? "";
      const targetPath = normalizePngPath(selection);
      await invoke("write_binary_file", {
        path: targetPath,
        contentsBase64: base64
      });
      reportExportStatus(`Exported structogram to ${targetPath}`);
    } catch (error) {
      reportExportStatus(`Failed to export structogram PNG: ${formatExportError(error)}`);
    }
  }, [
    buildDefaultPath,
    buildExportSvg,
    exportDefaultPath,
    formatExportError,
    methodFileNamePart,
    renderSvgToCanvas,
    reportExportStatus
  ]);

  const copyStructogramPng = useCallback(async () => {
    try {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      const payload = buildExportSvg();
      if (!payload) {
        reportExportStatus("Structogram is not ready for copy.");
        return;
      }
      const canvas = await renderSvgToCanvas(payload.svg, payload.width, payload.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reportExportStatus("Failed to copy structogram PNG: canvas unavailable.");
        return;
      }
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const rgba = new Uint8Array(imageData.data);
      const image = await TauriImage.new(rgba, canvas.width, canvas.height);
      await writeImage(image);
      reportExportStatus("Copied structogram PNG to clipboard.");
    } catch (error) {
      reportExportStatus(`Failed to copy structogram PNG: ${formatExportError(error)}`);
    }
  }, [buildExportSvg, formatExportError, renderSvgToCanvas, reportExportStatus]);

  useEffect(() => {
    if (!onRegisterExport) return;
    if (!renderMetrics) {
      onRegisterExport(null);
      return;
    }
    onRegisterExport({
      exportStructogramPng: () => {
        void exportStructogramPng();
      },
      copyStructogramPng: () => {
        void copyStructogramPng();
      }
    });
    return () => {
      onRegisterExport(null);
    };
  }, [copyStructogramPng, exportStructogramPng, onRegisterExport, renderMetrics]);

  if (!layout) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No control-tree data available for this method.
      </div>
    );
  }

  if (!renderMetrics) {
    return null;
  }

  const scaledWidth = Math.round(renderMetrics.svgWidth * fontScale);
  const scaledHeight = Math.round(renderMetrics.svgHeight * fontScale);

  return (
    <div
      className="flex h-full w-full min-w-0 flex-col overflow-hidden p-3 text-sm"
      style={{ fontFamily: "var(--uml-font)" }}
    >
      <div
        className="min-h-0 min-w-0 flex-1 overflow-auto bg-background"
        style={{ padding: `${STRUCTOGRAM_VIEWPORT_PADDING}px` }}
      >
        <svg
          ref={svgRef}
          className="block"
          width={scaledWidth}
          height={scaledHeight}
          viewBox={`0 0 ${renderMetrics.svgWidth} ${renderMetrics.svgHeight}`}
          strokeWidth={STRUCTOGRAM_SVG_STROKE_WIDTH}
          style={{ fontFamily: "var(--uml-font)" }}
          role="img"
          aria-label="Nassi-Shneiderman structogram"
        >
          <text
            x={STRUCTOGRAM_CANVAS_PADDING}
            y={renderMetrics.signatureTextY}
            fontSize={STRUCTOGRAM_FONT_SIZE}
            fontWeight="600"
            fill={palette.text}
          >
            {declaration}
          </text>
          {renderStructogramNode(
            layout,
            STRUCTOGRAM_CANVAS_PADDING,
            renderMetrics.structogramTopY,
            renderMetrics.contentWidth,
            "node",
            palette
          )}
        </svg>
      </div>
    </div>
  );
};
