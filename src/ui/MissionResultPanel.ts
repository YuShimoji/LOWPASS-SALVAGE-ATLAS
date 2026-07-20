import type { FixedMissionResult } from "../game/mission/MissionSession";

export class MissionResultPanel {
  private readonly overlay = document.createElement("section");
  private readonly panel = document.createElement("div");

  constructor(mount: HTMLElement, private readonly onReturnToShip: () => void) {
    this.overlay.className = "mission-result-overlay";
    this.overlay.setAttribute("aria-hidden", "true");
    this.panel.className = "mission-result-panel";
    this.overlay.append(this.panel);
    mount.append(this.overlay);
  }

  show(result: FixedMissionResult): void {
    const complete = result.outcome === "complete";
    this.panel.innerHTML = `
      <div class="mission-result-frame" role="dialog" aria-modal="true" aria-labelledby="mission-result-title">
        <span class="panel-kicker">HABITAT RETURN LINK / SESSION SEALED</span>
        <div class="mission-result-stamp ${complete ? "is-complete" : "is-partial"}">${complete ? "COMPLETE" : "PARTIAL"}</div>
        <h2 id="mission-result-title">遠征回収報告</h2>
        <dl class="manifest-meta">
          <div><dt>MISSION</dt><dd>${escapeHtml(result.missionId)}</dd></div>
          <div><dt>SESSION</dt><dd>${escapeHtml(result.sessionId)}</dd></div>
          <div><dt>RECOVERED</dt><dd>${result.recoveredResourceIds.length} RESOURCE(S)</dd></div>
          <div><dt>ELAPSED</dt><dd>${result.elapsedSeconds.toFixed(1)} SEC</dd></div>
          <div><dt>LEFT BEHIND</dt><dd>${result.leftBehindEquipmentIds.length || "NONE"}</dd></div>
          <div><dt>CONSUMED</dt><dd>${result.consumedEquipmentIds.length || "NONE"}</dd></div>
        </dl>
        <p>${complete ? "全必須資源を抽出しました。" : "確保済み資源だけを持ち帰ります。未回収資源は現地に残ります。"}</p>
        <p class="manifest-note">現地ショッピングカートはゲート対象外のため回収されません。</p>
        ${result.leftBehindEquipmentIds.length > 0 ? `<p class="manifest-note">置き去り装備: ${result.leftBehindEquipmentIds.map(escapeHtml).join(" / ")}</p>` : ""}
        ${result.alliedMachineOutcomes.map((outcome) => `<p class="manifest-note">PORTER GATE REJECTED // ${escapeHtml(outcome.machineId)} · ${escapeHtml(outcome.disposition)} · ASSISTED ${outcome.assistedItemIds.length}</p>`).join("")}
        <button type="button" class="resume-button" data-return-to-ship>飛空居住船へ帰還</button>
      </div>
    `;
    this.overlay.classList.add("is-visible");
    this.overlay.setAttribute("aria-hidden", "false");
    this.panel.querySelector<HTMLButtonElement>("[data-return-to-ship]")?.addEventListener("click", this.onReturnToShip, { once: true });
  }

  hide(): void {
    this.overlay.classList.remove("is-visible");
    this.overlay.setAttribute("aria-hidden", "true");
  }

  dispose(): void {
    this.overlay.remove();
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character,
  );
}
