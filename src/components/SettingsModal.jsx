import React, { useEffect, useState } from 'react';
import bridge from '../lib/bridge';
import { testSupabase } from '../lib/supabase';

const FALLBACK_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (기본, 가장 정확)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (빠름)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (가장 저렴)' },
];

export default function SettingsModal({ settings, modelOptions, onSave, onClose }) {
  const [form, setForm] = useState({ ...settings });
  const [status, setStatus] = useState({ anthropic: null, supabase: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const models = modelOptions && modelOptions.length ? modelOptions : FALLBACK_MODELS;

  useEffect(() => { setForm({ ...settings }); }, [settings]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const testAnthropic = async () => {
    setStatus((s) => ({ ...s, anthropic: { state: 'loading' } }));
    try {
      const r = await bridge.testAnthropic({ apiKey: form.anthropicApiKey, model: form.anthropicModel });
      setStatus((s) => ({ ...s, anthropic: { state: 'ok', message: `연결 성공: ${r.displayName || r.model}` } }));
    } catch (err) {
      setStatus((s) => ({ ...s, anthropic: { state: 'error', message: err.message } }));
    }
  };

  const testSupa = async () => {
    setStatus((s) => ({ ...s, supabase: { state: 'loading' } }));
    try {
      await testSupabase(form);
      setStatus((s) => ({ ...s, supabase: { state: 'ok', message: 'references 테이블과 screenshots 버킷에 접근할 수 있습니다.' } }));
    } catch (err) {
      setStatus((s) => ({ ...s, supabase: { state: 'error', message: err.message } }));
    }
  };

  const save = async () => {
    setSaving(true); setError('');
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const Status = ({ value }) => {
    if (!value) return null;
    if (value.state === 'loading') return <span className="muted">확인 중…</span>;
    return <span className={value.state === 'ok' ? 'text-ok' : 'text-error'}>{value.message}</span>;
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="modal__head">
          <h2 id="settings-title">설정</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>닫기</button>
        </div>

        {bridge.isElectron ? (
          <p className="muted">키는 이 PC 의 사용자 데이터 폴더에만 저장되며(가능하면 OS 암호화 사용) 코드에 포함되지 않습니다.</p>
        ) : (
          <p className="muted">웹 뷰어 모드: Supabase 정보는 이 브라우저(localStorage)에만 저장됩니다. Anthropic 키와 캡처 설정은 데스크톱 앱에서만 사용합니다.</p>
        )}

        {bridge.isElectron && (
        <fieldset className="fieldset">
          <legend>Anthropic (Claude 분석)</legend>
          <label className="field">
            <span className="field__label">API 키</span>
            <input className="input" type="password" placeholder="sk-ant-…" value={form.anthropicApiKey || ''} onChange={set('anthropicApiKey')} autoComplete="off" />
          </label>
          <label className="field">
            <span className="field__label">모델</span>
            <select className="input" value={form.anthropicModel || models[0].id} onChange={set('anthropicModel')}>
              {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <div className="field__row">
            <button type="button" className="btn btn--sm" onClick={testAnthropic} disabled={!form.anthropicApiKey}>연결 테스트</button>
            <Status value={status.anthropic} />
          </div>
        </fieldset>
        )}

        <fieldset className="fieldset">
          <legend>Supabase (저장소)</legend>
          <label className="field">
            <span className="field__label">프로젝트 URL</span>
            <input className="input" placeholder="https://xxxx.supabase.co" value={form.supabaseUrl || ''} onChange={set('supabaseUrl')} />
          </label>
          <label className="field">
            <span className="field__label">anon key</span>
            <input className="input" type="password" placeholder="eyJ…" value={form.supabaseAnonKey || ''} onChange={set('supabaseAnonKey')} autoComplete="off" />
          </label>
          <p className="muted small">비워 두면 이 PC 에만 로컬 저장됩니다. 처음 연결할 때는 <code>supabase/schema.sql</code> 을 Supabase SQL Editor 에서 실행해 테이블과 버킷을 만들어 주세요.</p>
          <div className="field__row">
            <button type="button" className="btn btn--sm" onClick={testSupa} disabled={!form.supabaseUrl || !form.supabaseAnonKey}>연결 테스트</button>
            <Status value={status.supabase} />
          </div>
        </fieldset>

        {bridge.isElectron && (
        <fieldset className="fieldset">
          <legend>캡처</legend>
          <div className="field__grid">
            <label className="field">
              <span className="field__label">뷰포트 너비 (px)</span>
              <input className="input" type="number" min={800} max={2560} value={form.captureWidth ?? 1440} onChange={set('captureWidth')} />
            </label>
            <label className="field">
              <span className="field__label">최대 캡처 높이 (px)</span>
              <input className="input" type="number" min={2000} max={30000} value={form.captureMaxHeight ?? 12000} onChange={set('captureMaxHeight')} />
            </label>
          </div>
        </fieldset>
        )}

        {error && <p className="text-error">{error}</p>}

        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>취소</button>
          <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </div>
  );
}
