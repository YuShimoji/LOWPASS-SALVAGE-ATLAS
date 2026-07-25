import { KEY_BINDINGS, type FrameCommands, type InputAction, type MovementIntent } from "./InputActions";

type LookHandler = (deltaX: number, deltaY: number) => void;

export type ActiveInputDevice = "none" | "keyboard" | "mouse" | "gamepad";

export interface InputControllerOptions {
  readonly onLook: LookHandler;
  readonly onWheelZoom: (deltaY: number) => void;
  readonly isWorldInputAllowed: () => boolean;
  readonly getModalState: () => string;
}

export interface ConnectedGamepadDiagnostics {
  readonly index: number;
  readonly id: string;
  readonly mapping: string;
}

export interface InputDiagnostics {
  readonly heldCodes: readonly string[];
  readonly resolvedActions: readonly InputAction[];
  readonly rawX: number;
  readonly rawY: number;
  readonly worldX: number;
  readonly worldZ: number;
  readonly focusedElement: string;
  readonly modalState: string;
  readonly pointerLocked: boolean;
  readonly actualDisplacementX: number;
  readonly actualDisplacementZ: number;
  readonly actualDisplacement: number;
  readonly activeDevice: ActiveInputDevice;
  readonly connectedGamepads: readonly ConnectedGamepadDiagnostics[];
}

export interface ResolvedGamepadInput {
  readonly rawX: number;
  readonly rawY: number;
  readonly lookX: number;
  readonly lookY: number;
  readonly heldActions: ReadonlySet<InputAction>;
  readonly pressedActions: ReadonlySet<InputAction>;
  readonly buttonState: ReadonlyMap<number, boolean>;
  readonly connected: readonly ConnectedGamepadDiagnostics[];
  readonly active: boolean;
}

const MOVEMENT_ACTIONS = new Set<InputAction>([
  "move-forward",
  "move-backward",
  "move-left",
  "move-right",
  "sprint",
  "interact",
  "zoom-in",
  "zoom-out",
]);
const GAMEPAD_DEADZONE = 0.18;
const GAMEPAD_LOOK_PIXELS_PER_SECOND = 680;

export class InputController {
  private readonly heldCodes = new Set<string>();
  private readonly pressed = new Set<InputAction>();
  private gamepadHeld = new Set<InputAction>();
  private gamepadButtons = new Map<number, boolean>();
  private connectedGamepads: readonly ConnectedGamepadDiagnostics[] = [];
  private gamepadRawX = 0;
  private gamepadRawY = 0;
  private lastRawX = 0;
  private lastRawY = 0;
  private lastWorldX = 0;
  private lastWorldZ = 0;
  private actualDisplacementX = 0;
  private actualDisplacementZ = 0;
  private activeDevice: ActiveInputDevice = "none";
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: InputControllerOptions,
  ) {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleBlur);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    document.addEventListener("mousemove", this.handleMouseMove);
    this.canvas.addEventListener("click", this.handleCanvasClick);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
  }

  sampleMovement(cameraYaw: number): MovementIntent {
    const actions = this.resolveHeldActions();
    const keyboardX = Number(actions.has("move-right")) - Number(actions.has("move-left"));
    const keyboardY = Number(actions.has("move-forward")) - Number(actions.has("move-backward"));
    const strafe = clampUnit(keyboardX + this.gamepadRawX);
    const forward = clampUnit(keyboardY + this.gamepadRawY);
    const length = Math.hypot(strafe, forward);
    const normalizedStrafe = length > 1 ? strafe / length : strafe;
    const normalizedForward = length > 1 ? forward / length : forward;
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    const worldInputAllowed = this.options.isWorldInputAllowed();
    const worldX = worldInputAllowed ? normalizedStrafe * cos - normalizedForward * sin : 0;
    const worldZ = worldInputAllowed ? -normalizedStrafe * sin - normalizedForward * cos : 0;
    this.lastRawX = worldInputAllowed ? normalizedStrafe : 0;
    this.lastRawY = worldInputAllowed ? normalizedForward : 0;
    this.lastWorldX = worldX;
    this.lastWorldZ = worldZ;
    const interactPressed = this.consume("interact");

    return {
      rawX: this.lastRawX,
      rawY: this.lastRawY,
      worldX,
      worldZ,
      sprint: worldInputAllowed && actions.has("sprint"),
      interactPressed: worldInputAllowed && interactPressed,
    };
  }

  consumeFrameCommands(frameSeconds = 1 / 60): FrameCommands {
    this.pollGamepads(frameSeconds);
    const zoomDirection = this.options.isWorldInputAllowed()
      ? Number(this.gamepadHeld.has("zoom-out")) - Number(this.gamepadHeld.has("zoom-in"))
      : 0;
    return {
      pausePressed: this.consume("pause"),
      debugPressed: this.consume("toggle-debug"),
      cancelPressed: this.consume("cancel"),
      zoomDirection,
    };
  }

  clearMovement(): void {
    this.heldCodes.clear();
    this.pressed.clear();
    this.gamepadHeld.clear();
    this.gamepadButtons.clear();
    this.gamepadRawX = 0;
    this.gamepadRawY = 0;
    this.lastRawX = 0;
    this.lastRawY = 0;
    this.lastWorldX = 0;
    this.lastWorldZ = 0;
  }

  recordActualDisplacement(x: number, z: number): void {
    this.actualDisplacementX = x;
    this.actualDisplacementZ = z;
  }

  getDiagnostics(): InputDiagnostics {
    return {
      heldCodes: [...this.heldCodes].sort(),
      resolvedActions: [...this.resolveHeldActions()].sort(),
      rawX: this.lastRawX,
      rawY: this.lastRawY,
      worldX: this.lastWorldX,
      worldZ: this.lastWorldZ,
      focusedElement: describeFocusedElement(document.activeElement),
      modalState: this.options.getModalState(),
      pointerLocked: document.pointerLockElement === this.canvas,
      actualDisplacementX: this.actualDisplacementX,
      actualDisplacementZ: this.actualDisplacementZ,
      actualDisplacement: Math.hypot(this.actualDisplacementX, this.actualDisplacementZ),
      activeDevice: this.activeDevice,
      connectedGamepads: this.connectedGamepads,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleBlur);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    document.removeEventListener("mousemove", this.handleMouseMove);
    this.canvas.removeEventListener("click", this.handleCanvasClick);
    this.canvas.removeEventListener("wheel", this.handleWheel);
  }

  private consume(action: InputAction): boolean {
    const wasPressed = this.pressed.has(action);
    this.pressed.delete(action);
    return wasPressed;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const action = KEY_BINDINGS[event.code as keyof typeof KEY_BINDINGS];
    if (!action) return;
    if (isEditableInputTarget(event.target) && MOVEMENT_ACTIONS.has(action)) return;
    if (!this.options.isWorldInputAllowed() && MOVEMENT_ACTIONS.has(action)) return;
    if (action === "toggle-debug" || event.code.startsWith("Arrow")) event.preventDefault();
    if (!event.repeat) this.pressed.add(action);
    this.heldCodes.add(event.code);
    this.activeDevice = "keyboard";
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.heldCodes.delete(event.code);
  };

  private readonly handleBlur = (): void => {
    this.clearMovement();
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement === this.canvas && this.options.isWorldInputAllowed()) {
      this.activeDevice = "mouse";
      this.options.onLook(event.movementX, event.movementY);
    }
  };

  private readonly handleCanvasClick = (): void => {
    if (document.pointerLockElement !== this.canvas && this.options.isWorldInputAllowed()) {
      void this.canvas.requestPointerLock().catch(() => {
        // Embedded browsers and automation may reject pointer lock. The game
        // remains playable with keyboard input, so this is a recoverable edge.
      });
    }
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState !== "visible") this.clearMovement();
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    if (!this.options.isWorldInputAllowed() || isEditableInputTarget(event.target)) return;
    event.preventDefault();
    this.activeDevice = "mouse";
    this.options.onWheelZoom(event.deltaY);
  };

  private resolveHeldActions(): Set<InputAction> {
    const actions = new Set<InputAction>(this.gamepadHeld);
    for (const code of this.heldCodes) {
      const action = KEY_BINDINGS[code as keyof typeof KEY_BINDINGS];
      if (action) actions.add(action);
    }
    return actions;
  }

  private pollGamepads(frameSeconds: number): void {
    const gamepads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
    const resolved = resolveGamepadInput(gamepads, this.gamepadButtons);
    this.connectedGamepads = resolved.connected;
    this.gamepadHeld = new Set(resolved.heldActions);
    this.gamepadButtons = new Map(resolved.buttonState);
    this.gamepadRawX = resolved.rawX;
    this.gamepadRawY = resolved.rawY;
    for (const action of resolved.pressedActions) this.pressed.add(action);
    if (resolved.active) this.activeDevice = "gamepad";
    if (this.options.isWorldInputAllowed() && (Math.abs(resolved.lookX) > 0 || Math.abs(resolved.lookY) > 0)) {
      this.options.onLook(
        resolved.lookX * GAMEPAD_LOOK_PIXELS_PER_SECOND * frameSeconds,
        resolved.lookY * GAMEPAD_LOOK_PIXELS_PER_SECOND * frameSeconds,
      );
    }
  }
}

export function resolveGamepadInput(
  gamepads: ArrayLike<Gamepad | null>,
  previousButtons: ReadonlyMap<number, boolean> = new Map(),
  deadzone = GAMEPAD_DEADZONE,
): ResolvedGamepadInput {
  const connected: ConnectedGamepadDiagnostics[] = [];
  let selected: Gamepad | null = null;
  for (let index = 0; index < gamepads.length; index += 1) {
    const gamepad = gamepads[index];
    if (!gamepad?.connected) continue;
    connected.push({ index: gamepad.index, id: gamepad.id, mapping: gamepad.mapping });
    if (!selected || (gamepad.mapping === "standard" && selected.mapping !== "standard")) selected = gamepad;
  }
  if (!selected) {
    return {
      rawX: 0,
      rawY: 0,
      lookX: 0,
      lookY: 0,
      heldActions: new Set(),
      pressedActions: new Set(),
      buttonState: new Map(),
      connected,
      active: false,
    };
  }

  const [leftX, leftY] = normalizeStick(selected.axes[0] ?? 0, selected.axes[1] ?? 0, deadzone);
  const [lookX, lookY] = normalizeStick(selected.axes[2] ?? 0, selected.axes[3] ?? 0, deadzone);
  const buttonPressed = (index: number): boolean => Boolean(selected?.buttons[index]?.pressed);
  const dpadX = Number(buttonPressed(15)) - Number(buttonPressed(14));
  const dpadY = Number(buttonPressed(12)) - Number(buttonPressed(13));
  const rawX = Math.abs(leftX) > 0 ? leftX : dpadX;
  const rawY = Math.abs(leftY) > 0 ? -leftY : dpadY;
  const heldActions = new Set<InputAction>();
  if (rawY > 0) heldActions.add("move-forward");
  if (rawY < 0) heldActions.add("move-backward");
  if (rawX < 0) heldActions.add("move-left");
  if (rawX > 0) heldActions.add("move-right");
  if (buttonPressed(0)) heldActions.add("interact");
  if (buttonPressed(1)) heldActions.add("cancel");
  if (buttonPressed(10)) heldActions.add("sprint");
  if (buttonPressed(9)) heldActions.add("pause");
  if (buttonPressed(4)) heldActions.add("zoom-in");
  if (buttonPressed(5)) heldActions.add("zoom-out");

  const trackedButtons = [0, 1, 9, 10, 4, 5, 12, 13, 14, 15];
  const buttonState = new Map<number, boolean>();
  const pressedActions = new Set<InputAction>();
  for (const index of trackedButtons) {
    const current = buttonPressed(index);
    buttonState.set(index, current);
    if (!current || previousButtons.get(index)) continue;
    const action = index === 0
      ? "interact"
      : index === 1
        ? "cancel"
        : index === 9
          ? "pause"
          : null;
    if (action) pressedActions.add(action);
  }

  return {
    rawX,
    rawY,
    lookX,
    lookY,
    heldActions,
    pressedActions,
    buttonState,
    connected,
    active: Math.hypot(rawX, rawY, lookX, lookY) > 0.01 || [...buttonState.values()].some(Boolean),
  };
}

export function normalizeStick(x: number, y: number, deadzone = GAMEPAD_DEADZONE): [number, number] {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= deadzone) return [0, 0];
  const normalizedMagnitude = Math.min(1, (magnitude - deadzone) / Math.max(1 - deadzone, 0.001));
  return [(x / magnitude) * normalizedMagnitude, (y / magnitude) * normalizedMagnitude];
}

export function isEditableInputTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as Partial<HTMLElement>;
  const tagName = element.tagName?.toLowerCase();
  return element.isContentEditable === true
    || tagName === "input"
    || tagName === "textarea"
    || tagName === "select"
    || tagName === "button";
}

function describeFocusedElement(element: Element | null): string {
  if (!element) return "NONE";
  const id = element.id ? `#${element.id}` : "";
  const classes = element.classList.length > 0 ? `.${[...element.classList].join(".")}` : "";
  return `${element.tagName.toLowerCase()}${id}${classes}`;
}

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}
