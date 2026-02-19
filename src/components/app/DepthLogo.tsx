import { useCallback, useEffect, useRef, useState } from "react";

const DISPLACEMENT_STRENGTH = 0.022;
const MAX_TILT_DEG = 2.5;
const LERP_FACTOR = 0.1;
const IDLE_RESET_MS = 900;
const POINTER_CLAMP = 0.5;
const CONTAINER_PERSPECTIVE_PX = 900;
const FINAL_ICON_FALLBACK_SRC = "/icon/original_icon.png";

type DepthLogoProps = {
  open: boolean;
  className?: string;
  ariaLabel?: string;
  runtimeIconSrc?: string;
  runtimeDepthSrc?: string;
  originalFallbackSrc?: string;
};

const VERTEX_SHADER_SOURCE = `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;

varying vec2 vUv;
uniform sampler2D uImage;
uniform sampler2D uDepth;
uniform vec2 uPointer;
uniform float uStrength;

void main() {
  vec4 baseSample = texture2D(uImage, vUv);
  float depth = texture2D(uDepth, vUv).r - 0.5;
  vec2 offset = uPointer * (uStrength * depth);
  vec2 uv = clamp(vUv + offset, vec2(0.001), vec2(0.999));
  vec4 displaced = texture2D(uImage, uv);

  // Keep the silhouette anchored to the original alpha so displaced edge texels
  // cannot introduce visible fringe on light backgrounds.
  float coverage = smoothstep(0.01, 0.18, baseSample.a);
  float alpha = displaced.a * coverage;
  if (alpha <= 0.0001) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // Texture upload uses premultiplied alpha. Rescale RGB to the adjusted alpha.
  float colorScale = alpha / max(displaced.a, 0.0001);
  gl_FragColor = vec4(displaced.rgb * colorScale, alpha);
}
`;

type Point2D = { x: number; y: number };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const createShader = (gl: WebGLRenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) {
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

const createProgram = (gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) => {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) {
    if (vertexShader) {
      gl.deleteShader(vertexShader);
    }
    if (fragmentShader) {
      gl.deleteShader(fragmentShader);
    }
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  return program;
};

const createTextureFromImage = (
  gl: WebGLRenderingContext,
  image: HTMLImageElement,
  premultiplyAlpha = false
) => {
  const texture = gl.createTexture();
  if (!texture) {
    return null;
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiplyAlpha ? 1 : 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });

const motionDisabled = () => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    window.matchMedia("(pointer: coarse)").matches
  );
};

const toPointerVector = (clientX: number, clientY: number): Point2D => {
  if (typeof window === "undefined") {
    return { x: 0, y: 0 };
  }
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const nx = (clientX / width) * 2 - 1;
  const ny = (clientY / height) * 2 - 1;
  return {
    x: clamp(nx, -POINTER_CLAMP, POINTER_CLAMP),
    y: clamp(-ny, -POINTER_CLAMP, POINTER_CLAMP)
  };
};

export const DepthLogo = ({
  open,
  className = "mx-auto h-44 w-44",
  ariaLabel = "Unimozer Next logo",
  runtimeIconSrc = "/icon/icon_runtime.png",
  runtimeDepthSrc = "/icon/icon_depthmap_runtime.png",
  originalFallbackSrc = "/icon/icon.png"
}: DepthLogoProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderWebGl, setRenderWebGl] = useState(false);
  const [staticSrc, setStaticSrc] = useState(runtimeIconSrc);

  const handleStaticError = useCallback(() => {
    if (staticSrc !== originalFallbackSrc) {
      setStaticSrc(originalFallbackSrc);
      return;
    }
    if (staticSrc !== FINAL_ICON_FALLBACK_SRC) {
      setStaticSrc(FINAL_ICON_FALLBACK_SRC);
    }
  }, [originalFallbackSrc, staticSrc]);

  useEffect(() => {
    setStaticSrc(runtimeIconSrc);
  }, [runtimeIconSrc]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;

    setRenderWebGl(false);
    setStaticSrc(runtimeIconSrc);

    if (!open || !container || !canvas) {
      if (container) {
        container.style.transform = `perspective(${CONTAINER_PERSPECTIVE_PX}px) rotateX(0deg) rotateY(0deg)`;
      }
      return;
    }

    if (motionDisabled()) {
      container.style.transform = `perspective(${CONTAINER_PERSPECTIVE_PX}px) rotateX(0deg) rotateY(0deg)`;
      return;
    }

    const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true });
    if (!gl) {
      container.style.transform = `perspective(${CONTAINER_PERSPECTIVE_PX}px) rotateX(0deg) rotateY(0deg)`;
      return;
    }

    let cancelled = false;
    let rafId = 0;
    let program: WebGLProgram | null = null;
    let positionBuffer: WebGLBuffer | null = null;
    let iconTexture: WebGLTexture | null = null;
    let depthTexture: WebGLTexture | null = null;
    let pointerUniform: WebGLUniformLocation | null = null;
    let strengthUniform: WebGLUniformLocation | null = null;
    let pointerTarget: Point2D = { x: 0, y: 0 };
    const pointerCurrent: Point2D = { x: 0, y: 0 };
    let lastPointerMoveAt = performance.now();
    let resizeWidth = 0;
    let resizeHeight = 0;
    let contextLost = false;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (width === resizeWidth && height === resizeHeight) {
        return;
      }
      resizeWidth = width;
      resizeHeight = height;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    };

    const onPointerMove = (event: PointerEvent) => {
      pointerTarget = toPointerVector(event.clientX, event.clientY);
      lastPointerMoveAt = performance.now();
    };

    const resetPointerTarget = () => {
      pointerTarget = { x: 0, y: 0 };
    };

    const cleanupResources = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("blur", resetPointerTarget);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      canvas.removeEventListener("webglcontextlost", handleContextLost);

      if (positionBuffer) {
        gl.deleteBuffer(positionBuffer);
      }
      if (iconTexture) {
        gl.deleteTexture(iconTexture);
      }
      if (depthTexture) {
        gl.deleteTexture(depthTexture);
      }
      if (program) {
        gl.deleteProgram(program);
      }

      container.style.transform = `perspective(${CONTAINER_PERSPECTIVE_PX}px) rotateX(0deg) rotateY(0deg)`;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        resetPointerTarget();
      }
    };

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      setRenderWebGl(false);
      setStaticSrc(runtimeIconSrc);
    };

    const initialize = async () => {
      try {
        const [iconImage, depthImage] = await Promise.all([
          loadImage(runtimeIconSrc),
          loadImage(runtimeDepthSrc)
        ]);
        if (cancelled) {
          return;
        }

        program = createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
        if (!program) {
          return;
        }

        const positionAttribute = gl.getAttribLocation(program, "aPosition");
        pointerUniform = gl.getUniformLocation(program, "uPointer");
        strengthUniform = gl.getUniformLocation(program, "uStrength");
        const imageUniform = gl.getUniformLocation(program, "uImage");
        const depthUniform = gl.getUniformLocation(program, "uDepth");

        if (
          positionAttribute < 0 ||
          !pointerUniform ||
          !strengthUniform ||
          !imageUniform ||
          !depthUniform
        ) {
          return;
        }

        positionBuffer = gl.createBuffer();
        if (!positionBuffer) {
          return;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
          gl.STATIC_DRAW
        );

        iconTexture = createTextureFromImage(gl, iconImage, true);
        depthTexture = createTextureFromImage(gl, depthImage, false);
        if (!iconTexture || !depthTexture) {
          return;
        }

        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(positionAttribute);
        gl.vertexAttribPointer(positionAttribute, 2, gl.FLOAT, false, 0, 0);
        gl.disable(gl.DEPTH_TEST);
        gl.clearColor(0, 0, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, iconTexture);
        gl.uniform1i(imageUniform, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, depthTexture);
        gl.uniform1i(depthUniform, 1);

        resizeCanvas();
        window.addEventListener("pointermove", onPointerMove, { passive: true });
        window.addEventListener("resize", resizeCanvas);
        window.addEventListener("blur", resetPointerTarget);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        canvas.addEventListener("webglcontextlost", handleContextLost, false);
        setRenderWebGl(true);

        const renderFrame = (time: number) => {
          if (cancelled || contextLost) {
            return;
          }

          if (time - lastPointerMoveAt > IDLE_RESET_MS) {
            pointerTarget = { x: 0, y: 0 };
          }

          pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * LERP_FACTOR;
          pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * LERP_FACTOR;

          const tiltX = -pointerCurrent.y * MAX_TILT_DEG;
          const tiltY = pointerCurrent.x * MAX_TILT_DEG;
          container.style.transform =
            `perspective(${CONTAINER_PERSPECTIVE_PX}px) ` +
            `rotateX(${tiltX.toFixed(3)}deg) rotateY(${tiltY.toFixed(3)}deg)`;

          resizeCanvas();
          gl.useProgram(program);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.uniform2f(pointerUniform, pointerCurrent.x, pointerCurrent.y);
          gl.uniform1f(strengthUniform, DISPLACEMENT_STRENGTH);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

          rafId = requestAnimationFrame(renderFrame);
        };

        rafId = requestAnimationFrame(renderFrame);
      } catch {
        // Fallback to static runtime icon when loading/runtime WebGL setup fails.
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      cleanupResources();
    };
  }, [open, runtimeDepthSrc, runtimeIconSrc]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        transform: `perspective(${CONTAINER_PERSPECTIVE_PX}px) rotateX(0deg) rotateY(0deg)`,
        transformStyle: "preserve-3d",
        willChange: "transform"
      }}
      aria-label={ariaLabel}
    >
      {renderWebGl ? (
        <canvas
          ref={canvasRef}
          className="h-full w-full object-contain"
          role="img"
          aria-label={ariaLabel}
        />
      ) : (
        <>
          <canvas ref={canvasRef} className="hidden" />
          <img
            src={staticSrc}
            alt={ariaLabel}
            className="h-full w-full object-contain"
            onError={handleStaticError}
          />
        </>
      )}
    </div>
  );
};
