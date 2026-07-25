import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InputController,
  isEditableInputTarget,
  normalizeStick,
  resolveGamepadInput,
  type InputControllerOptions,
} from "./InputController";

class FakeWindow extends EventTarget {}

class FakeDocument extends EventTarget {
  pointerLockElement: Element | null = null;
  visibilityState: DocumentVisibilityState = "visible";
  activeElement: Element | null = null;

  exitPointerLock(): void {
    this.pointerLockElement = null;
  }
}

class FakeCanvas extends EventTarget {
  readonly tagName = "CANVAS";

  requestPointerLock(): Promise<void> {
    return Promise.resolve();
  }
}

function keyboardEvent(type: "keydown" | "keyup", code: string, repeat = false): Event {
  const event = new Event(type, { cancelable: true });
  Object.defineProperties(event, {
    code: { value: code },
    repeat: { value: repeat },
  });
  return event;
}

function gamepad(
  axes: readonly number[] = [0, 0, 0, 0],
  pressedButtons: readonly number[] = [],
): Gamepad {
  return {
    axes: [...axes],
    buttons: Array.from({ length: 16 }, (_, index) => ({
      pressed: pressedButtons.includes(index),
      touched: pressedButtons.includes(index),
      value: pressedButtons.includes(index) ? 1 : 0,
    })),
    connected: true,
    id: "Mock Standard Controller",
    index: 0,
    mapping: "standard",
    timestamp: 1,
    vibrationActuator: null,
    hapticActuators: [],
  } as unknown as Gamepad;
}

function createController(gamepads: ArrayLike<Gamepad | null> = []): {
  controller: InputController;
  window: FakeWindow;
  document: FakeDocument;
  canvas: FakeCanvas;
  onWheelZoom: ReturnType<typeof vi.fn>;
  setWorldInputAllowed(value: boolean): void;
} {
  const fakeWindow = new FakeWindow();
  const fakeDocument = new FakeDocument();
  const fakeCanvas = new FakeCanvas();
  let worldInputAllowed = true;
  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("document", fakeDocument);
  vi.stubGlobal("navigator", { getGamepads: () => gamepads });
  const onWheelZoom = vi.fn();
  const options: InputControllerOptions = {
    onLook: vi.fn(),
    onWheelZoom,
    isWorldInputAllowed: () => worldInputAllowed,
    getModalState: () => worldInputAllowed ? "none" : "settings",
  };
  return {
    controller: new InputController(fakeCanvas as unknown as HTMLCanvasElement, options),
    window: fakeWindow,
    document: fakeDocument,
    canvas: fakeCanvas,
    onWheelZoom,
    setWorldInputAllowed: (value) => {
      worldInputAllowed = value;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("InputController keyboard physical state", () => {
  it.each([
    ["KeyW", 0, 1],
    ["ArrowUp", 0, 1],
    ["KeyS", 0, -1],
    ["ArrowDown", 0, -1],
    ["KeyA", -1, 0],
    ["ArrowLeft", -1, 0],
    ["KeyD", 1, 0],
    ["ArrowRight", 1, 0],
  ])("maps %s to raw movement", (code, rawX, rawY) => {
    const fixture = createController();
    fixture.window.dispatchEvent(keyboardEvent("keydown", code));
    expect(fixture.controller.sampleMovement(0)).toMatchObject({ rawX, rawY });
    fixture.controller.dispose();
  });

  it("keeps forward active when one of two aliases is released", () => {
    const fixture = createController();
    fixture.window.dispatchEvent(keyboardEvent("keydown", "KeyW"));
    fixture.window.dispatchEvent(keyboardEvent("keydown", "ArrowUp"));
    fixture.window.dispatchEvent(keyboardEvent("keyup", "ArrowUp"));
    expect(fixture.controller.sampleMovement(0).rawY).toBe(1);
    fixture.controller.dispose();
  });

  it("keeps left and sprint active while their second aliases remain held", () => {
    const fixture = createController();
    fixture.window.dispatchEvent(keyboardEvent("keydown", "KeyA"));
    fixture.window.dispatchEvent(keyboardEvent("keydown", "ArrowLeft"));
    fixture.window.dispatchEvent(keyboardEvent("keyup", "KeyA"));
    fixture.window.dispatchEvent(keyboardEvent("keydown", "ShiftLeft"));
    fixture.window.dispatchEvent(keyboardEvent("keydown", "ShiftRight"));
    fixture.window.dispatchEvent(keyboardEvent("keyup", "ShiftLeft"));
    expect(fixture.controller.sampleMovement(0)).toMatchObject({ rawX: -1, sprint: true });
    fixture.controller.dispose();
  });

  it("clears held input on blur or visibility loss and blocks world commands while a modal owns input", () => {
    const fixture = createController();
    fixture.window.dispatchEvent(keyboardEvent("keydown", "KeyW"));
    fixture.window.dispatchEvent(new Event("blur"));
    expect(fixture.controller.sampleMovement(0).rawY).toBe(0);
    fixture.window.dispatchEvent(keyboardEvent("keydown", "KeyW"));
    fixture.document.visibilityState = "hidden";
    fixture.document.dispatchEvent(new Event("visibilitychange"));
    expect(fixture.controller.sampleMovement(0).rawY).toBe(0);
    fixture.document.visibilityState = "visible";
    fixture.window.dispatchEvent(keyboardEvent("keydown", "KeyW"));
    fixture.window.dispatchEvent(keyboardEvent("keydown", "KeyE"));
    fixture.setWorldInputAllowed(false);
    expect(fixture.controller.sampleMovement(0)).toMatchObject({ rawY: 0, worldZ: 0, interactPressed: false });
    fixture.setWorldInputAllowed(true);
    expect(fixture.controller.sampleMovement(0).interactPressed).toBe(false);
    fixture.controller.dispose();
  });

  it("recognizes editable controls as world-input exclusions", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT", "BUTTON"]) {
      expect(isEditableInputTarget({ tagName } as unknown as EventTarget)).toBe(true);
    }
    expect(isEditableInputTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isEditableInputTarget({ tagName: "CANVAS" } as unknown as EventTarget)).toBe(false);

    const fixture = createController();
    const editableKey = keyboardEvent("keydown", "KeyW");
    Object.defineProperty(editableKey, "target", { value: { tagName: "INPUT" } });
    fixture.window.dispatchEvent(editableKey);
    expect(fixture.controller.sampleMovement(0).rawY).toBe(0);
    fixture.controller.dispose();
  });

  it("captures wheel zoom only during canvas gameplay", () => {
    const fixture = createController();
    const gameplayWheel = new Event("wheel", { cancelable: true });
    Object.defineProperty(gameplayWheel, "deltaY", { value: -120 });
    fixture.canvas.dispatchEvent(gameplayWheel);
    expect(gameplayWheel.defaultPrevented).toBe(true);
    expect(fixture.onWheelZoom).toHaveBeenCalledWith(-120);

    fixture.setWorldInputAllowed(false);
    const modalWheel = new Event("wheel", { cancelable: true });
    Object.defineProperty(modalWheel, "deltaY", { value: 120 });
    fixture.canvas.dispatchEvent(modalWheel);
    expect(modalWheel.defaultPrevented).toBe(false);
    expect(fixture.onWheelZoom).toHaveBeenCalledTimes(1);
    fixture.controller.dispose();
  });
});

describe("standard Gamepad input", () => {
  it("applies a radial deadzone and normalizes stick magnitude", () => {
    expect(normalizeStick(0.1, 0.1)).toEqual([0, 0]);
    const [x, y] = normalizeStick(1, 1);
    expect(Math.hypot(x, y)).toBeCloseTo(1);
  });

  it("maps left/right sticks, buttons, D-pad, and shoulders", () => {
    const resolved = resolveGamepadInput(
      [gamepad([0.8, -0.6, -0.7, 0.5], [0, 1, 4, 5, 9, 10])],
    );
    expect(resolved.rawX).toBeGreaterThan(0);
    expect(resolved.rawY).toBeGreaterThan(0);
    expect(resolved.lookX).toBeLessThan(0);
    expect(resolved.heldActions).toEqual(expect.objectContaining(new Set([
      "move-forward",
      "move-right",
      "interact",
      "cancel",
      "zoom-in",
      "zoom-out",
      "pause",
      "sprint",
    ])));

    const dpad = resolveGamepadInput([gamepad([0, 0, 0, 0], [12, 14])]);
    expect(dpad).toMatchObject({ rawX: -1, rawY: 1 });
  });

  it("emits button edges once and clears state on disconnect", () => {
    const first = resolveGamepadInput([gamepad([0, 0, 0, 0], [0, 1, 9])]);
    expect(first.pressedActions).toEqual(new Set(["interact", "cancel", "pause"]));
    const held = resolveGamepadInput([gamepad([0, 0, 0, 0], [0, 1, 9])], first.buttonState);
    expect(held.pressedActions.size).toBe(0);
    const disconnected = resolveGamepadInput([], held.buttonState);
    expect(disconnected.connected).toEqual([]);
    expect(disconnected.heldActions.size).toBe(0);
  });

  it("unifies keyboard and gamepad movement in the controller", () => {
    const fixture = createController([gamepad([1, 0, 0, 0])]);
    fixture.controller.consumeFrameCommands();
    fixture.window.dispatchEvent(keyboardEvent("keydown", "KeyW"));
    const movement = fixture.controller.sampleMovement(0);
    expect(movement.rawX).toBeGreaterThan(0);
    expect(movement.rawY).toBeGreaterThan(0);
    expect(Math.hypot(movement.rawX, movement.rawY)).toBeCloseTo(1);
    fixture.controller.dispose();
  });
});
