import {
  Color,
  MeshStandardMaterial,
  type MeshStandardMaterialParameters,
  Vector2,
} from "three";
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
          float lowpassPattern = mod(gl_FragCoord.x + gl_FragCoord.y * 2.0, 4.0);
          gl_FragColor.rgb += (lowpassPattern - 1.5) / 255.0 * 3.0;
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
  }
}
