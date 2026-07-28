import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  PCFShadowMap,
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
import { GateFeedbackAudio } from "../audio/GateFeedbackAudio";
import type { SemanticAudio } from "../audio/SemanticAudio";

export interface RenderDiagnostics {
  drawCalls: number;
  triangles: number;
  renderWidth: number;
  renderHeight: number;
  sceneObjects: number;
  geometries: number;
  textures: number;
  programs: number;
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
  private readonly fog = new Fog(0x091114, 9, 31);
  private readonly gateAudio: GateFeedbackAudio;
  private lastGateScanRevision = -1;
  private lastLowResolution: boolean | null = null;
  private disposed = false;

  constructor(
    private readonly mount: HTMLElement,
    private readonly onContextStatus: (message: string) => void,
    audio: SemanticAudio,
  ) {
    this.gateAudio = new GateFeedbackAudio(audio);
    this.renderer = new WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.canvas = this.renderer.domElement;
    this.canvas.className = "game-canvas";
    this.canvas.setAttribute("aria-label", "LOWPASS 3D game view");
    this.canvas.tabIndex = 0;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.setClearColor(new Color("#091114"));

    this.scene.background = new Color("#091114");
    this.scene.fog = this.fog;
    const initialShip = this.ship;
    if (!initialShip) throw new Error("Ship view failed to initialize");
    this.scene.add(initialShip.root, this.avatar);

    const ambient = new AmbientLight(0x8ea6a2, 1.5);
    this.scene.add(ambient);
    const key = new DirectionalLight(0xffddb2, 3.4);
    key.position.set(3, 8, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -9;
    key.shadow.camera.right = 9;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -11;
    this.scene.add(key);

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
    if (cameraStart) this.cameraRig.resetFromStart(cameraStart.playerPosition, cameraStart.cameraPosition);
    else this.cameraRig.reset();
  }

  returnToShip(): void {
    this.removeCurrentWorld();
    this.ship = createShipInterior(this.materials);
    this.scene.add(this.ship.root);
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
    this.renderer.render(this.scene, this.cameraRig.camera);
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
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener("resize", this.handleResize);
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
    this.renderer.dispose();
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

  private applySettings(settings: VisualSettings): void {
    this.scene.fog = settings.distanceFog ? this.fog : null;
    this.materials.updateSettings(settings);
    if (this.lastLowResolution !== settings.lowResolution) {
      this.lastLowResolution = settings.lowResolution;
      this.resize();
    }
  }

  private resize(): void {
    if (this.disposed) return;
    const width = Math.max(this.mount.clientWidth, window.innerWidth, 1);
    const height = Math.max(this.mount.clientHeight, window.innerHeight, 1);
    const resolutionScale = this.lastLowResolution === false ? 1 : 0.62;
    const pixelRatio = Math.min(window.devicePixelRatio, 1.5) * resolutionScale;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, true);
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
