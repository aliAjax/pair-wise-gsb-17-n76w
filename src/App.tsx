import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import type { Borehole, Layer, StoreData } from "./types";
import {
  CATEGORIES,
  CATEGORY_COLORS,
  findGap,
  isWaterInLayer,
  layerIssue,
  loadStore,
  parseNum,
  round2,
  saveStore,
  sortedLayers,
  uid,
  type HoleFormValues,
  type LayerFormValues,
} from "./domain";
import HoleForm from "./components/HoleForm";
import LayerForm from "./components/LayerForm";

type HoleFormMode = { kind: "new" } | { kind: "edit" } | null;
type LayerFormMode = { kind: "new" } | { kind: "edit"; layer: Layer } | null;

function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : String(round2(n));
}

function App() {
  const [data, setData] = useState<StoreData>(() => loadStore());
  const [selectedId, setSelectedId] = useState<string | null>(
    () => data.holes[0]?.id ?? null
  );
  const [activeCats, setActiveCats] = useState<string[]>([]);
  const [holeMode, setHoleMode] = useState<HoleFormMode>(null);
  const [layerMode, setLayerMode] = useState<LayerFormMode>(null);

  // 记录留在本机：每次变更写入 localStorage，关闭页面再打开仍在
  useEffect(() => {
    saveStore(data);
  }, [data]);

  // 孔按最近录入排列，保证刚录的孔排在最前
  const holes = useMemo(
    () => [...data.holes].sort((a, b) => b.createdAt - a.createdAt),
    [data.holes]
  );

  const selected = holes.find((h) => h.id === selectedId) ?? holes[0] ?? null;

  // ---------- 筛选 ----------

  const catActive = (c: string) => activeCats.includes(c);
  const toggleCat = (c: string) =>
    setActiveCats((list) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]));

  const layerPasses = (l: Layer) => activeCats.length === 0 || activeCats.includes(l.category);
  const holeMatchCount = (h: Borehole) => h.layers.filter(layerPasses).length;

  // 看板数字随筛选结果变化
  const metrics = useMemo(() => {
    const matchedHoles = holes.filter((h) => holeMatchCount(h) > 0);
    const matchedLayers = holes.flatMap((h) => h.layers).filter(layerPasses);
    const maxSpt = matchedLayers.reduce<number | null>(
      (m, l) => (l.sptN !== null ? Math.max(m ?? 0, l.sptN) : m),
      null
    );
    const wls = matchedHoles.map((h) => h.waterLevel).filter((v): v is number => v !== null);
    const avgWl = wls.length ? round2(wls.reduce((a, b) => a + b, 0) / wls.length) : null;
    return {
      holes: matchedHoles.length,
      layers: matchedLayers.length,
      maxSpt,
      avgWl,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holes, activeCats]);

  // ---------- 钻孔增改删 ----------

  const submitHole = (v: HoleFormValues) => {
    const depth = parseNum(v.depth)!;
    const wlRaw = v.waterLevel.trim();
    const waterLevel = wlRaw === "" ? null : parseNum(wlRaw);

    if (holeMode?.kind === "edit" && selected) {
      setData((d) => ({
        holes: d.holes.map((h) =>
          h.id === selected.id
            ? { ...h, code: v.code.trim(), depth, waterLevel, location: v.location.trim() }
            : h
        ),
      }));
    } else {
      const hole: Borehole = {
        id: uid(),
        code: v.code.trim(),
        depth,
        waterLevel,
        location: v.location.trim(),
        createdAt: Date.now(),
        layers: [],
      };
      setData((d) => ({ holes: [...d.holes, hole] }));
      setSelectedId(hole.id);
    }
    setHoleMode(null);
  };

  const deleteHole = (h: Borehole) => {
    if (!window.confirm(`确定删除钻孔 ${h.code} 及其全部 ${h.layers.length} 个分层吗？`)) return;
    setData((d) => ({ holes: d.holes.filter((x) => x.id !== h.id) }));
    if (selectedId === h.id) setSelectedId(null);
  };

  // ---------- 分层增改删 ----------

  const submitLayer = (v: LayerFormValues) => {
    if (!selected) return;
    const top = parseNum(v.top)!;
    const bottom = parseNum(v.bottom)!;
    const sptD = v.sptDepth.trim();
    const sptN = v.sptN.trim();
    const layer: Layer = {
      id: layerMode?.kind === "edit" ? layerMode.layer.id : uid(),
      top,
      bottom,
      category: v.category,
      color: v.color,
      state: v.state,
      description: v.description.trim(),
      sptDepth: sptD === "" ? null : parseNum(sptD),
      sptN: sptN === "" ? null : Number(sptN),
    };

    setData((d) => ({
      holes: d.holes.map((h) => {
        if (h.id !== selected.id) return h;
        const others = h.layers.filter((l) => l.id !== layer.id);
        return { ...h, layers: [...others, layer] };
      }),
    }));
    setLayerMode(null);
  };

  const deleteLayer = (layer: Layer) => {
    if (!selected) return;
    if (!window.confirm("确定删除该分层吗？删除后可在原位重新接续录入。")) return;
    setData((d) => ({
      holes: d.holes.map((h) =>
        h.id === selected.id ? { ...h, layers: h.layers.filter((l) => l.id !== layer.id) } : h
      ),
    }));
    if (layerMode?.kind === "edit" && layerMode.layer.id === layer.id) setLayerMode(null);
  };

  // ---------- 渲染 ----------

  const ordered = selected ? sortedLayers(selected) : [];
  const visibleLayers = ordered.filter(layerPasses);
  const revealedDepth = ordered.reduce((m, l) => Math.max(m, l.bottom), 0);
  const gap = selected ? findGap(selected) : null;
  const metricCards = [
    { label: "筛选命中钻孔", value: String(metrics.holes), sub: `共 ${holes.length} 口` },
    { label: "筛选命中地层", value: String(metrics.layers), sub: "层" },
    { label: "最高标贯击数", value: metrics.maxSpt === null ? "—" : String(metrics.maxSpt), sub: "N（击）" },
    { label: "平均地下水位", value: metrics.avgWl === null ? "—" : `${metrics.avgWl} m`, sub: "命中孔均值" },
  ];

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">岩土工程 · 现场工作台</p>
          <h1>钻孔编录</h1>
          <p className="subtitle">
            分层按深度从浅到深连续接续录入，标贯与水位自动校核到所在孔段；支持岩性筛选，数据保存在本机浏览器。
          </p>
        </div>
        <div className="stack-card">
          <span>本机记录</span>
          <strong>{holes.length} 口钻孔 · {holes.reduce((n, h) => n + h.layers.length, 0)} 个分层</strong>
          <small>记录保存在本机，关闭页面后重新打开仍可继续编录</small>
        </div>
      </section>

      <section className="metrics-grid">
        {metricCards.map((m) => (
          <article key={m.label} className="metric-card">
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <i className="status-ok" />
            <small>{m.sub}</small>
          </article>
        ))}
      </section>

      <section className="filter-bar panel">
        <div className="filter-label">
          <span>岩性筛选</span>
          {activeCats.length > 0 && (
            <button className="link-btn" onClick={() => setActiveCats([])}>清除筛选（{activeCats.length}）</button>
          )}
        </div>
        <div className="chips">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              className={catActive(c) ? "chip-on" : ""}
              onClick={() => toggleCat(c)}
              style={catActive(c) ? { borderColor: CATEGORY_COLORS[c], background: CATEGORY_COLORS[c] } : undefined}
            >
              <i className="chip-dot" style={{ background: CATEGORY_COLORS[c] }} />
              {c}
            </button>
          ))}
        </div>
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <div className="section-heading">
            <h2>钻孔列表</h2>
            <button className="primary-action" onClick={() => setHoleMode({ kind: "new" })}>
              新增钻孔
            </button>
          </div>
          {holes.length === 0 && <p className="empty-tip">还没有钻孔，点「新增钻孔」开始。</p>}
          <div className="hole-list">
            {holes.map((h) => {
              const match = holeMatchCount(h);
              const dimmed = activeCats.length > 0 && match === 0;
              return (
                <button
                  key={h.id}
                  className={`hole-item ${selected?.id === h.id ? "hole-active" : ""} ${dimmed ? "hole-dim" : ""}`}
                  onClick={() => {
                    setSelectedId(h.id);
                    setHoleMode(null);
                    setLayerMode(null);
                  }}
                >
                  <strong>{h.code}</strong>
                  <span>孔深 {fmt(h.depth)} m · {h.layers.length} 层</span>
                  {activeCats.length > 0 && (
                    <em className={match > 0 ? "match-on" : "match-off"}>命中 {match}</em>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="panel">
          {!selected ? (
            <p className="empty-tip">请先在左侧新增或选择一口钻孔。</p>
          ) : (
            <>
              {holeMode ? (
                <HoleForm
                  holes={data.holes}
                  editing={holeMode.kind === "edit" ? selected : null}
                  onSubmit={submitHole}
                  onCancel={() => setHoleMode(null)}
                />
              ) : (
                <header className="hole-header">
                  <div>
                    <div className="hole-title-row">
                      <h2>{selected.code}</h2>
                      <span className="kv">孔深 <b>{fmt(selected.depth)} m</b></span>
                      <span className="kv">
                        水位
                        <b className={selected.waterLevel === null ? "kv-empty" : ""}>
                          {selected.waterLevel === null ? "未测" : `${fmt(selected.waterLevel)} m`}
                        </b>
                      </span>
                      <span className="kv">已揭示 <b>{fmt(revealedDepth)} m</b></span>
                    </div>
                    <p className="hole-location">{selected.location || "未填写孔位备注"}</p>
                    {gap && (
                      <p className="hole-progress">
                        {gap.nextTop !== null
                          ? `层段 ${round2(gap.start)}–${round2(gap.nextTop)} m 待补录`
                          : `尚余 ${round2(round2(selected.depth) - round2(gap.start))} m 未分层（从 ${round2(gap.start)} m 接续）`}
                      </p>
                    )}
                  </div>
                  <div className="header-actions">
                    <button onClick={() => setHoleMode({ kind: "edit" })}>编辑钻孔</button>
                    <button
                      onClick={() => setLayerMode({ kind: "new" })}
                      disabled={gap === null}
                      title={gap === null ? "分层已到孔底，请先修改孔深" : ""}
                    >
                      新增分层
                    </button>
                    <button className="danger-btn" onClick={() => deleteHole(selected)}>删除</button>
                  </div>
                </header>
              )}

              {layerMode && (
                <LayerForm
                  hole={selected}
                  editing={layerMode.kind === "edit" ? layerMode.layer : null}
                  onSubmit={submitLayer}
                  onCancel={() => setLayerMode(null)}
                />
              )}

              <div className="layer-table-head">
                <h3>分层记录（浅 → 深）</h3>
                {activeCats.length > 0 && (
                  <span className="filter-note">筛选中：显示 {visibleLayers.length} / {ordered.length} 层</span>
                )}
              </div>

              {ordered.length === 0 ? (
                <p className="empty-tip">
                  本孔尚无分层。点「新增分层」从 0.00 m 开始接续录入。
                </p>
              ) : visibleLayers.length === 0 ? (
                <p className="empty-tip">当前岩性筛选下，本孔没有可显示的分层。</p>
              ) : (
                <div className="layer-list">
                  {visibleLayers.map((layer) => {
                    const idx = ordered.indexOf(layer);
                    const issue = layerIssue(selected, layer, idx);
                    const inWater = isWaterInLayer(layer, selected.waterLevel);
                    return (
                      <article key={layer.id} className="layer-card">
                        <div
                          className="layer-rail"
                          style={{ background: CATEGORY_COLORS[layer.category] ?? "#64748b" }}
                        >
                          <span>{idx + 1}</span>
                        </div>
                        <div className="layer-body">
                          <div className="layer-top-row">
                            <span
                              className="cat-badge"
                              style={{
                                color: CATEGORY_COLORS[layer.category],
                                borderColor: CATEGORY_COLORS[layer.category],
                              }}
                            >
                              {layer.category}
                            </span>
                            <span className="depth-range">
                              {fmt(layer.top)} – {fmt(layer.bottom)} m
                            </span>
                            <span className="thickness">层厚 {round2(layer.bottom - layer.top)} m</span>
                            <div className="row-actions">
                              <button className="link-btn" onClick={() => setLayerMode({ kind: "edit", layer })}>
                                编辑
                              </button>
                              <button className="link-btn danger-text" onClick={() => deleteLayer(layer)}>
                                删除
                              </button>
                            </div>
                          </div>
                          <p className="layer-desc">
                            {[layer.color, layer.state].filter(Boolean).join(" · ") || "未填土色/状态"}
                            {layer.description ? `：${layer.description}` : ""}
                          </p>
                          <div className="layer-tags">
                            {layer.sptN !== null && (
                              <span className="tag tag-spt">
                                标贯 {fmt(layer.sptDepth)} m · N = {layer.sptN} 击
                              </span>
                            )}
                            {inWater && selected.waterLevel !== null && (
                              <span className="tag tag-water">💧 水位 {fmt(selected.waterLevel)} m 位于本层</span>
                            )}
                            {issue.gap && <span className="tag tag-warn">⚠ {issue.gap}</span>}
                            {issue.beyondHole && <span className="tag tag-warn">⚠ {issue.beyondHole}</span>}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </section>
    </main>
  );
}

export default App;
