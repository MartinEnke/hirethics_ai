// frontend/src/utils/mockStorage.ts
import type { ReportPayload } from "../types/report";

const recentKey = "recentBatches";
const reportKey = (id: string) => `report:${id}`;

export function saveMockReport(report: ReportPayload) {
  try {
    localStorage.setItem(reportKey(report.batch_id), JSON.stringify(report));

    const recent = JSON.parse(localStorage.getItem(recentKey) || "[]") as string[];
    const updated = [report.batch_id, ...recent.filter(b => b !== report.batch_id)].slice(0, 10);
    localStorage.setItem(recentKey, JSON.stringify(updated));
  } catch {}
}

export function loadMockReport(batchId: string): ReportPayload | null {
  try {
    const raw = localStorage.getItem(reportKey(batchId));
    return raw ? (JSON.parse(raw) as ReportPayload) : null;
  } catch {
    return null;
  }
}
