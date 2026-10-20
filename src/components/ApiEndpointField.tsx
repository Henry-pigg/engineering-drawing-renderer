import { useEffect, useState } from 'react';
import { normalizeEndpoint } from '../vision/client';

interface Props {
  endpoint: string;
  token: string;
  configured: boolean;
  onSave: (next: { endpoint: string; token: string }) => void;
  onClear: () => void;
}

/**
 * 用户在页面上直接填写识别接口。
 * 保存后立刻生效（写 localStorage），不需要重新构建或刷新。
 */
export function ApiEndpointField({ endpoint, token, configured, onSave, onClear }: Props) {
  const [draft, setDraft] = useState(endpoint);
  const [draftToken, setDraftToken] = useState(token);
  const [showToken, setShowToken] = useState(token !== '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(endpoint);
    setDraftToken(token);
  }, [endpoint, token]);

  const dirty = draft.trim() !== endpoint || draftToken.trim() !== token;

  const handleSave = () => {
    const normalized = normalizeEndpoint(draft);
    if (!normalized) {
      setError('请填写接口地址');
      return;
    }
    if (/\s/.test(normalized)) {
      setError('地址里不能有空格');
      return;
    }
    setError(null);
    onSave({ endpoint: normalized, token: draftToken.trim() });
    setDraft(normalized);
  };

  return (
    <section className="ed-endpoint">
      <div className="ed-endpoint__head">
        <h2>识别接口</h2>
        <span className={`ed-dot${configured ? ' is-on' : ''}`}>
          {configured ? '已配置' : '未配置'}
        </span>
      </div>

      <input
        className="ed-input"
        type="url"
        inputMode="url"
        spellCheck={false}
        placeholder="https://api.example.com/recognize"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
        }}
      />

      {showToken ? (
        <input
          className="ed-input ed-input--token"
          type="password"
          spellCheck={false}
          placeholder="访问令牌（可选，作 Bearer 发送）"
          value={draftToken}
          onChange={(e) => setDraftToken(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
          }}
        />
      ) : null}

      {error && <p className="ed-endpoint__error">{error}</p>}

      <div className="ed-endpoint__actions">
        <button type="button" className="ed-btn ed-btn--primary" onClick={handleSave} disabled={!dirty}>
          保存
        </button>
        <button type="button" className="ed-btn" onClick={() => setShowToken((v) => !v)}>
          {showToken ? '隐藏令牌' : '令牌'}
        </button>
        {configured && (
          <button type="button" className="ed-btn ed-btn--quiet" onClick={onClear}>
            清除
          </button>
        )}
      </div>

      <p className="ed-endpoint__hint">
        需支持 POST JSON，返回 <code>{'{ doc: DrawingDoc }'}</code>，并允许本站跨域。
      </p>
    </section>
  );
}
