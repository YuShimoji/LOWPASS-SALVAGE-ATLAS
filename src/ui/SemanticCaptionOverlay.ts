import type { SemanticCueId } from "../render/audio/MachineFeedbackAudio";

export class SemanticCaptionOverlay {
  private readonly root = document.createElement("div");
  private hideTimer = 0;

  constructor(mount: HTMLElement) {
    this.root.className = "semantic-cue-caption";
    this.root.setAttribute("role", "status");
    this.root.setAttribute("aria-live", "assertive");
    mount.append(this.root);
  }

  show(cueId: SemanticCueId, label: string): void {
    window.clearTimeout(this.hideTimer);
    this.root.dataset.cue = cueId;
    this.root.textContent = label;
    this.root.classList.add("is-visible");
    this.hideTimer = window.setTimeout(() => this.root.classList.remove("is-visible"), 1600);
  }

  dispose(): void {
    window.clearTimeout(this.hideTimer);
    this.root.remove();
  }
}
