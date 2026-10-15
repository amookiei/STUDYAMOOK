import React, { useState } from 'react';

// 웹 모드 입장 화면: 서버 환경 변수 STUDIO_CODE 와 일치하는 코드를 입력해야 앱이 열린다.
export default function Gate({ serverInfo, onVerify }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const serverMissing = serverInfo === null;
  const codeMissing = serverInfo && serverInfo.codeConfigured === false;

  const submit = async (e) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true); setError('');
    try {
      await onVerify(code);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <form className="gate__card" onSubmit={submit}>
        <div className="brand gate__brand">
          <span className="brand__logo">UX</span>
          <span className="brand__name">Reference Studio</span>
        </div>
        <h1>입장 코드</h1>
        {serverMissing && <p className="text-error">서버 API 에 연결하지 못했습니다. Vercel 배포 상태를 확인해 주세요.</p>}
        {codeMissing && (
          <p className="text-error">서버에 <code>STUDIO_CODE</code> 환경 변수가 아직 없습니다. Vercel 프로젝트 설정 → Environment Variables 에 추가하고 다시 배포한 뒤 열어 주세요.</p>
        )}
        <p className="muted">Vercel 의 <code>STUDIO_CODE</code> 환경 변수에 넣어 둔 코드를 입력하세요. 이 브라우저에만 저장됩니다.</p>
        <input
          className="input gate__input"
          type="password"
          autoFocus
          autoComplete="off"
          placeholder="코드 입력"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={busy || serverMissing || codeMissing}
        />
        {error && <p className="text-error gate__error">{error}</p>}
        <button type="submit" className="btn btn--primary gate__submit" disabled={busy || !code.trim() || serverMissing || codeMissing}>
          {busy ? '확인 중…' : '입장'}
        </button>
      </form>
    </div>
  );
}
