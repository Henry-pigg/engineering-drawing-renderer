import { Fragment, useEffect, useMemo } from 'react';
import { DrawingCanvas } from './components/DrawingCanvas';
import { StepControls } from './components/StepControls';
import { UploadPanel } from './components/UploadPanel';
import { ApiEndpointField } from './components/ApiEndpointField';
import { useStepPlayer } from './hooks/useStepPlayer';
import { useRecognition } from './hooks/useRecognition';
import { useEndpointSettings } from './hooks/useEndpoint';
import { createEmptyDoc } from './data/empty-doc';
import { createHttpRecognizer, type Recognizer } from './vision/client';
import { LINE_STYLES, strokeProps } from './core/linetypes';
import type { LineType } from './types';

/** 模块级常量：保证 useRecognition 的初始值引用稳定 */
const EMPTY_DOC = createEmptyDoc();

/** 极简富文本：把 **粗体** 渲染成 <b>，避免为讲解文案引入 markdown 依赖 */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split('**').map((chunk, i) =>
        i % 2 === 1 ? <b key={i}>{chunk}</b> : <Fragment key={i}>{chunk}</Fragment>,
      )}
    </>
  );
}

export function App() {
  const envEndpoint = import.meta.env.VITE_RECOGNIZE_ENDPOINT ?? '';
  const { endpoint, token, configured, save, clear } = useEndpointSettings(envEndpoint);

  // 接口地址由用户填写；没填就不给识别器，上传时会明确提示
  const recognizer = useMemo<Recognizer | null>(() => {
    if (!configured) return null;
    const base = createHttpRecognizer(endpoint);
    return (file, options) => base(file, { ...options, token });
  }, [configured, endpoint, token]);

  const { state, recognize, reset } = useRecognition(recognizer, EMPTY_DOC);
  const doc = state.doc ?? EMPTY_DOC;
  const player = useStepPlayer(doc.steps, { resetKey: state.revision });
  const hasDrawing = doc.steps.length > 0;
  const { next, prev } = player;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  const tag =
    state.status === 'loading' ? '识别中' : configured ? '接口已配置' : '未配置接口';

  return (
    <div className="ed-app">
      <header className="ed-header">
        <div className="ed-header__brand">
          <span className="ed-header__mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 20h18M6 20V8l6-4 6 4v12M10 20v-5h4v5" />
            </svg>
          </span>
          <div>
            <h1>工程制图 · 分步绘制演示</h1>
            <p>
              {doc.meta.title} · 线型按 {doc.meta.standard ?? 'GB/T 4457.4'}
            </p>
          </div>
        </div>
        <div className="ed-header__tags">
          <span className={state.status === 'loading' ? 'is-live' : undefined}>{tag}</span>
          <span>JSON 驱动</span>
          <span>SVG 渲染</span>
        </div>
      </header>

      <aside className="ed-sidebar">
        <ApiEndpointField
          endpoint={endpoint}
          token={token}
          configured={configured}
          onSave={save}
          onClear={clear}
        />

        <UploadPanel
          status={state.status}
          imageUrl={state.imageUrl}
          fileName={state.fileName}
          summary={doc.meta.summary}
          confidence={doc.meta.confidence}
          warnings={doc.warnings}
          error={state.error}
          elapsedMs={state.elapsedMs}
          issues={state.issues}
          ready={configured}
          onSelect={recognize}
        />

        {hasDrawing && (
          <>
            <h2>绘制步骤</h2>
            <ol className="ed-steps">
              {doc.steps.map((step, i) => {
                const cls = i === player.index ? 'is-current' : i < player.index ? 'is-done' : '';
                return (
                  <li key={step.id} className={cls}>
                    <button type="button" onClick={() => player.goTo(i)}>
                      <span className="ed-steps__idx">{i + 1}</span>
                      <span className="ed-steps__title">{step.title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        )}

        <h2>线型图例</h2>
        <ul className="ed-legend">
          {(Object.keys(LINE_STYLES) as LineType[]).map((key) => {
            const s = strokeProps(key);
            return (
              <li key={key}>
                <svg width="58" height="12" viewBox="0 0 58 12" aria-hidden="true">
                  <path
                    d="M1 6H57"
                    fill="none"
                    stroke={s.stroke}
                    strokeWidth={Math.min(s.strokeWidth, 2.6)}
                    strokeDasharray={s.strokeDasharray}
                    strokeLinecap={s.strokeLinecap}
                  />
                </svg>
                <span>{LINE_STYLES[key].label}</span>
                <em>{LINE_STYLES[key].hint}</em>
              </li>
            );
          })}
        </ul>
      </aside>

      <main className="ed-stage">
        <div className="ed-paper">
          <DrawingCanvas doc={doc} stepIndex={player.index} className="ed-canvas" />
          {!hasDrawing && (
            <div className="ed-empty">
              <strong>还没有图纸</strong>
              <span>
                {configured
                  ? '在左侧上传手绘草图或题目图，自动拆成可回放的绘制步骤'
                  : '先在左侧填写识别接口地址，再上传图纸'}
              </span>
            </div>
          )}
        </div>

        <div className="ed-bar">
          {hasDrawing && player.step ? (
            <>
              <p className="ed-narration" key={`${state.revision}-${player.index}`}>
                <b>{player.step.title}</b> · <RichText text={player.step.narration ?? ''} />
              </p>
              <StepControls
                index={player.index}
                total={doc.steps.length}
                canPrev={player.canPrev}
                canNext={player.canNext}
                playing={player.status === 'playing'}
                onPrev={player.prev}
                onNext={player.next}
                onReset={() => {
                  player.reset();
                  reset();
                }}
              />
            </>
          ) : (
            <p className="ed-narration ed-narration--muted">
              {configured
                ? '等待上传图纸。识别完成后这里会显示每一步的讲解，可逐步回放。'
                : '先填写识别接口地址。识别完成后，这里会逐步演示这张图的画法。'}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
