import type { Borehole, FieldErrors, Layer, SptRecord } from "./types";

// 深度比较容差，规避 3.40000000001 一类浮点误差
export const EPS = 1e-6;

// 可筛选的岩性关键字（命中描述或分类名称即归入该类）
export const FILTER_OPTIONS = ["黏土", "粉砂", "卵石", "强风化"];

let seq = 0;
export function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

// 层顶深度 = 上一层底，首层为 0（保证分层首尾相接）
export function layerTop(layers: Layer[], index: number): number {
  return index === 0 ? 0 : layers[index - 1].bottom;
}

export function fmtDepth(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${Number(v.toFixed(2))} m`;
}

export function parseNum(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

// ---- 孔级校验：编号、孔深、水位 ------------------------------------------------

export function validateHole(
  draft: { code: string; totalDepth: string; waterLevel: string },
  existing: Borehole[],
  editingId?: string
): { values: { code: string; totalDepth: number; waterLevel: number | null }; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const code = draft.code.trim();
  if (!code) {
    errors.code = "请填写钻孔编号";
  } else if (
    existing.some(
      (b) => b.id !== editingId && b.code.trim().toLowerCase() === code.toLowerCase()
    )
  ) {
    errors.code = "该编号已存在，钻孔编号不能重复";
  } else if (code.length > 20) {
    errors.code = "编号不超过 20 个字符";
  }

  const totalDepth = parseNum(draft.totalDepth);
  if (totalDepth === null) {
    errors.totalDepth = "请填写孔深";
  } else if (totalDepth <= 0) {
    errors.totalDepth = "孔深必须大于 0";
  }

  let waterLevel: number | null = null;
  const waterRaw = draft.waterLevel.trim();
  if (waterRaw !== "") {
    waterLevel = parseNum(draft.waterLevel);
    if (waterLevel === null) {
      errors.waterLevel = "水位需为数字";
    } else if (waterLevel < 0) {
      errors.waterLevel = "水位埋深不能为负值";
    } else if (totalDepth !== null && totalDepth > 0 && waterLevel - totalDepth > EPS) {
      errors.waterLevel = `水位 ${waterLevel} m 超过孔深 ${totalDepth} m，须落在当前孔段内`;
    }
  }

  return { values: { code, totalDepth: totalDepth ?? NaN, waterLevel }, errors };
}

// 调整孔深/水位后，复核已有数据是否仍在当前孔段内
export function auditHole(hole: Borehole): FieldErrors {
  const errors: FieldErrors = {};
  const last = hole.layers[hole.layers.length - 1];
  if (hole.waterLevel !== null && hole.waterLevel - hole.totalDepth > EPS) {
    errors.waterLevel = `水位 ${fmtDepth(hole.waterLevel)} 已超过修改后的孔深 ${fmtDepth(
      hole.totalDepth
    )}`;
  }
  if (last && last.bottom - hole.totalDepth > EPS) {
    errors.totalDepth = `孔深小于已录最深层底 ${fmtDepth(last.bottom)}，分层超出当前孔段`;
  }
  return errors;
}

// ---- 分层校验：新层底必须接上上一层底、且不超过孔深 ---------------------------

export interface LayerContext {
  top: number; // 由上一层底推得，本层顶固定
  totalDepth: number;
  nextTop?: number; // 编辑中间层时，不得越过下一层顶
}

export function validateLayer(
  draft: {
    bottom: string;
    lithology: string;
    density: string;
    color: string;
    description: string;
  },
  ctx: LayerContext
): {
  values: Omit<Layer, "id" | "spt">;
  errors: FieldErrors;
} {
  const errors: FieldErrors = {};
  const bottom = parseNum(draft.bottom);

  if (bottom === null) {
    errors.bottom = "请填写层底深度";
  } else if (bottom - ctx.top <= EPS) {
    errors.bottom = `层底必须大于层顶 ${fmtDepth(ctx.top)}，新层顶已接上上一层底`;
  } else if (ctx.nextTop !== undefined && bottom - ctx.nextTop > EPS) {
    errors.bottom = `层底不能越过下一层顶 ${fmtDepth(ctx.nextTop)}，请先调整后续分层`;
  } else if (bottom - ctx.totalDepth > EPS) {
    errors.bottom = `层底 ${bottom} m 超过孔深 ${ctx.totalDepth} m，须落在当前孔段内`;
  }

  const lithology = draft.lithology.trim();
  if (!lithology) errors.lithology = "请填写或选择岩性分类";
  else if (lithology.length > 30) errors.lithology = "分类名称不超过 30 字";

  const density = draft.density.trim();
  if (!density) errors.density = "请填写状态/密实度，如 可塑、中密";
  else if (density.length > 20) errors.density = "不超过 20 字";

  const color = draft.color.trim();
  if (color.length > 20) errors.color = "土色不超过 20 字";
  const description = draft.description.trim();
  if (description.length > 500) errors.description = "描述不超过 500 字";

  return {
    values: {
      bottom: bottom ?? NaN,
      lithology,
      density,
      color,
      description,
    },
    errors,
  };
}

// ---- 标贯校验：深度落在所属分层孔段内、击数为正整数 ---------------------------

export function validateSpt(
  draft: { depth: string; n: string },
  seg: { top: number; bottom: number }
): { values: { depth: number; n: number }; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const depth = parseNum(draft.depth);
  if (depth === null) {
    errors.depth = "请填写标贯点深度";
  } else if (depth < seg.top - EPS) {
    errors.depth = `标贯深度 ${depth} m 浅于本层顶 ${fmtDepth(seg.top)}，须落在当前孔段内`;
  } else if (depth > seg.bottom + EPS) {
    errors.depth = `标贯深度 ${depth} m 深于本层底 ${fmtDepth(seg.bottom)}，须落在当前孔段内`;
  }

  const n = parseNum(draft.n);
  if (n === null) {
    errors.n = "请填写标贯击数";
  } else if (n <= 0 || !Number.isInteger(n)) {
    errors.n = "击数须为正整数";
  } else if (n > 200) {
    errors.n = "击数超过 200，超出合理范围";
  }

  return { values: { depth: depth ?? NaN, n: n ?? NaN }, errors };
}

export function sptInside(spt: SptRecord, seg: { top: number; bottom: number }): boolean {
  return spt.depth >= seg.top - EPS && spt.depth <= seg.bottom + EPS;
}

// ---- 岩性筛选：匹配分类名或描述中的关键字 --------------------------------------

export function layerMatches(layer: Layer, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const hay = `${layer.lithology} ${layer.description} ${layer.density}`;
  return keywords.some((k) => hay.includes(k));
}

// ---- 看板指标：随岩性筛选结果联动 ----------------------------------------------

export interface Metrics {
  footage: number; // 命中分层的累计厚度
  layerCount: number; // 命中分层数
  maxN: number | null; // 命中分层中的最高标贯击数
  waterMin: number | null; // 含命中分层的孔，其水位最浅/最深值
  waterMax: number | null;
}

export function computeMetrics(
  holes: Borehole[],
  keywords: string[]
): Metrics {
  let footage = 0;
  let layerCount = 0;
  let maxN: number | null = null;
  const waterValues: number[] = [];

  for (const hole of holes) {
    let holeHit = false;
    for (let i = 0; i < hole.layers.length; i++) {
      const layer = hole.layers[i];
      if (!layerMatches(layer, keywords)) continue;
      holeHit = true;
      layerCount += 1;
      footage += layer.bottom - layerTop(hole.layers, i);
      if (layer.spt && (maxN === null || layer.spt.n > maxN)) maxN = layer.spt.n;
    }
    if (holeHit && hole.waterLevel !== null) waterValues.push(hole.waterLevel);
  }

  return {
    footage: Number(footage.toFixed(2)),
    layerCount,
    maxN,
    waterMin: waterValues.length ? Math.min(...waterValues) : null,
    waterMax: waterValues.length ? Math.max(...waterValues) : null,
  };
}

// ---- 首启示例数据：覆盖全部筛选项，关掉重开后不覆盖本机记录 --------------------

export function seedHoles(): Borehole[] {
  const now = Date.now();
  return [
    {
      id: uid("bh"),
      code: "ZK-18",
      totalDepth: 22.6,
      waterLevel: 3.4,
      createdAt: now,
      layers: [
        {
          id: uid("ly"),
          bottom: 3.2,
          lithology: "粉质黏土",
          density: "可塑",
          color: "褐黄",
          description: "粉质黏土，干强度中等，韧性中等",
          spt: { id: uid("spt"), depth: 2.0, n: 6 },
        },
        {
          id: uid("ly"),
          bottom: 9.8,
          lithology: "粉砂",
          density: "稍密",
          color: "灰黄",
          description: "粉砂夹薄层粉土，饱和",
          spt: { id: uid("spt"), depth: 6.5, n: 12 },
        },
        {
          id: uid("ly"),
          bottom: 22.6,
          lithology: "强风化泥岩",
          density: "硬塑",
          color: "紫红",
          description: "强风化泥岩，岩芯破碎，采取率约62%",
          spt: { id: uid("spt"), depth: 15.0, n: 31 },
        },
      ],
    },
    {
      id: uid("bh"),
      code: "ZK-21",
      totalDepth: 31.2,
      waterLevel: 7.5,
      createdAt: now + 1,
      layers: [
        {
          id: uid("ly"),
          bottom: 6.0,
          lithology: "粉土",
          density: "稍密",
          color: "浅灰",
          description: "粉土，摇振反应中等",
          spt: null,
        },
        {
          id: uid("ly"),
          bottom: 31.2,
          lithology: "卵石",
          density: "中密",
          color: "杂色",
          description: "卵石层，粒径40-80mm，夹中粗砂，取样困难",
          spt: { id: uid("spt"), depth: 20.0, n: 28 },
        },
      ],
    },
    {
      id: uid("bh"),
      code: "ZK-24",
      totalDepth: 18.4,
      waterLevel: null,
      createdAt: now + 2,
      layers: [
        {
          id: uid("ly"),
          bottom: 4.5,
          lithology: "黏土",
          density: "硬塑",
          color: "棕红",
          description: "黏土，含铁锰结核，干强度高",
          spt: { id: uid("spt"), depth: 3.0, n: 11 },
        },
        {
          id: uid("ly"),
          bottom: 18.4,
          lithology: "强风化砂岩",
          density: "密实",
          color: "灰紫",
          description: "强风化砂岩，岩芯呈短柱状",
          spt: { id: uid("spt"), depth: 12.0, n: 42 },
        },
      ],
    },
  ];
}
