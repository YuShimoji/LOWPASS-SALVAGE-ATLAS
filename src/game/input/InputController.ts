import { KEY_BINDINGS, type FrameCommands, type InputAction, type MovementIntent } from "./InputActions";

type LookHandler = (deltaX: number, deltaY: number) => void;

export class InputController {
  private readonly held = new Set<InputAction>();
  private readonly pressed = new Set<InputAction>();
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onLook: LookHandler,
  ) {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleBlur);
    document.addEventListener("mousemove", this.handleMouseMove);
    this.canvas.addEventListener("click", this.handleCanvasClick);
  }

  sampleMovement(cameraYaw: number): MovementIntent {
    const strafe = Number(this.held.has("move-right")) - Number(this.held.has("move-left"));
    const forward = Number(this.held.has("move-forward")) - Number(this.held.has("move-backward"));
    const length = Math.hypot(strafe, forward);
    const normalizedStrafe = length > 1 ? strafe / length : strafe;
    const normalizedForward = length > 1 ? forward / length : forward;
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);

    return {
      worldX: normalizedStrafe * cos - normalizedForward * sin,
      worldZ: -normalizedStrafe * sin - normalizedForward * cos,
      sprint: this.held.has("sprint"),
      interactPressed: this.consume("interact"),
    };
  }

  consumeFrameCommands(): FrameCommands {
    return {
      pausePressed: this.consume("pause"),
      debugPressed: this.consume("toggle-debug"),
    };
  }

  clearMovement(): void {
    this.held.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleBlur);
    document.removeEventListener("mousemove", this.handleMouseMove);
    this.canvas.removeEventListener("click", this.handleCanvasClick);
  }

  private consume(action: InputAction): boolean {
    const wasPressed = this.pressed.has(action);
    this.pressed.delete(action);
    return wasPressed;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const action = KEY_BINDINGS[event.code as keyof typeof KEY_BINDINGS];
    if (!action) return;
    if (action === "toggle-debug" || event.code.startsWith("Arrow")) event.preventDefault();
    if (!event.repeat) this.pressed.add(action);
    this.held.add(action);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const action = KEY_BINDINGS[event.code as keyof typeof KEY_BINDINGS];
    if (action) this.held.delete(action);
  };

  private readonly handleBlur = (): void => {
    this.held.clear();
    this.pressed.clear();
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement === this.canvas) {
      this.onLook(event.movementX, event.movementY);
    }
  };

  private readonly handleCanvasClick = (): void => {
    if (document.pointerLockElement !== this.canvas) {
      void this.canvas.requestPointerLock().catch(() => {
        // Embedded browsers and automation may reject pointer lock. The game
        // remains playable with keyboard input, so this is a recoverable edge.
      });
    }
  };
}
