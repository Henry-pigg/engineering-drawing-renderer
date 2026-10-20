import { useState } from 'react';
import type { RecognitionStatus } from '../hooks/useRecognition';
import type { ValidationIssue } from '../core/validate';

interface Props {
  status: RecognitionStatus;
  imageUrl: string | null;
  fileName: string | null;
  summary?: string;
  confidence?: number;
  warnings?: string[];
  error: { code: string; message: string } | null;
  elapsedMs: number | null;
  issues: ValidationIssue[];
  /** 是否已填写识别接口地址 */
  ready: boolean;
  onSelect: (file: File) => void;
}

function confidenceLabel(v?: number): { text: string; tone: string } | null {
  if (v === undefined) return null;
  const pct = Math.round(v * 100);
  const tone = v >= 0.85 ? 'is-good' : v >= 0.6 ? 'is-mid' : 'is-low';
  return { text: `把握 ${pct}%`, tone };
}

/**
 * 上传 + 识别结果面板。
 *
 * 刻意把"模型的不确定性"摆在明面上：置信度、warnings、自动修正数量都给学生看。
 * 教学场景里，让学生知道"这一步是 AI 猜的"比假装识别完全正确更重要。
 */
export function UploadPanel({
  status,
  imageUrl,
  fileName,
  summary,
  confidence,
  warnings,
  error,
  elapsedMs,
  issues,
  ready,
  onSelect,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const loading = status === 'loading';
  const conf = confidenceLabel(confidence);
  const fixedCount = issues.filter((i) => i.fixed).length;

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onSelect(file);
  };

  return (
    <section className="ed-upload">
      <div className="ed-upload__head">
        <h2>题目图</h2>
      </div>

      <label
        className={`ed-drop${dragging ? ' is-over' : ''}${loading ? ' is-busy' : ''}${
          ready ? '' : ' is-locked'
        }`}
        onDragOver={(e) => {
          if (!ready) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (!ready) return;
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        {ready && (
          <input
            type="file"
            accept="image/*"
            className="ed-drop__input"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        )}

        {imageUrl ? (
          <img className="ed-drop__img" src={imageUrl} alt="题目图预览" />
        ) : (
          <div className="ed-drop__empty">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4m0 0L7 9m5-5 5 5" />
              <path d="M3 16v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" />
            </svg>
            <strong>{ready ? '拖入或点击上传' : '请先填写接口地址'}</strong>
            <span>{ready ? '手绘草图 / 题目插图 · ≤10MB' : '地址填好后即可上传'}</span>
          </div>
        )}

        {loading && (
          <div className="ed-drop__mask">
            <span className="ed-spinner" aria-hidden="true" />
            <span>识别中…</span>
          </div>
        )}
      </label>

      {error && (
        <div className="ed-upload__error">
          <strong>识别失败</strong>
          <span>{error.message}</span>
        </div>
      )}

      {!error && (summary || conf) && (
        <div className="ed-upload__result">
          {summary && <p className="ed-upload__summary">{summary}</p>}
          <div className="ed-upload__meta">
            {conf && <span className={`ed-badge ${conf.tone}`}>{conf.text}</span>}
            {fileName && (
              <span className="ed-upload__file" title={fileName}>
                {fileName}
              </span>
            )}
            {elapsedMs !== null && <span className="ed-upload__file">{elapsedMs}ms</span>}
          </div>
        </div>
      )}

      {warnings && warnings.length > 0 && (
        <ul className="ed-upload__warnings">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      {fixedCount > 0 && (
        <p className="ed-upload__notice">已自动修正 {fixedCount} 处模型输出偏差</p>
      )}
    </section>
  );
}
