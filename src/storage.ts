import type { Borehole } from "./types";
import { seedHoles } from "./domain";

const HOLES_KEY = "hxwl-03.boreholes.v1";
const SELECTED_KEY = "hxwl-03.selectedHole.v1";
const FILTERS_KEY = "hxwl-03.filters.v1";

// 记录全部留在本机 localStorage，关掉页面再打开仍在
export function loadHoles(): Borehole[] {
  try {
    const raw = localStorage.getItem(HOLES_KEY);
    if (!raw) {
      const seeded = seedHoles();
      localStorage.setItem(HOLES_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Borehole[]) : [];
  } catch {
    return [];
  }
}

export function saveHoles(holes: Borehole[]): void {
  try {
    localStorage.setItem(HOLES_KEY, JSON.stringify(holes));
  } catch {
    // 存储已满或被禁用时静默失败，不影响当前会话
  }
}

export function loadSelectedId(): string | null {
  return localStorage.getItem(SELECTED_KEY);
}

export function saveSelectedId(id: string | null): void {
  if (id) localStorage.setItem(SELECTED_KEY, id);
  else localStorage.removeItem(SELECTED_KEY);
}

export function loadFilters(): string[] {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveFilters(keywords: string[]): void {
  localStorage.setItem(FILTERS_KEY, JSON.stringify(keywords));
}
