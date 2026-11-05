import { useEffect, useRef, useState, useCallback } from 'react';
import { Game, type ArchiveRecord } from '../game/engine';
import { SLOGANS, NPCS, TOTAL_TASKS } from '../game/data';

type Panel = 'none' | 'workbench' | 'compare';

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);

  const [records, setRecords] = useState<ArchiveRecord[]>([]);
  const [nearSlogan, setNearSlogan] = useState<string | null>(null);
  const [nearNpc, setNearNpc] = useState<string | null>(null);
  const [dialogNpc, setDialogNpc] = useState<string | null>(null);
  const [dialogIdx, setDialogIdx] = useState(0);
  const [panel, setPanel] = useState<Panel>('none');
  const [timeMode, setTimeMode] = useState<'day' | 'dusk'>('day');
  const [progress, setProgress] = useState({ done: 0, total: TOTAL_TASKS });
  const [toast, setToast] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'physical' | 'oral'>('all');
  const [expandedRec, setExpandedRec] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const game = new Game(canvasRef.current, (e) => {
      if (e.type === 'near-slogan') setNearSlogan(e.siteId);
      else if (e.type === 'near-npc') setNearNpc(e.npcId);
      else if (e.type === 'collected') {
        setRecords((r) => [...r, e.record]);
        showToast(`已归档 ${e.record.id}：${e.record.title}`);
      } else if (e.type === 'progress') setProgress({ done: e.done, total: e.total });
    });
    gameRef.current = game;
    (window as unknown as { __game: Game }).__game = game;
    return () => { game.dispose(); gameRef.current = null; };
  }, [showToast]);

  const allDone = progress.done >= progress.total;
  const dialogData = dialogNpc ? NPCS.find((n) => n.id === dialogNpc)! : null;

  const handleCollect = () => {
    if (nearSlogan) gameRef.current?.collectSlogan(nearSlogan);
  };
  const openDialog = () => {
    if (!nearNpc) return;
    setDialogNpc(nearNpc);
    setDialogIdx(0);
  };
  const nextDialog = () => {
    if (!dialogData) return;
    if (dialogIdx < dialogData.dialogue.length - 1) setDialogIdx(dialogIdx + 1);
  };
  const saveOral = () => {
    if (dialogNpc) gameRef.current?.collectOral(dialogNpc);
    setDialogNpc(null);
  };
  const updateRecord = (id: string, patch: Partial<ArchiveRecord>) => {
    setRecords((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const addTag = (id: string, tag: string) => {
    if (!tag.trim()) return;
    setRecords((rs) =>
      rs.map((r) => (r.id === id && !r.tags.includes(tag.trim()) ? { ...r, tags: [...r.tags, tag.trim()] } : r))
    );
  };
  const removeTag = (id: string, tag: string) => {
    setRecords((rs) => rs.map((r) => (r.id === id ? { ...r, tags: r.tags.filter((t) => t !== tag) } : r)));
  };

  const toggleTime = () => {
    const m = timeMode === 'day' ? 'dusk' : 'day';
    setTimeMode(m);
    gameRef.current?.setTimeMode(m);
  };

  const exportDossier = () => {
    const lines: string[] = [
      '湖坪古村红军标语数字档案卷宗',
      `生成时间：${new Date().toLocaleString('zh-CN')}`,
      `档案数量：${records.length} 件（实物 ${records.filter((r) => r.kind === 'physical').length} / 口述 ${records.filter((r) => r.kind === 'oral').length}）`,
      '='.repeat(46),
      '',
      '一、实物档案（标语采集）',
      ...records.filter((r) => r.kind === 'physical').flatMap((r) => [
        `\n【${r.id}】${r.title}`,
        `  采集地点：${r.source}`,
        `  标语正文：${r.content}`,
        `  标签：${r.tags.join('、')}`,
        r.note ? `  备注：${r.note}` : '',
        `  采集时间：${r.time}`,
      ].filter(Boolean)),
      '',
      '二、口述档案（访谈记录）',
      ...records.filter((r) => r.kind === 'oral').flatMap((r) => [
        `\n【${r.id}】${r.title}`,
        `  受访者：${r.source}`,
        `  摘要：${r.content}`,
        `  标签：${r.tags.join('、')}`,
        r.note ? `  备注：${r.note}` : '',
        `  采集时间：${r.time}`,
      ].filter(Boolean)),
      '',
      '三、史料比对：官方记载 × 民间记忆',
      ...SLOGANS.flatMap((s) => {
        const mentions = NPCS.flatMap((n) => n.mentions.filter((m) => m.sloganId === s.id).map((m) => `  · ${n.name}：${m.text}`));
        return [
          `\n◆ ${s.title}（${s.location}）`,
          `  官方记载：${s.official}`,
          ...(mentions.length ? ['  民间记忆：', ...mentions] : ['  民间记忆：（本次未征集到相关口述）']),
        ];
      }),
      '',
      '—— 卷宗完 · 湖坪古村档案抢救性征集与数字化留存 ——',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `湖坪古村红军标语档案卷宗_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('卷宗已导出为文本文件');
  };

  const nearSloganData = nearSlogan ? SLOGANS.find((s) => s.id === nearSlogan)! : null;
  const nearNpcData = nearNpc ? NPCS.find((n) => n.id === nearNpc)! : null;
  const filtered = records.filter((r) => filter === 'all' || r.kind === filter);

  // Esc 关闭各类面板
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (dossierOpen) setDossierOpen(false);
      else if (dialogNpc) setDialogNpc(null);
      else if (panel !== 'none') setPanel('none');
    };
    addEventListener('keydown', onEsc);
    return () => removeEventListener('keydown', onEsc);
  }, [dossierOpen, dialogNpc, panel]);

  return (
    <div className="archive-root">
      <canvas ref={canvasRef} className="game-canvas" />

      {/* 开场说明 */}
      {!started && (
        <div className="overlay" data-ui>
          <div className="start-card paper">
            <div className="stamp">档案征集</div>
            <h1>湖坪红迹</h1>
            <p className="start-sub">江西乐安 · 湖坪古村 · 登仙桥遗址</p>
            <p className="start-desc">
              你是一名档案征集工作者。1933 年大湖坪整编期间，红军在湖坪写下了大量标语。
              九十余年过去，墙面斑驳，记忆漂移。走近老宅墙面采集标语实物档案，
              访谈村民收集口述史料，在档案工作台整理归档，最终比对官方记载与民间记忆，生成数字卷宗。
            </p>
            <div className="start-controls">
              <span>WASD / 方向键 行走</span><span>拖拽鼠标 旋转视角</span><span>滚轮 缩放</span><span>手机 虚拟摇杆</span>
            </div>
            <button className="btn-primary" onClick={() => setStarted(true)}>开始征集</button>
          </div>
        </div>
      )}

      {/* HUD 顶栏 */}
      <div className="hud-top" data-ui>
        <div className="hud-title">
          <span className="hud-name">湖坪红迹 · 档案征集</span>
          <span className="hud-progress">{progress.done} / {progress.total} 已归档</span>
        </div>
        <div className="hud-actions">
          <button className="hud-btn" onClick={toggleTime}>{timeMode === 'day' ? '☾ 黄昏' : '☀ 日间'}</button>
          <button className="hud-btn" onClick={() => setPanel(panel === 'workbench' ? 'none' : 'workbench')}>
            档案工作台{records.length > 0 ? `（${records.length}）` : ''}
          </button>
          {allDone && (
            <button className="hud-btn accent" onClick={() => setPanel('compare')}>史料比对</button>
          )}
        </div>
      </div>

      {/* 采集交互提示 */}
      {started && nearSloganData && !dialogNpc && (
        <button className="interact-btn" data-ui onClick={handleCollect}>
          <svg className="interact-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#7e2d20" strokeWidth="1.8">
            <rect x="3" y="7" width="18" height="13" rx="2" /><circle cx="12" cy="13" r="4" /><path d="M8 7l1.5-3h5L16 7" />
          </svg>
          <span>
            拍摄采集标语
            <small>{nearSloganData.location}</small>
          </span>
        </button>
      )}
      {started && nearNpcData && !dialogNpc && (
        <button className="interact-btn" data-ui onClick={openDialog}>
          <svg className="interact-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#7e2d20" strokeWidth="1.8">
            <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
          <span>
            访谈：{nearNpcData.name}
            <small>{nearNpcData.role}</small>
          </span>
        </button>
      )}

      {/* 远处标语提示 */}
      {started && !allDone && !nearSlogan && !nearNpc && !dialogNpc && panel === 'none' && (
        <div className="hint" data-ui>走近斑驳墙面与村民，寻访沉睡的历史痕迹</div>
      )}

      {/* 虚拟摇杆（触屏） */}
      <Joystick onMove={(x, y) => gameRef.current?.setJoystick(x, y)} />

      {/* 对话弹窗 */}
      {dialogData && (
        <div className="dialog-wrap" data-ui>
          <div className="dialog paper">
            <div className="dialog-head">
              <strong>{dialogData.name}</strong>
              <span>{dialogData.role}</span>
              {gameRef.current?.isCollected(dialogData.id) && <em className="tag-chip">已归档</em>}
            </div>
            <p className="dialog-text">{dialogData.dialogue[dialogIdx]}</p>
            <div className="dialog-actions">
              {dialogIdx < dialogData.dialogue.length - 1 ? (
                <button className="btn-primary" onClick={nextDialog}>继续 ▾</button>
              ) : (
                <>
                  {!gameRef.current?.isCollected(dialogData.id) && (
                    <button className="btn-primary" onClick={saveOral}>保存口述录音记录</button>
                  )}
                  <button className="btn-ghost" onClick={() => setDialogNpc(null)}>结束访谈</button>
                </>
              )}
            </div>
            <div className="dialog-dots">
              {dialogData.dialogue.map((_, i) => (
                <i key={i} className={i === dialogIdx ? 'on' : ''} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 档案工作台 */}
      {panel === 'workbench' && (
        <aside className="workbench paper" data-ui>
          <div className="wb-head">
            <h2>档案工作台</h2>
            <button className="btn-ghost sm" onClick={() => setPanel('none')}>收起 ✕</button>
          </div>
          <div className="wb-filter">
            {(['all', 'physical', 'oral'] as const).map((f) => (
              <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? `全部 ${records.length}` : f === 'physical' ? `实物 ${records.filter((r) => r.kind === 'physical').length}` : `口述 ${records.filter((r) => r.kind === 'oral').length}`}
              </button>
            ))}
          </div>
          <div className="wb-list">
            {filtered.length === 0 && (
              <p className="wb-empty">档案包空空如也。<br />走近标语墙拍摄采集，或与村民访谈记录口述。</p>
            )}
            {filtered.map((r) => (
              <article key={r.id} className={`rec ${r.kind}`}>
                <header onClick={() => setExpandedRec(expandedRec === r.id ? null : r.id)}>
                  <span className="rec-id">{r.id}</span>
                  <strong>{r.title}</strong>
                  <span className={`rec-kind ${r.kind}`}>{r.kind === 'physical' ? '实物' : '口述'}</span>
                </header>
                {expandedRec === r.id && (
                  <div className="rec-body">
                    {r.image && <img src={r.image} alt={r.title} className="rec-img" />}
                    <p className="rec-meta">来源：{r.source} · {r.time}</p>
                    <p className="rec-content">{r.content}</p>
                    <div className="rec-tags">
                      {r.tags.map((t) => (
                        <span key={t} className="tag-chip" onClick={() => removeTag(r.id, t)} title="点击移除">{t} ✕</span>
                      ))}
                      <TagInput onAdd={(t) => addTag(r.id, t)} />
                    </div>
                    <textarea
                      className="rec-note"
                      placeholder="添加整理备注……"
                      value={r.note}
                      onChange={(e) => updateRecord(r.id, { note: e.target.value })}
                    />
                  </div>
                )}
              </article>
            ))}
          </div>
          {allDone && (
            <button className="btn-primary wb-compare" onClick={() => setPanel('compare')}>全部采集完成 · 进入史料比对 →</button>
          )}
        </aside>
      )}

      {/* 史料比对面板 */}
      {panel === 'compare' && (
        <div className="overlay" data-ui>
          <div className="compare-card paper">
            <div className="wb-head">
              <h2>史料比对 · 官方记载 × 民间记忆</h2>
              <button className="btn-ghost sm" onClick={() => setPanel('none')}>关闭 ✕</button>
            </div>
            <div className="compare-list">
              {SLOGANS.map((s) => {
                const mentions = NPCS.flatMap((n) =>
                  n.mentions.filter((m) => m.sloganId === s.id).map((m) => ({ npc: n, text: m.text }))
                );
                return (
                  <section key={s.id} className="compare-item">
                    <h3>「{s.title}」<small>{s.location}</small></h3>
                    <div className="compare-cols">
                      <div className="col official">
                        <h4>官方馆藏记载</h4>
                        <p>{s.official}</p>
                      </div>
                      <div className="col folk">
                        <h4>民间口述记忆</h4>
                        {mentions.length === 0 && <p className="dim">本次征集未覆盖此点位的口述记录。</p>}
                        {mentions.map((m, i) => (
                          <p key={i}><b>{m.npc.name}：</b>{m.text}</p>
                        ))}
                      </div>
                    </div>
                    {mentions.some((m) => m.text.includes('出入') || m.text.includes('替换') || m.text.includes('放大') || m.text.includes('偏移') || m.text.includes('增益')) && (
                      <p className="diff-flag">▲ 记忆边界：口述版本与馆藏记载存在差异，需在卷宗中并置留存</p>
                    )}
                  </section>
                );
              })}
            </div>
            <div className="compare-foot">
              <button className="btn-primary" onClick={() => setDossierOpen(true)}>生成数字档案卷宗</button>
            </div>
          </div>
        </div>
      )}

      {/* 卷宗预览 + 导出 */}
      {dossierOpen && (
        <div className="overlay" data-ui>
          <div className="dossier paper">
            <div className="wb-head">
              <h2>数字档案卷宗</h2>
              <button className="btn-ghost sm" onClick={() => setDossierOpen(false)}>✕</button>
            </div>
            <div className="dossier-body">
              <p className="dossier-title">湖坪古村红军标语数字档案卷宗</p>
              <p className="rec-meta">生成于 {new Date().toLocaleString('zh-CN')} · 共 {records.length} 件</p>
              {records.map((r) => (
                <div key={r.id} className="dossier-rec">
                  <p><b>【{r.id}】{r.title}</b></p>
                  <p className="rec-meta">{r.kind === 'physical' ? '采集地点' : '受访者'}：{r.source}</p>
                  <p>{r.content}</p>
                  {r.note && <p className="dim">备注：{r.note}</p>}
                </div>
              ))}
              <p className="dim dossier-end">—— 卷宗含实物影像、口述摘要与史料比对，导出为文本留存 ——</p>
            </div>
            <div className="compare-foot">
              <button className="btn-primary" onClick={exportDossier}>导出卷宗（.txt）</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast" data-ui>{toast}</div>}
    </div>
  );
}

function TagInput({ onAdd }: { onAdd: (t: string) => void }) {
  const [v, setV] = useState('');
  return (
    <input
      className="tag-input"
      placeholder="+ 标签"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && v.trim()) { onAdd(v); setV(''); }
      }}
    />
  );
}

function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState({ x: 0, y: 0, active: false });
  const idRef = useRef<number | null>(null);

  const handle = useCallback((e: React.PointerEvent) => {
    const base = ref.current!.getBoundingClientRect();
    const cx = base.left + base.width / 2, cy = base.top + base.height / 2;
    let dx = (e.clientX - cx) / (base.width / 2);
    let dy = (e.clientY - cy) / (base.height / 2);
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    setStick({ x: dx, y: dy, active: true });
    onMove(dx, dy);
  }, [onMove]);

  return (
    <div
      ref={ref}
      className="joystick"
      data-ui
      onPointerDown={(e) => { idRef.current = e.pointerId; (e.target as HTMLElement).setPointerCapture(e.pointerId); handle(e); }}
      onPointerMove={(e) => { if (idRef.current === e.pointerId) handle(e); }}
      onPointerUp={() => { idRef.current = null; setStick({ x: 0, y: 0, active: false }); onMove(0, 0); }}
      onPointerCancel={() => { idRef.current = null; setStick({ x: 0, y: 0, active: false }); onMove(0, 0); }}
    >
      <div
        className="joystick-stick"
        style={{ transform: `translate(${stick.x * 34}px, ${stick.y * 34}px)` }}
      />
    </div>
  );
}
