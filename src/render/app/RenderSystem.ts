import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PCFShadowMap,
  Object3D,
  PointLight,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import type { GameState, VisualSettings } from "../../game/simulation/GameState";
import { Ps1MaterialFactory } from "../materials/Ps1MaterialFactory";
import { createPlayerAvatar } from "../objects/createPlayerAvatar";
import { createShipInterior, type ShipInteriorView } from "../objects/createShipInterior";
import type { MissionWorldView } from "../objects/missionWorldView";
import { disposeObjectTree } from "../objects/disposeObjectTree";
import { interpolatePlayerPosition } from "../adapters/renderBridge";
import { ThirdPersonCamera } from "./ThirdPersonCamera";
import { Scene } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { VignetteShader } from "three/addons/shaders/VignetteShader.js";
import { GateFeedbackAudio } from "../audio/GateFeedbackAudio";
import { DEFAULT_SCENE_LIGHTING, type SceneLightingProfile } from "./sceneLighting";
import { chooseRenderTier, type RenderTier } from "./renderTier";

export interface RenderDiagnostics {
  drawCalls: number;
  triangles: number;
  renderWidth: number;
  renderHeight: number;
  sceneObjects: number;
  geometries: number;
  textures: number;
  programs: number;
  assetPackMode: "primitive" | "canary-v1";
  assetPackHash: string | null;
  assetLoadDurationMs: number;
  /** "reduced" drops presentation-only cost (post chain, reflection, decorative lamps, shadows). */
  renderTier: RenderTier;
  rendererName: string;
}

function readRendererName(renderer: WebGLRenderer): string {
  const gl = renderer.getContext();
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
}

export class RenderSystem {
  readonly canvas: HTMLCanvasElement;
  readonly cameraRig = new ThirdPersonCamera();
  private readonly scene = new Scene();
  private readonly renderer: WebGLRenderer;
  private readonly materials = new Ps1MaterialFactory();
  private readonly avatar = createPlayerAvatar(this.materials);
  private ship: ShipInteriorView | null = createShipInterior(this.materials);
  private missionView: MissionWorldView | null = null;
  private readonly interpolatedPlayer = new Vector3();
  private readonly drawingBufferSize = new Vector2();
  private readonly fog = new Fog(0x07171a, 10, 34);
  private readonly gateAudio: GateFeedbackAudio;
  private lastGateScanRevision = -1;
  private lastLowResolution: boolean | null = null;
  private disposed = false;
  private readonly ambient = new AmbientLight();
  private readonly hemisphere = new HemisphereLight();
  private readonly key = new DirectionalLight();
  private readonly fill = new DirectionalLight();
  private readonly characterLight = new PointLight("#ffffff", 0, 4.8, 2);
  private readonly characterLightOffset = new Vector3();
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly vignettePass: ShaderPass;
  private activeLightingId = "";
  private readonly renderTier: RenderTier;
  private readonly rendererName: string;

  constructor(
    private readonly mount: HTMLElement,
    private readonly onContextStatus: (message: string) => void,
    audioEnabled = true,
  ) {
    this.gateAudio = new GateFeedbackAudio(audioEnabled);
    this.renderer = new WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.canvas = this.renderer.domElement;
    this.canvas.className = "game-canvas";
    this.canvas.setAttribute("aria-label", "LOWPASS 3D game view");
    this.canvas.tabIndex = 0;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.rendererName = readRendererName(this.renderer);
    this.renderTier = chooseRenderTier(this.rendererName, new URLSearchParams(window.location.search).get("render"));
    this.renderer.shadowMap.enabled = this.renderTier === "full";
    this.renderer.shadowMap.type = PCFShadowMap;
    // Draw calls are summed over the scene pass and the post passes of one frame.
    this.renderer.info.autoReset = false;

    this.scene.background = new Color();
    this.scene.fog = this.fog;
    const initialShip = this.ship;
    if (!initialShip) throw new Error("Ship view failed to initialize");
    this.scene.add(initialShip.root, this.avatar);
    this.applyTierToWorld(initialShip.root);

    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.camera.left = -9;
    this.key.shadow.camera.right = 9;
    this.key.shadow.camera.top = 7;
    this.key.shadow.camera.bottom = -11;
    this.key.shadow.bias = -0.00035;
    this.scene.add(this.ambient, this.hemisphere, this.key, this.fill, this.characterLight);

    // Post chain (three.js 0.185 addons): HDR scene -> bloom on emissive lamps -> vignette -> tone map + sRGB.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.cameraRig.camera));
    this.bloomPass = new UnrealBloomPass(new Vector2(1280, 720), 0.5, 0.4, 0.8);
    this.composer.addPass(this.bloomPass);
    this.vignettePass = new ShaderPass(VignetteShader);
    this.composer.addPass(this.vignettePass);
    this.composer.addPass(new OutputPass());
    this.applyLighting(initialShip.lighting ?? DEFAULT_SCENE_LIGHTING);

    this.mount.prepend(this.canvas);
    window.addEventListener("resize", this.handleResize);
    this.canvas.addEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.addEventListener("webglcontextrestored", this.handleContextRestored);
    this.resize();
  }

  applyLookDelta(deltaX: number, deltaY: number): void {
    this.cameraRig.applyLookDelta(deltaX, deltaY);
  }

  applyWheelZoom(deltaY: number): void {
    this.cameraRig.applyWheelZoom(deltaY);
  }

  applyZoomInput(direction: number, frameSeconds: number): void {
    this.cameraRig.applyZoomInput(direction, frameSeconds);
  }

  enterMission(
    createView: (materials: Ps1MaterialFactory) => MissionWorldView,
    cameraStart?: { readonly playerPosition: { x: number; y: number; z: number }; readonly cameraPosition: { x: number; y: number; z: number } },
  ): void {
    const view = createView(this.materials);
    this.removeCurrentWorld();
    this.missionView = view;
    this.scene.add(view.root);
    this.applyTierToWorld(view.root);
    this.applyLighting(view.lighting ?? DEFAULT_SCENE_LIGHTING);
    if (cameraStart) this.cameraRig.resetFromStart(cameraStart.playerPosition, cameraStart.cameraPosition);
    else this.cameraRig.reset();
  }

  returnToShip(): void {
    this.removeCurrentWorld();
    this.ship = createShipInterior(this.materials);
    this.scene.add(this.ship.root);
    this.applyTierToWorld(this.ship.root);
    this.applyLighting(this.ship.lighting ?? DEFAULT_SCENE_LIGHTING);
    this.cameraRig.reset();
  }

  rebindControlledAgent(): void {
    this.cameraRig.reset();
  }

  render(state: GameState, interpolationAlpha: number, frameSeconds: number): void {
    this.applySettings(state.settings);
    interpolatePlayerPosition(state.player, interpolationAlpha, this.interpolatedPlayer);
    this.avatar.position.copy(this.interpolatedPlayer);
    this.avatar.rotation.y = state.player.facingYaw;
    const cameraOccluders = this.missionView?.cameraOccluders ?? this.ship?.cameraOccluders ?? [];
    this.cameraRig.update(this.interpolatedPlayer, frameSeconds, cameraOccluders);
    // Keep the character light between camera and character, above head height.
    this.characterLightOffset.subVectors(this.cameraRig.camera.position, this.interpolatedPlayer).setY(0);
    if (this.characterLightOffset.lengthSq() > 0.0001) this.characterLightOffset.setLength(1.1);
    this.characterLight.position.copy(this.interpolatedPlayer).add(this.characterLightOffset);
    this.characterLight.position.y += 1.35;
    const gateScan = state.expedition.gateScan;
    if (gateScan && gateScan.revision !== this.lastGateScanRevision) {
      this.lastGateScanRevision = gateScan.revision;
      this.gateAudio.play(gateScan.evaluation.accepted);
    }
    if (this.missionView && state.mission.session && state.mission.squad && state.mission.threat && state.mission.porter) {
      this.missionView.update(
        state.mission.session,
        state.mission.squad,
        state.mission.threat,
        state.mission.porter,
        state.runtime.elapsedSeconds,
      );
    } else {
      this.ship?.animate(
        state.runtime.elapsedSeconds,
        gateScan
          ? { accepted: gateScan.evaluation.accepted, startedAtSeconds: gateScan.scannedAtSeconds }
          : null,
      );
    }
    this.renderer.info.reset();
    if (state.settings.postEffects && this.renderTier === "full") this.composer.render(frameSeconds);
    else this.renderer.render(this.scene, this.cameraRig.camera);
  }

  getDiagnostics(): RenderDiagnostics {
    this.renderer.getDrawingBufferSize(this.drawingBufferSize);
    let sceneObjects = 0;
    this.scene.traverse(() => {
      sceneObjects += 1;
    });
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      renderWidth: this.drawingBufferSize.x,
      renderHeight: this.drawingBufferSize.y,
      sceneObjects,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      programs: this.renderer.info.programs?.length ?? 0,
      assetPackMode: this.missionView?.assetPackReadback.mode ?? "primitive",
      assetPackHash: this.missionView?.assetPackReadback.exactHash ?? null,
      assetLoadDurationMs: this.missionView?.assetPackReadback.loadDurationMs ?? 0,
      renderTier: this.renderTier,
      rendererName: this.rendererName,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener("resize", this.handleResize);
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
    this.composer.dispose();
    this.bloomPass.dispose();
    this.vignettePass.dispose();
    this.renderer.dispose();
    this.gateAudio.dispose();
    this.removeCurrentWorld();
    this.scene.remove(this.avatar);
    disposeObjectTree(this.avatar);
    this.materials.dispose();
    this.canvas.remove();
  }

  private removeCurrentWorld(): void {
    if (this.ship) {
      this.scene.remove(this.ship.root);
      this.ship.dispose();
      this.ship = null;
    }
    if (this.missionView) {
      this.scene.remove(this.missionView.root);
      this.missionView.dispose();
      this.missionView = null;
    }
  }

  private applyLighting(profile: SceneLightingProfile): void {
    if (profile.id === this.activeLightingId) return;
    this.activeLightingId = profile.id;
    (this.scene.background as Color).set(profile.background);
    this.renderer.setClearColor(profile.background);
    this.fog.color.set(profile.fog.color);
    this.fog.near = profile.fog.near;
    this.fog.far = profile.fog.far;
    this.renderer.toneMappingExposure = profile.exposure;
    this.ambient.color.set(profile.ambient.color);
    this.ambient.intensity = profile.ambient.intensity;
    this.hemisphere.color.set(profile.hemisphere.sky);
    this.hemisphere.groundColor.set(profile.hemisphere.ground);
    this.hemisphere.intensity = profile.hemisphere.intensity;
    this.key.color.set(profile.key.color);
    this.key.intensity = profile.key.intensity;
    this.key.position.set(...profile.key.position);
    this.fill.color.set(profile.fill.color);
    this.fill.intensity = profile.fill.intensity;
    this.fill.position.set(...profile.fill.position);
    this.characterLight.color.set(profile.character.color);
    this.characterLight.intensity = profile.character.intensity;
    this.bloomPass.strength = profile.bloom.strength;
    this.bloomPass.radius = profile.bloom.radius;
    this.bloomPass.threshold = profile.bloom.threshold;
    const vignetteUniforms = this.vignettePass.uniforms as Record<string, { value: number }>;
    if (vignetteUniforms.offset) vignetteUniforms.offset.value = profile.vignette.offset;
    if (vignetteUniforms.darkness) vignetteUniforms.darkness.value = profile.vignette.darkness;
  }

  /** Reduced tier hides lamps tagged `userData.decorative`; gameplay feedback lights stay. */
  private applyTierToWorld(root: Object3D): void {
    if (this.renderTier === "full") return;
    root.traverse((object) => {
      if ((object as PointLight).isPointLight && object.userData.decorative === true) object.visible = false;
    });
  }

  private applySettings(settings: VisualSettings): void {
    this.scene.fog = settings.distanceFog ? this.fog : null;
    this.materials.updateSettings(settings);
    this.missionView?.setWaterReflection?.(settings.waterReflection && this.renderTier === "full");
    if (this.lastLowResolution !== settings.lowResolution) {
      this.lastLowResolution = settings.lowResolution;
      this.resize();
    }
  }

  private resize(): void {
    if (this.disposed) return;
    const width = Math.max(this.mount.clientWidth, window.innerWidth, 1);
    const height = Math.max(this.mount.clientHeight, window.innerHeight, 1);
    const resolutionScale = this.lastLowResolution === false && this.renderTier === "full" ? 1 : 0.62;
    const pixelRatio = Math.min(window.devicePixelRatio, 1.5) * resolutionScale;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, true);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.cameraRig.resize(width, height);
    this.renderer.getDrawingBufferSize(this.drawingBufferSize);
    this.materials.updateResolution(this.drawingBufferSize.x, this.drawingBufferSize.y);
  }

  private readonly handleResize = (): void => this.resize();

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.onContextStatus("描画コンテキストが失われました。復旧を待機中…");
  };

  private readonly handleContextRestored = (): void => {
    this.resize();
    this.onContextStatus("描画コンテキストを復旧しました");
  };
}
