/**
 * Generate runtime logo assets for About dialog depth-map parallax rendering.
 *
 * Pipeline:
 * 1) Resize the icon to 512x512 (contain) and clean RGB halos on transparent edges.
 * 2) Resize the depth map to 512x512 (cover), grayscale it, and blend it with a blurred
 *    icon alpha mask so outside/edge regions converge toward neutral depth (128).
 * 3) Emit runtime PNG files and print dimension + size verification.
 */

import { access, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const RUNTIME_SIZE = 512;

const ICON_SOURCE = "public/icon/icon.png";
const DEPTH_SOURCE = "public/icon/icon_depthmap.png";

const ICON_OUTPUT = "public/icon/icon_runtime.png";
const DEPTH_OUTPUT = "public/icon/icon_depthmap_runtime.png";

const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));

const formatKb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

const pickDepthSource = async () => {
  await access(DEPTH_SOURCE);
  return DEPTH_SOURCE;
};

const cleanupIconRgb = (rgbaBuffer, width, height) => {
  const pixelCount = width * height;
  const alpha = new Uint8Array(pixelCount);
  let rgb = new Float32Array(pixelCount * 3);

  for (let i = 0; i < pixelCount; i += 1) {
    const srcIndex = i * 4;
    const rgbIndex = i * 3;
    rgb[rgbIndex] = rgbaBuffer[srcIndex];
    rgb[rgbIndex + 1] = rgbaBuffer[srcIndex + 1];
    rgb[rgbIndex + 2] = rgbaBuffer[srcIndex + 2];
    alpha[i] = rgbaBuffer[srcIndex + 3];
  }

  const candidates = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1]
  ];

  for (let iteration = 0; iteration < 5; iteration += 1) {
    const nextRgb = rgb.slice();

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixelIndex = y * width + x;
        const pixelAlpha = alpha[pixelIndex];

        if (pixelAlpha >= 96) {
          continue;
        }

        let weightSum = 0;
        let red = 0;
        let green = 0;
        let blue = 0;

        for (const [offsetX, offsetY] of candidates) {
          const sampleX = x + offsetX;
          const sampleY = y + offsetY;
          if (sampleX < 0 || sampleY < 0 || sampleX >= width || sampleY >= height) {
            continue;
          }

          const neighborIndex = sampleY * width + sampleX;
          const neighborAlpha = alpha[neighborIndex];
          if (neighborAlpha <= 8) {
            continue;
          }

          const weight = neighborAlpha;
          const neighborRgbIndex = neighborIndex * 3;
          red += rgb[neighborRgbIndex] * weight;
          green += rgb[neighborRgbIndex + 1] * weight;
          blue += rgb[neighborRgbIndex + 2] * weight;
          weightSum += weight;
        }

        if (weightSum === 0) {
          continue;
        }

        const rgbIndex = pixelIndex * 3;
        const averageRed = red / weightSum;
        const averageGreen = green / weightSum;
        const averageBlue = blue / weightSum;
        const blend = pixelAlpha <= 24 ? 1 : (96 - pixelAlpha) / 72;

        nextRgb[rgbIndex] = rgb[rgbIndex] * (1 - blend) + averageRed * blend;
        nextRgb[rgbIndex + 1] = rgb[rgbIndex + 1] * (1 - blend) + averageGreen * blend;
        nextRgb[rgbIndex + 2] = rgb[rgbIndex + 2] * (1 - blend) + averageBlue * blend;
      }
    }

    rgb = nextRgb;
  }

  const cleaned = Buffer.alloc(pixelCount * 4);
  for (let i = 0; i < pixelCount; i += 1) {
    const srcRgbIndex = i * 3;
    const dstIndex = i * 4;
    cleaned[dstIndex] = clampByte(rgb[srcRgbIndex]);
    cleaned[dstIndex + 1] = clampByte(rgb[srcRgbIndex + 1]);
    cleaned[dstIndex + 2] = clampByte(rgb[srcRgbIndex + 2]);
    cleaned[dstIndex + 3] = alpha[i];
  }

  return cleaned;
};

const buildRuntimeIcon = async () => {
  const resizedIcon = sharp(ICON_SOURCE)
    .resize(RUNTIME_SIZE, RUNTIME_SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .ensureAlpha();

  const { data, info } = await resizedIcon.raw().toBuffer({ resolveWithObject: true });
  const cleanedRgba = cleanupIconRgb(data, info.width, info.height);

  await sharp(cleanedRgba, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4
    }
  })
    .png({
      compressionLevel: 9
    })
    .toFile(ICON_OUTPUT);
};

const buildRuntimeDepth = async (depthSource) => {
  const depthBuffer = await sharp(depthSource)
    .resize(RUNTIME_SIZE, RUNTIME_SIZE, {
      fit: "cover",
      position: "center"
    })
    .greyscale()
    .raw()
    .toBuffer();

  const smoothedAlpha = await sharp(ICON_SOURCE)
    .resize(RUNTIME_SIZE, RUNTIME_SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .ensureAlpha()
    .extractChannel("alpha")
    .blur(1.2)
    .raw()
    .toBuffer();

  const output = Buffer.alloc(RUNTIME_SIZE * RUNTIME_SIZE);

  for (let i = 0; i < output.length; i += 1) {
    const alpha = smoothedAlpha[i] / 255;
    const softenedAlpha = Math.max(0, Math.min(1, (alpha - 0.02) / 0.96));
    const depthValue = depthBuffer[i];
    output[i] = clampByte(128 * (1 - softenedAlpha) + depthValue * softenedAlpha);
  }

  await sharp(output, {
    raw: {
      width: RUNTIME_SIZE,
      height: RUNTIME_SIZE,
      channels: 1
    }
  })
    .png({
      compressionLevel: 9
    })
    .toFile(DEPTH_OUTPUT);
};

const logAsset = async (label, filePath) => {
  const [metadata, fileStat] = await Promise.all([sharp(filePath).metadata(), stat(filePath)]);
  const projectRelative = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
  console.log(
    `[OK] ${label}: ${projectRelative} (${metadata.width}x${metadata.height}, ${formatKb(fileStat.size)})`
  );
};

const main = async () => {
  const depthSource = await pickDepthSource();
  console.log(`[INFO] Depth source: ${depthSource}`);

  await buildRuntimeIcon();
  await buildRuntimeDepth(depthSource);

  await logAsset("Runtime icon", ICON_OUTPUT);
  await logAsset("Runtime depth map", DEPTH_OUTPUT);
};

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error("Logo asset processing failed:", message);
  process.exit(1);
});
