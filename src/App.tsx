import { Fragment, useEffect } from 'react';
import { DrawingCanvas } from './components/DrawingCanvas';
import { StepControls } from './components/StepControls';
import { UploadPanel } from './components/UploadPanel';
import { useStepPlayer } from './hooks/useStepPlayer';
import { useRecognition } from './hooks/useRecognition';
import { sampleDrawing } from './data/sample-drawing';
import { LINE_STYLES, strokeProps } from './core/linetypes';
import { isMockMode } from './vision/client';
import type { LineType } from './types';

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
  const { state, recognize, restoreSample } = useRecognition(sampleDrawing);
  const doc = state.doc ?? sampleDrawing;
  const player = useStepPlayer(doc.steps, { resetKey: state.revision });
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
    state.status === 'loading'
      ? '识别中'
      : isMockMode
        ? '示例数据'
        : `已接入识别 · ${state.elapsedMs ?? 0}ms`;

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
          onSelect={recognize}
          onRestore={restoreSample}
        />

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
        </div>

        <div className="ed-bar">
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
            onReset={player.reset}
          />
        </div>
      </main>
    </div>
  );
}
