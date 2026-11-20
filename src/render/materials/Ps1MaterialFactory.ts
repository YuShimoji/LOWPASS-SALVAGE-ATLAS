import {
  Color,
  DataTexture,
  MeshStandardMaterial,
  type MeshStandardMaterialParameters,
  NearestFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  Vector2,
} from "three";

type SurfaceTextureKind = "grime" | "ripple" | "hazard";
import type { VisualSettings } from "../../game/simulation/GameState";

interface EffectUniforms {
  snapEnabled: { value: number };
  ditherEnabled: { value: number };
  renderResolution: { value: Vector2 };
  snapPixelSize: { value: number };
}

export class Ps1MaterialFactory {
  private readonly uniformSets = new Set<EffectUniforms>();
  private readonly materials = new Set<MeshStandardMaterial>();
  private readonly renderResolution = new Vector2(1280, 720);
  private readonly textures = new Map<SurfaceTextureKind, DataTexture>();

  create(parameters: MeshStandardMaterialParameters): MeshStandardMaterial {
    const material = new MeshStandardMaterial({
      flatShading: true,
      roughness: 0.86,
      metalness: 0.08,
      ...parameters,
    });
    const uniforms: EffectUniforms = {
      snapEnabled: { value: 1 },
      ditherEnabled: { value: 1 },
      renderResolution: { value: this.renderResolution.clone() },
      snapPixelSize: { value: 2.25 },
    };
    this.uniformSets.add(uniforms);
    this.materials.add(material);
    material.addEventListener("dispose", () => {
      this.uniformSets.delete(uniforms);
      this.materials.delete(material);
    });

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uLowpassSnapEnabled = uniforms.snapEnabled;
      shader.uniforms.uLowpassDitherEnabled = uniforms.ditherEnabled;
      shader.uniforms.uLowpassRenderResolution = uniforms.renderResolution;
      shader.uniforms.uLowpassSnapPixelSize = uniforms.snapPixelSize;
      shader.vertexShader = `
        uniform float uLowpassSnapEnabled;
        uniform vec2 uLowpassRenderResolution;
        uniform float uLowpassSnapPixelSize;
      ${shader.vertexShader}`.replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        if (uLowpassSnapEnabled > 0.5) {
          vec2 snapGrid = max(uLowpassRenderResolution / uLowpassSnapPixelSize, vec2(1.0));
          vec2 snappedNdc = floor((gl_Position.xy / gl_Position.w) * snapGrid + 0.5) / snapGrid;
          gl_Position.xy = snappedNdc * gl_Position.w;
        }`,
      );
      shader.fragmentShader = `
        uniform float uLowpassDitherEnabled;
      ${shader.fragmentShader}`.replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        if (uLowpassDitherEnabled > 0.5) {
          // Dither in a gamma-like space: the frame is linear HDR until the output pass, so a
          // linear offset would be amplified into a visible lattice in dark scenes.
          float lowpassPattern = mod(gl_FragCoord.x + gl_FragCoord.y * 2.0, 4.0);
          vec3 lowpassPerceptual = pow(max(gl_FragColor.rgb, vec3(0.0)), vec3(1.0 / 2.2));
          lowpassPerceptual += (lowpassPattern - 1.5) / 255.0 * 3.0;
          gl_FragColor.rgb = pow(max(lowpassPerceptual, vec3(0.0)), vec3(2.2));
        }`,
      );
    };
    material.customProgramCacheKey = () => "lowpass-ps1-material-v1";
    return material;
  }

  createEmissive(color: string, emissiveIntensity = 1): MeshStandardMaterial {
    return this.create({
      color: new Color(color).multiplyScalar(0.45),
      emissive: color,
      emissiveIntensity,
      roughness: 0.72,
    });
  }

  /**
   * Shared low-resolution procedural textures (64px, nearest filtered for the PS1 look).
   * Created once per factory and reused by every world, so mission cycles never add textures.
   * Meshes using them should carry world-space UVs (see surfaceDetail.ts).
   */
  getSurfaceTexture(kind: SurfaceTextureKind): DataTexture {
    const existing = this.textures.get(kind);
    if (existing) return existing;
    const texture = createSurfaceTexture(kind);
    this.textures.set(kind, texture);
    return texture;
  }

  updateSettings(settings: VisualSettings): void {
    for (const uniforms of this.uniformSets) {
      uniforms.snapEnabled.value = Number(settings.vertexSnap);
      uniforms.ditherEnabled.value = Number(settings.dithering);
    }
  }

  updateResolution(width: number, height: number): void {
    this.renderResolution.set(width, height);
    for (const uniforms of this.uniformSets) {
      uniforms.renderResolution.value.copy(this.renderResolution);
    }
  }

  dispose(): void {
    for (const material of [...this.materials]) material.dispose();
    this.materials.clear();
    this.uniformSets.clear();
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
  }
}

const SURFACE_TEXTURE_SIZE = 64;

function createSurfaceTexture(kind: SurfaceTextureKind): DataTexture {
  const size = SURFACE_TEXTURE_SIZE;
  const data = new Uint8Array(size * size * 4);
  let seed = kind === "grime" ? 0x5eed1e : kind === "ripple" ? 0x7a7e12 : 0x4a2a2d;
  const random = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Coarse value noise so blotches span several texels instead of per-pixel static.
  const coarse = Array.from({ length: 9 * 9 }, random);
  const coarseAt = (x: number, y: number): number => {
    const gx = (x / size) * 8;
    const gy = (y / size) * 8;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const at = (cx: number, cy: number): number => coarse[(cy % 8) * 9 + (cx % 8)] ?? 0;
    const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
    const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
    return top * (1 - fy) + bottom * fy;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      let r = 255;
      let g = 255;
      let b = 255;
      let a = 255;
      if (kind === "grime") {
        const blotch = coarseAt(x, y);
        const speck = random();
        const seam = x % 32 === 0 || y % 32 === 0 ? 0.72 : 1;
        const value = (0.62 + blotch * 0.36) * (speck > 0.94 ? 0.7 : 1) * seam;
        r = value * 246;
        g = value * 240;
        b = value * 226;
      } else if (kind === "ripple") {
        const wave = Math.sin((x + coarseAt(x, y) * 18) * 0.42) * Math.sin((y + coarseAt(y, x) * 14) * 0.3);
        const crest = Math.max(0, wave) ** 3;
        r = 150 + crest * 105;
        g = 220 + crest * 35;
        b = 215 + crest * 40;
        a = crest * 255;
      } else {
        const stripe = Math.floor((x + y) / 8) % 2 === 0;
        const wear = coarseAt(x, y) > 0.72 ? 0.62 : 1;
        r = (stripe ? 214 : 28) * wear;
        g = (stripe ? 168 : 26) * wear;
        b = (stripe ? 52 : 22) * wear;
      }
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = a;
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.name = `lowpass-surface-${kind}`;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
