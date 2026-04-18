export const renderSvgToCanvas = (
  svg: SVGSVGElement,
  width: number,
  height: number,
  scale: number
): Promise<HTMLCanvasElement> =>
  new Promise((resolve, reject) => {
    const serializer = new XMLSerializer();
    const raw = serializer.serializeToString(svg);
    const blob = new Blob([raw], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to create canvas context."));
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.scale(scale, scale);
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
  });
