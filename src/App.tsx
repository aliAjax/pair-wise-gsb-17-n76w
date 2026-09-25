import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import type { Borehole, Layer } from "./types";
import {
  FILTER_OPTIONS,
  auditHole,
  computeMetrics,
  fmtDepth,
  layerMatches,
  layerTop,
  sptInside,
  uid,
} from "./domain";
import {
  loadFilters,
  loadHoles,
  loadSelectedId,
  saveFilters,
  saveHoles,
  saveSelectedId,
} from "./storage";
import {
  emptyLayerDraft,
  HoleFormModal,
  LayerForm,
  SptForm,
  type HoleDraft,
  type LayerDraft,
} from "./components";

type HoleModalState =
  | { mode: "create" }
  | { mode: "edit"; hole: Borehole }
  | null;

type LayerFormState =
  | { mode: "create" }
  | { mode: "edit"; layerId: string }
  | null;

export default function App() {
  const [holes, setHoles] = useState<Borehole[]>(() => loadHoles());
  const [selectedId, setSelectedId] = useState<string | null>(
    () => loadSelectedId()
  );
  const [filters, setFilters] = useState<string[]>(() => loadFilters());

  const [holeModal, setHoleModal] = useState<HoleModalState>(null);
  const [layerForm, setLayerForm] = useState<LayerFormState>(null);
  // 在某分层内展开的标贯表单
  const [sptFormLayerId, setSptFormLayerId] = useState<string | null>(null);

  useEffect(() => saveHoles(holes), [holes]);
  useEffect(() => saveSelectedId(selectedId), [selectedId]);
  useEffect(() => saveFilters(filters), [filters]);

  // 首次进入：优先恢复上次选中的孔，否则取第一口
  const selected = useMemo(() => {
    const found = holes.find((h) => h.id === selectedId) ?? null;
    return found ?? holes[0] ?? null;
  }, [holes, selectedId]);

  // 持久化的选中孔已不存在时（如数据被清空），对齐到当前第一口孔
  useEffect(() => {
    if ((selectedId === null || !holes.some((h) => h.id === selectedId)) && selected) {
      setSelectedId(selected.id);
    }
  }, [holes, selectedId, selected]);

  const metrics = useMemo(() => computeMetrics(holes, filters), [holes, filters]);

  // ---- 钻孔操作 ----------------------------------------------------------------

  const selectHole = (id: string) => {
    setSelectedId(id);
    setLayerForm(null);
    setSptFormLayerId(null);
  };

  const persistHole = (next: Borehole) =>
    setHoles((list) => list.map((h) => (h.id === next.id ? next : h)));

  const saveHoleFromModal = (v: {
    code: string;
    totalDepth: number;
    waterLevel: number | null;
  }) => {
    if (holeModal?.mode === "edit") {
      persistHole({
        ...holeModal.hole,
        code: v.code,
        totalDepth: v.totalDepth,
        waterLevel: v.waterLevel,
      });
    } else {
      const hole: Borehole = {
        id: uid("bh"),
        code: v.code,
        totalDepth: v.totalDepth,
        waterLevel: v.waterLevel,
        createdAt: Date.now(),
        layers: [],
      };
      setHoles((list) => [...list, hole]);
      setSelectedId(hole.id);
    }
    setHoleModal(null);
  };

  const deleteHole = (hole: Borehole) => {
    if (!window.confirm(`确定删除钻孔 ${hole.code} 及其全部 ${hole.layers.length} 个分层？`))
      return;
    setHoles((list) => {
      const next = list.filter((h) => h.id !== hole.id);
      if (selectedId === hole.id) {
        setSelectedId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  // ---- 分层操作 ----------------------------------------------------------------

  const addLayer = (v: Omit<Layer, "id" | "spt">) => {
    if (!selected) return;
    const layer: Layer = { ...v, id: uid("ly"), spt: null };
    persistHole({ ...selected, layers: [...selected.layers, layer] });
    setLayerForm(null);
  };

  const updateLayer = (layerId: string, v: Omit<Layer, "id" | "spt">) => {
    if (!selected) return;
    persistHole({
      ...selected,
      layers: selected.layers.map((l) =>
        l.id === layerId ? { ...l, ...v } : l
      ),
    });
    setLayerForm(null);
  };

  const deleteLayer = (layer: Layer) => {
    if (!selected) return;
    if (!window.confirm("确定删除该分层？删除后下一层顶将自动前移，分层保持首尾相接。"))
      return;
    persistHole({
      ...selected,
      layers: selected.layers.filter((l) => l.id !== layer.id),
    });
    setLayerForm(null);
    setSptFormLayerId(null);
  };

  // ---- 标贯操作 ----------------------------------------------------------------

  const saveSpt = (layerId: string, v: { depth: number; n: number }) => {
    if (!selected) return;
    persistHole({
      ...selected,
      layers: selected.layers.map((l) =>
        l.id === layerId
          ? { ...l, spt: l.spt ? { ...l.spt, ...v } : { id: uid("spt"), ...v } }
          : l
      ),
    });
    setSptFormLayerId(null);
  };

  const deleteSpt = (layerId: string) => {
    if (!selected) return;
    persistHole({
      ...selected,
      layers: selected.layers.map((l) =>
        l.id === layerId ? { ...l, spt: null } : l
      ),
    });
    setSptFormLayerId(null);
  };

  // ---- 筛选 --------------------------------------------------------------------

  const toggleFilter = (key: string) =>
    setFilters((f) => (f.includes(key) ? f.filter((x) => x !== key) : [...f, key]));

  const totalFootage = useMemo(
    () =>
      selected
        ? selected.layers.reduce(
            (sum, l, i) => sum + l.bottom - layerTop(selected.layers, i),
            0
          )
        : 0,
    [selected]
  );

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-03 · 岩土工程现场工作台</p>
          <h1>岩土钻孔编录</h1>
          <p className="subtitle">
            分层按深度从浅到深连续记录：新层顶自动接上上一层底，孔深、标贯与水位均须落在当前孔段内。
          </p>
        </div>
        <div className="stack-card">
          <span>当前孔</span>
          <strong>{selected ? selected.code : "尚未建立钻孔"}</strong>
          <span>
            {selected
              ? `共 ${selected.layers.length} 个分层 · 孔深 ${fmtDepth(selected.totalDepth)}`
              : "点击左侧“新增钻孔”开始编录"}
          </span>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard
          label="累计进尺"
          value={metrics.footage ? `${metrics.footage} m` : "0 m"}
          hint={filters.length ? "当前筛选分层厚度合计" : "全部分层厚度合计"}
          tone="ok"
        />
        <MetricCard
          label="地层数量"
          value={String(metrics.layerCount)}
          hint={filters.length ? "命中筛选的分层数" : "已录分层总数"}
          tone="watch"
        />
        <MetricCard
          label="最高标贯"
          value={metrics.maxN === null ? "—" : `${metrics.maxN} 击`}
          hint={filters.length ? "命中分层内的最高击数" : "全部记录最高击数"}
          tone="danger"
        />
        <MetricCard
          label="地下水位"
          value={
            metrics.waterMin === null
              ? "—"
              : Math.abs((metrics.waterMax ?? metrics.waterMin) - metrics.waterMin) < 1e-6
              ? fmtDepth(metrics.waterMin)
              : `${fmtDepth(metrics.waterMin)} ~ ${fmtDepth(metrics.waterMax ?? metrics.waterMin)}`
          }
          hint={filters.length ? "含命中分层钻孔的水位" : "全部钻孔水位范围"}
          tone="accent"
        />
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <div className="side-head">
            <h2>钻孔列表</h2>
            <button className="primary-action" onClick={() => setHoleModal({ mode: "create" })}>
              新增钻孔
            </button>
          </div>
          <div className="hole-list">
            {holes.length === 0 && <p className="empty-tip">还没有钻孔，先新增一口。</p>}
            {holes.map((h) => (
              <button
                key={h.id}
                className={`hole-item${selected?.id === h.id ? " active" : ""}`}
                onClick={() => selectHole(h.id)}
              >
                <span className="hole-code">{h.code}</span>
                <span className="hole-meta">
                  孔深 {fmtDepth(h.totalDepth)} · {h.layers.length} 层
                  {h.waterLevel !== null ? ` · 水位 ${fmtDepth(h.waterLevel)}` : ""}
                </span>
                {Object.keys(auditHole(h)).length > 0 && (
                  <span className="badge-warn" title="该孔存在超出孔段的数据">
                    异常
                  </span>
                )}
              </button>
            ))}
          </div>

          <h2 className="filter-title">岩性筛选</h2>
          <div className="chips">
            {FILTER_OPTIONS.map((key) => (
              <button
                key={key}
                className={filters.includes(key) ? "chip-on" : ""}
                aria-pressed={filters.includes(key)}
                onClick={() => toggleFilter(key)}
              >
                {key}
              </button>
            ))}
          </div>
          <p className="filter-tip">
            {filters.length === 0
              ? "不筛选时统计全部孔；选择分类后看板与分层表同步联动。"
              : `已选：${filters.join("、")}，看板数字仅统计命中分层。`}
          </p>
        </aside>

        <section className="panel">
          {!selected ? (
            <EmptyHole onCreate={() => setHoleModal({ mode: "create" })} />
          ) : (
            <HoleWorkspace
              hole={selected}
              filters={filters}
              layerForm={layerForm}
              sptFormLayerId={sptFormLayerId}
              totalFootage={totalFootage}
              onEditHole={() => setHoleModal({ mode: "edit", hole: selected })}
              onDeleteHole={() => deleteHole(selected)}
              onClearFilters={() => setFilters([])}
              onStartAddLayer={() => setLayerForm({ mode: "create" })}
              onCancelLayerForm={() => setLayerForm(null)}
              onSubmitLayer={(v) =>
                layerForm?.mode === "edit"
                  ? updateLayer(layerForm.layerId, v)
                  : addLayer(v)
              }
              onStartEditLayer={(id) => setLayerForm({ mode: "edit", layerId: id })}
              onDeleteLayer={deleteLayer}
              onOpenSpt={(id) => setSptFormLayerId(id)}
              onCloseSpt={() => setSptFormLayerId(null)}
              onSaveSpt={saveSpt}
              onDeleteSpt={deleteSpt}
            />
          )}
        </section>
      </section>

      <footer className="foot-bar">
        <span>记录保存在本机浏览器（localStorage），关掉页面重开仍可继续编录。</span>
      </footer>

      {holeModal && (
        <HoleFormModal
          editingId={holeModal.mode === "edit" ? holeModal.hole.id : undefined}
          initial={
            holeModal.mode === "edit"
              ? {
                  code: holeModal.hole.code,
                  totalDepth: String(holeModal.hole.totalDepth),
                  waterLevel:
                    holeModal.hole.waterLevel === null
                      ? ""
                      : String(holeModal.hole.waterLevel),
                }
              : { code: "", totalDepth: "", waterLevel: "" }
          }
          existing={holes}
          onClose={() => setHoleModal(null)}
          onSave={saveHoleFromModal}
        />
      )}
    </main>
  );
}

// ---- 指标卡 --------------------------------------------------------------------

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "ok" | "watch" | "danger" | "accent";
}) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
      <i className={`status-${tone}`} />
    </article>
  );
}

function EmptyHole({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="empty-hole">
      <h2>还没有钻孔</h2>
      <p>新增第一口孔，填写编号、孔深和水位，然后按深度逐层录入分层。</p>
      <button className="primary-action" onClick={onCreate}>
        新增钻孔
      </button>
    </div>
  );
}

// ---- 单孔工作台 ----------------------------------------------------------------

function HoleWorkspace({
  hole,
  filters,
  layerForm,
  sptFormLayerId,
  totalFootage,
  onEditHole,
  onDeleteHole,
  onClearFilters,
  onStartAddLayer,
  onCancelLayerForm,
  onSubmitLayer,
  onStartEditLayer,
  onDeleteLayer,
  onOpenSpt,
  onCloseSpt,
  onSaveSpt,
  onDeleteSpt,
}: {
  hole: Borehole;
  filters: string[];
  layerForm: LayerFormState;
  sptFormLayerId: string | null;
  totalFootage: number;
  onEditHole: () => void;
  onDeleteHole: () => void;
  onClearFilters: () => void;
  onStartAddLayer: () => void;
  onCancelLayerForm: () => void;
  onSubmitLayer: (v: Omit<Layer, "id" | "spt">) => void;
  onStartEditLayer: (id: string) => void;
  onDeleteLayer: (l: Layer) => void;
  onOpenSpt: (id: string) => void;
  onCloseSpt: () => void;
  onSaveSpt: (id: string, v: { depth: number; n: number }) => void;
  onDeleteSpt: (id: string) => void;
}) {
  const holeErrors = auditHole(hole);
  const lastBottom = hole.layers.length
    ? hole.layers[hole.layers.length - 1].bottom
    : 0;
  const footageShort = Math.abs(totalFootage - hole.totalDepth) > 1e-6;
  const visibleCount = hole.layers.filter((l) => layerMatches(l, filters)).length;

  const toDraft = (l: Layer): LayerDraft => ({
    bottom: String(l.bottom),
    lithology: l.lithology,
    density: l.density,
    color: l.color,
    description: l.description,
  });

  return (
    <>
      <div className="section-heading">
        <div>
          <p>钻孔编录</p>
          <h2>{hole.code}</h2>
          <div className="hole-summary">
            <span>孔深 {fmtDepth(hole.totalDepth)}</span>
            <span>水位 {hole.waterLevel === null ? "未测" : fmtDepth(hole.waterLevel)}</span>
            <span>{hole.layers.length} 个分层</span>
            <span>已录进尺 {fmtDepth(Number(totalFootage.toFixed(2)))}</span>
            {footageShort && (
              <span className="text-warn">
                进尺未到孔底，还差 {fmtDepth(Number((hole.totalDepth - totalFootage).toFixed(2)))}
              </span>
            )}
          </div>
        </div>
        <div className="heading-actions">
          <button onClick={onEditHole}>编辑孔信息</button>
          <button className="danger-btn" onClick={onDeleteHole}>
            删除该孔
          </button>
        </div>
      </div>

      {holeErrors.waterLevel && <p className="banner-error">水位：{holeErrors.waterLevel}</p>}
      {holeErrors.totalDepth && <p className="banner-error">孔深：{holeErrors.totalDepth}</p>}

      {filters.length > 0 && (
        <div className="filter-banner">
          <span>
            岩性筛选「{filters.join("、")}」生效中：本孔 {visibleCount}/
            {hole.layers.length} 个分层命中，未命中分层已置灰，看板数字按筛选结果统计。
          </span>
          <button onClick={onClearFilters}>清除筛选</button>
        </div>
      )}

      <div className="layer-table">
        <div className="layer-row layer-head-row">
          <span>层号</span>
          <span>深度孔段（m）</span>
          <span>岩性分类 / 状态</span>
          <span>标贯</span>
          <span>操作</span>
        </div>

        {hole.layers.length === 0 && (
          <p className="empty-tip pad">
            还没有分层。首层顶从 0 m 开始，点击下方“新增分层”录入第一层。
          </p>
        )}

        {hole.layers.map((layer, index) => {
          const top = layerTop(hole.layers, index);
          const dim = !layerMatches(layer, filters);
          const seg = { top, bottom: layer.bottom };
          const sptBad = layer.spt ? !sptInside(layer.spt, seg) : false;

          return (
            <div key={layer.id}>
              <div className={`layer-row${dim ? " dim" : ""}`}>
                <span className="layer-no">
                  {String(index + 1).padStart(2, "0")}
                  {dim && <em className="dim-tag">未命中</em>}
                </span>
                <span className="layer-seg">
                  <strong>
                    {top} – {layer.bottom}
                  </strong>
                  <small>厚 {(layer.bottom - top).toFixed(2)} m</small>
                </span>
                <span className="layer-info">
                  <strong>
                    {layer.lithology}
                    <i className="density-pill">{layer.density}</i>
                  </strong>
                  <small>
                    {[layer.color, layer.description].filter(Boolean).join(" · ") || "—"}
                  </small>
                </span>
                <span className="layer-spt">
                  {layer.spt ? (
                    <>
                      <strong>{sptBad ? "⚠ " : ""}N={layer.spt.n}</strong>
                      <small>
                        {layer.spt.depth} m{sptBad ? "（已超出当前孔段）" : ""}
                      </small>
                    </>
                  ) : (
                    <small className="muted">无标贯</small>
                  )}
                </span>
                <span className="layer-ops">
                  <button onClick={() => onStartEditLayer(layer.id)}>编辑</button>
                  <button onClick={() => onDeleteLayer(layer)}>删除</button>
                  <button
                    onClick={() =>
                      sptFormLayerId === layer.id ? onCloseSpt() : onOpenSpt(layer.id)
                    }
                  >
                    {layer.spt ? "改标贯" : "加标贯"}
                  </button>
                </span>
              </div>

              {layerForm?.mode === "edit" && layerForm.layerId === layer.id && (
                <LayerForm
                  mode="edit"
                  ctx={{
                    top,
                    totalDepth: hole.totalDepth,
                    nextTop:
                      index + 1 < hole.layers.length
                        ? layerTop(hole.layers, index + 1)
                        : undefined,
                  }}
                  initial={toDraft(layer)}
                  onCancel={onCancelLayerForm}
                  onSave={onSubmitLayer}
                />
              )}

              {sptFormLayerId === layer.id && (
                <SptForm
                  seg={seg}
                  initial={layer.spt ? { depth: layer.spt.depth, n: layer.spt.n } : undefined}
                  onCancel={onCloseSpt}
                  onSave={(v) => onSaveSpt(layer.id, v)}
                />
              )}

              {sptBad && sptFormLayerId !== layer.id && (
                <div className="row-error">
                  标贯点 {layer.spt!.depth} m 已不在本层孔段 {top} – {layer.bottom} m
                  内，请调整深度或删除该标贯。
                  <button onClick={() => onDeleteSpt(layer.id)}>删除标贯</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {layerForm?.mode === "create" ? (
        <LayerForm
          mode="create"
          ctx={{ top: lastBottom, totalDepth: hole.totalDepth }}
          initial={{ ...emptyLayerDraft, bottom: "" }}
          onCancel={onCancelLayerForm}
          onSave={onSubmitLayer}
        />
      ) : (
        <div className="add-layer-bar">
          <button className="primary-action" onClick={onStartAddLayer}>
            新增分层（层顶自动接 {lastBottom} m）
          </button>
          {lastBottom < hole.totalDepth - 1e-6 && (
            <span className="muted">
              当前最深层底 {lastBottom} m，距孔底还有 {(hole.totalDepth - lastBottom).toFixed(2)} m
            </span>
          )}
        </div>
      )}
    </>
  );
}
