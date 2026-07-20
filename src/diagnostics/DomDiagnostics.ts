export interface DomDiagnostics {
  readonly totalNodes: number;
  readonly persistentHudNodes: number;
  readonly modalNodes: number;
  readonly transientFeedbackNodes: number;
  readonly resultHistoryNodes: number;
}

export function measureDomDiagnostics(documentRoot: Document = document): DomDiagnostics {
  return {
    totalNodes: documentRoot.querySelectorAll("*").length,
    persistentHudNodes: countVisibleSubtrees(documentRoot, [".ui-layer", ".squad-panel:not([hidden])", ".qa-navigation"]),
    modalNodes: countVisibleSubtrees(documentRoot, [
      ".pause-overlay.is-visible",
      ".expedition-overlay.is-visible",
      ".mission-result-overlay.is-visible",
    ]),
    transientFeedbackNodes: countVisibleSubtrees(documentRoot, [
      ".system-notice.is-visible",
      ".gate-scan-feedback.is-visible",
    ]),
    resultHistoryNodes: documentRoot.querySelectorAll(".mission-result-frame").length,
  };
}

function countVisibleSubtrees(documentRoot: Document, selectors: readonly string[]): number {
  const nodes = new Set<Element>();
  for (const selector of selectors) {
    for (const root of documentRoot.querySelectorAll(selector)) {
      nodes.add(root);
      for (const child of root.querySelectorAll("*")) nodes.add(child);
    }
  }
  return nodes.size;
}
