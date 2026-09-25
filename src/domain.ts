import type { Borehole, Layer, StoreData } from "./types";

// 固定岩性分类，用于录入下拉与筛选；颜色为看板上的分类标识色
export const CATEGORIES = [
  "黏土",
  "粉质黏土",
  "粉砂",
  "细砂",
  "中粗砂",
  "卵石",
  "强风化岩",
  "中风化岩",
] as const;

export const CATEGORY_COLORS: Record<string, string> = {
  黏土: "#a16207",
  粉质黏土: "#b45309",
  粉砂: "#ca8a04",
  细砂: "#65a30d",
  中粗砂: "#0f766e",
  卵石: "#7c3aed",
  强风化岩: "#be123c",
  中风化岩: "#334155",
};

export const SOIL_COLORS = ["褐黄", "灰黄", "棕红", "灰白", "深灰", "杂色"];
export const SOIL_STATES = ["流塑", "软塑", "可塑", "硬塑", "稍密", "中密", "密实", "风化"];

export const STORAGE_KEY = "geo-borehole-log-v1";

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---------- 数值解析 ----------

const numRe = /^-?\d+(\.\d+)?$/;

export function parseNum(raw: string): number | null {
  const v = raw.trim();
  if (v === "" || !numRe.test(v)) return null;
  return Number(v);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------- 排序与邻层 ----------

export function sortedLayers(hole: Borehole): Layer[] {
  return [...hole.layers].sort((a, b) => a.top - b.top);
}

export function layerNeighbors(
  hole: Borehole,
  layerId: string | null
): { prevBottom: number; nextTop: number | null; ordered: Layer[] } {
  const ordered = sortedLayers(hole);
  // 编辑时以自身当前深度定位；新增时默认接在最深处之后
  const self = layerId ? ordered.find((l) => l.id === layerId) ?? null : null;
  if (self) {
    const idx = ordered.indexOf(self);
    const prev = idx > 0 ? ordered[idx - 1] : null;
    const next = idx < ordered.length - 1 ? ordered[idx + 1] : null;
    return { prevBottom: prev ? prev.bottom : 0, nextTop: next ? next.top : null, ordered };
  }
  const last = ordered[ordered.length - 1];
  return {
    prevBottom: last ? last.bottom : 0,
    nextTop: null,
    ordered,
  };
}

// 返回按深度的第一个空缺层段 [start, end]；已到孔底返回 null。
// 允许删除中间分层后回填：缺口之上存在层底为 start 的层，之下存在层顶为 end 的层。
export function findGap(
  hole: Borehole
): { start: number; end: number; nextTop: number | null } | null {
  const ordered = sortedLayers(hole);
  let cursor = 0;
  for (const l of ordered) {
    if (round2(l.top) > round2(cursor) && round2(cursor) < round2(hole.depth)) {
      return { start: cursor, end: Math.min(l.top, hole.depth), nextTop: l.top };
    }
    cursor = Math.max(cursor, l.bottom);
  }
  if (round2(cursor) < round2(hole.depth)) {
    return { start: cursor, end: hole.depth, nextTop: null };
  }
  return null;
}

// ---------- 错误结构 ----------

export type Errors<T extends string> = Partial<Record<T, string>>;

// ---------- 钻孔校验 ----------

export interface HoleFormValues {
  code: string;
  depth: string;
  waterLevel: string;
  location: string;
}

export function validateHole(
  v: HoleFormValues,
  existing: Borehole[],
  selfId: string | null
): Errors<"code" | "depth" | "waterLevel"> {
  const e: Errors<"code" | "depth" | "waterLevel"> = {};
  const code = v.code.trim();

  if (!code) {
    e.code = "请填写钻孔编号";
  } else if (existing.some((h) => h.code === code && h.id !== selfId)) {
    e.code = `已存在编号为 ${code} 的钻孔`;
  }

  const depth = parseNum(v.depth);
  if (depth === null) {
    e.depth = "孔深需为数字，单位 m";
  } else if (depth <= 0) {
    e.depth = "孔深必须大于 0";
  } else {
    const self = selfId ? existing.find((h) => h.id === selfId) : null;
    const deepest = self
      ? self.layers.reduce((m, l) => Math.max(m, l.bottom), 0)
      : 0;
    if (deepest > 0 && round2(depth) < round2(deepest)) {
      e.depth = `孔深不能小于已录分层的最大深度 ${round2(deepest)} m`;
    }
  }

  if (v.waterLevel.trim() !== "") {
    const wl = parseNum(v.waterLevel);
    if (wl === null) {
      e.waterLevel = "水位需为数字，单位 m";
    } else if (wl <= 0) {
      e.waterLevel = "水位埋深必须大于 0";
    } else if (depth !== null && depth > 0 && wl > depth) {
      e.waterLevel = `水位 ${wl} m 超出孔深 ${round2(depth)} m，须落在当前孔段内`;
    }
  }

  return e;
}

// ---------- 分层校验 ----------

export interface LayerFormValues {
  top: string;
  bottom: string;
  category: string;
  color: string;
  state: string;
  description: string;
  sptDepth: string;
  sptN: string;
}

export function validateLayer(
  hole: Borehole,
  v: LayerFormValues,
  selfId: string | null
): Errors<"top" | "bottom" | "category" | "sptDepth" | "sptN"> {
  const e: Errors<"top" | "bottom" | "category" | "sptDepth" | "sptN"> = {};
  const others = sortedLayers(hole).filter((l) => l.id !== selfId);

  const top = parseNum(v.top);
  if (top === null) {
    e.top = "层顶需为数字，单位 m";
  } else if (top < 0) {
    e.top = "层顶不能小于 0";
  } else {
    // 新增层顶必须接上上一层底（地表 0，或某层的层底）
    const validTops = [0, ...others.map((l) => l.bottom)];
    if (!validTops.some((t) => Math.abs(t - top) < 1e-9)) {
      // 层顶落在某层内部时提示该层层底；否则提示当前最深层底
      const nextStart = validTops
        .filter((t) => t >= top - 1e-9)
        .sort((a, b) => a - b)[0];
      const expected = nextStart ?? Math.max(...validTops);
      e.top = `层顶须接上一层底 ${round2(expected)} m`;
    }
  }

  const bottom = parseNum(v.bottom);
  if (bottom === null) {
    e.bottom = "层底需为数字，单位 m";
  } else if (top !== null && bottom <= top) {
    e.bottom = "层底必须大于层顶";
  } else if (bottom > hole.depth + 1e-9) {
    e.bottom = `层底不能超过孔深 ${round2(hole.depth)} m`;
  } else if (top !== null) {
    // 层底不能越过下一层的层顶（与其他分层不得重叠）
    const next = others.find((l) => l.top > top + 1e-9);
    if (next && bottom > next.top + 1e-9) {
      e.bottom = `层底不能进入下一层（下一层顶 ${round2(next.top)} m）`;
    }
  }

  if (!v.category) e.category = "请选择岩性分类";

  const sptD = v.sptDepth.trim();
  const sptN = v.sptN.trim();

  if (sptD !== "" || sptN !== "") {
    const d = parseNum(sptD);
    if (sptD === "") {
      e.sptDepth = "已填击数，须同时填写标贯点深度";
    } else if (d === null) {
      e.sptDepth = "标贯深度需为数字，单位 m";
    } else if (top !== null && bottom !== null && bottom > top) {
      if (d < top || d > bottom) {
        e.sptDepth = `标贯点须落在本层段 ${round2(top)}–${round2(bottom)} m 内`;
      }
    }

    if (sptN === "") {
      e.sptN = "已填深度，须同时填写标贯击数";
    } else if (!/^\d+$/.test(sptN)) {
      e.sptN = "击数须为正整数";
    } else if (Number(sptN) <= 0) {
      e.sptN = "击数须大于 0";
    }
  }

  return e;
}

// ---------- 已存分层的连续性提示（非表单阻断） ----------

export interface LayerIssue {
  gap?: string;
  beyondHole?: string;
}

export function layerIssue(hole: Borehole, layer: Layer, index: number): LayerIssue {
  const ordered = sortedLayers(hole);
  const issue: LayerIssue = {};
  const prev = index > 0 ? ordered[index - 1] : null;
  const expectedTop = prev ? prev.bottom : 0;

  if (round2(layer.top) !== round2(expectedTop)) {
    issue.gap = `层顶 ${round2(layer.top)} m 未接上一层底 ${round2(expectedTop)} m`;
  }
  if (round2(layer.bottom) > round2(hole.depth)) {
    issue.beyondHole = `层底 ${round2(layer.bottom)} m 超过孔深 ${round2(hole.depth)} m`;
  }
  return issue;
}

// ---------- 本层段内水位 / 标贯归属 ----------

export function isWaterInLayer(layer: Layer, waterLevel: number | null): boolean {
  return (
    waterLevel !== null &&
    round2(waterLevel) >= round2(layer.top) &&
    round2(waterLevel) <= round2(layer.bottom)
  );
}

// ---------- 本机存储 ----------

export function loadStore(): StoreData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as StoreData;
      if (Array.isArray(data.holes)) return data;
    }
  } catch {
    // 存储损坏时回退到示例数据
  }
  return { holes: seedHoles() };
}

export function saveStore(data: StoreData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 隐私模式等场景下静默失败，不影响本次使用
  }
}

// ---------- 首次打开时的示例孔（关闭重开后保留，不会重复灌入） ----------

function seedHoles(): Borehole[] {
  const now = Date.now();
  return [
    {
      id: uid(),
      code: "ZK-18",
      depth: 22.6,
      waterLevel: 3.4,
      location: "场地东侧，主楼角点",
      createdAt: now - 1000 * 60 * 60 * 26,
      layers: [
        {
          id: uid(),
          top: 0,
          bottom: 2.1,
          category: "粉质黏土",
          color: "褐黄",
          state: "可塑",
          description: "含植物根系，切面稍有光泽",
          sptDepth: null,
          sptN: null,
        },
        {
          id: uid(),
          top: 2.1,
          bottom: 8.5,
          category: "黏土",
          color: "棕红",
          state: "硬塑",
          description: "干强度高，韧性高",
          sptDepth: 4.2,
          sptN: 12,
        },
        {
          id: uid(),
          top: 8.5,
          bottom: 22.6,
          category: "强风化岩",
          color: "深灰",
          state: "风化",
          description: "泥岩，岩芯破碎，采取率约 62%",
          sptDepth: 10.0,
          sptN: 31,
        },
      ],
    },
    {
      id: uid(),
      code: "ZK-21",
      depth: 31.2,
      waterLevel: 5.6,
      location: "场地西侧，裙楼位置",
      createdAt: now - 1000 * 60 * 60 * 5,
      layers: [
        {
          id: uid(),
          top: 0,
          bottom: 1.2,
          category: "粉质黏土",
          color: "灰黄",
          state: "软塑",
          description: "表层填土，夹碎石",
          sptDepth: null,
          sptN: null,
        },
        {
          id: uid(),
          top: 1.2,
          bottom: 6.8,
          category: "粉砂",
          color: "灰黄",
          state: "稍密",
          description: "颗粒均匀，含云母片，水位以下饱水",
          sptDepth: 5.5,
          sptN: 9,
        },
        {
          id: uid(),
          top: 6.8,
          bottom: 15.4,
          category: "卵石",
          color: "杂色",
          state: "中密",
          description: "粒径 20–60mm，夹中粗砂，取样困难",
          sptDepth: 8.0,
          sptN: 24,
        },
        {
          id: uid(),
          top: 15.4,
          bottom: 31.2,
          category: "中风化岩",
          color: "深灰",
          state: "风化",
          description: "砂岩，岩芯柱状，锤击声脆",
          sptDepth: null,
          sptN: null,
        },
      ],
    },
  ];
}
