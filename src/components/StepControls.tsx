interface Props {
  index: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
  playing: boolean;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
}

/** 播放控制条：按钮状态完全由 useStepPlayer 派生，自身不持有状态 */
export function StepControls({ index, total, canPrev, canNext, playing, onPrev, onNext, onReset }: Props) {
  return (
    <div className="ed-controls">
      <div className="ed-controls__buttons">
        <button type="button" onClick={onPrev} disabled={!canPrev}>
          上一步
        </button>
        <span className="ed-controls__counter">
          {index + 1} / {total}
        </span>
        <button type="button" className="is-primary" onClick={onNext} disabled={!canNext}>
          下一步
        </button>
        <button type="button" className="is-ghost" onClick={onReset} disabled={index === 0} title="回到第一步">
          ⟲
        </button>
      </div>
      <div className={`ed-controls__progress${playing ? ' is-busy' : ''}`}>
        <i style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>
    </div>
  );
}
