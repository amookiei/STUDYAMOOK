import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import bridge from './lib/bridge';
import { createStore, newId } from './lib/store';
import Library from './components/Library';
import Screenshot from './components/Screenshot';
import Wireframe from './components/Wireframe';
import Analysis from './components/Analysis';
import Comments, { GENERAL_SECTION } from './components/Comments';
import SettingsModal from './components/SettingsModal';
import Gate from './components/Gate';
import { prepareManualScreenshot, buildManualCapture } from './lib/manualCapture';

const TABS = [
  { id: 'screenshot', label: '스크린샷' },
  { id: 'wireframe', label: '와이어프레임' },
  { id: 'analysis', label: '분석' },
];

export default function App() {
  const [settings, setSettings] = useState(null);
  const [appInfo, setAppInfo] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 웹 모드 입장 게이트: 'checking' → 'locked' | 'open'. 데스크톱은 항상 'open'.
  const [gate, setGate] = useState(bridge.isElectron ? 'open' : 'checking');

  const [references, setReferences] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [selected, setSelected] = useState(null); // 전체 row (analysis, landmarks 포함)
  const [notes, setNotes] = useState([]);
  const [notesBusy, setNotesBusy] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState(GENERAL_SECTION.id);

  const [url, setUrl] = useState('');
  const [tab, setTab] = useState('screenshot');
  const [job, setJob] = useState(null); // { stage, message }
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const fileInputRef = useRef(null);

  const store = useMemo(() => (settings ? createStore(settings) : null), [settings]);
  // 데스크톱: 설정의 키 또는 환경 변수. 웹: 서버(Vercel)에 ANTHROPIC_API_KEY 가 있는지.
  const hasApiKey = bridge.isElectron
    ? Boolean(settings?.anthropicApiKey) || Boolean(appInfo?.hasEnvCredentials)
    : Boolean(appInfo?.server?.anthropicConfigured);
  const webReady = bridge.isElectron || Boolean(appInfo?.server?.anthropicConfigured && appInfo?.server?.codeConfigured);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), type === 'error' ? 8000 : 4000);
  }, []);

  // ---- 초기 로드 ----
  useEffect(() => {
    (async () => {
      try {
        const [s, info] = await Promise.all([bridge.getSettings(), bridge.getAppInfo()]);
        setSettings(s);
        setAppInfo(info);
        if (!bridge.isElectron) {
          // 저장된 코드가 있으면 서버에 다시 확인하고, 없거나 틀리면 잠금 화면
          const saved = bridge.getStudioCode();
          if (saved && info?.server?.codeConfigured) {
            try { await bridge.verifyStudioCode(saved); setGate('open'); } catch { bridge.clearStudioCode(); setGate('locked'); }
          } else {
            setGate('locked');
          }
        }
      } catch (err) {
        showToast(`설정을 불러오지 못했습니다: ${err.message}`, 'error');
        setSettings({});
      }
    })();
    return bridge.onProgress((p) => setJob((j) => (j ? { ...j, ...p } : j)));
  }, [showToast]);

  const refreshLibrary = useCallback(async () => {
    if (!store) return;
    setLibraryLoading(true);
    try {
      setReferences(await store.listReferences());
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLibraryLoading(false);
    }
  }, [store, showToast]);

  useEffect(() => { refreshLibrary(); }, [refreshLibrary]);

  // ---- 레퍼런스 선택 ----
  const selectReference = useCallback(async (ref) => {
    if (!store) return;
    try {
      const full = ref.analysis ? ref : await store.getReference(ref.id);
      setSelected(full);
      setSelectedSectionId(GENERAL_SECTION.id);
      setNotes(await store.listNotes(full.id));
      setUrl(full.url || '');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [store, showToast]);

  const deleteReference = useCallback(async (ref) => {
    if (!store) return;
    if (!window.confirm(`"${ref.title || ref.url}" 레퍼런스와 코멘트를 삭제할까요?`)) return;
    try {
      await store.deleteReference(ref);
      if (selected?.id === ref.id) { setSelected(null); setNotes([]); }
      await refreshLibrary();
      showToast('삭제했습니다.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [store, selected, refreshLibrary, showToast]);

  // 캡처 객체 → Claude 분석 → 저장 → 화면 표시 (자동 캡처와 직접 업로드가 공유)
  const analyzeAndSave = useCallback(async (capture, id) => {
      setJob({ stage: 'analyze', message: 'Claude 분석 요청 중…' });
      const { analysis, meta } = await bridge.analyzeReference({ capture, model: settings?.anthropicModel });

      setJob({ stage: 'save', message: store.kind === 'supabase' ? 'Supabase 에 저장 중…' : '로컬에 저장 중…' });
      let saved;
      try {
        saved = await store.saveReference({ id, capture, analysis, meta });
      } catch (err) {
        // 저장이 실패해도 결과는 화면에 보여 준다.
        showToast(`저장 실패: ${err.message}`, 'error');
        saved = {
          id, url: capture.url, title: capture.title, analysis, landmarks: capture.landmarks,
          screenshot_url: capture.screenshot.url || `data:image/png;base64,${capture.screenshot.base64}`,
          screenshot_width: capture.screenshot.width, screenshot_height: capture.screenshot.height,
          model: meta?.model, created_at: new Date().toISOString(), unsaved: true,
        };
      }
      setSelected(saved);
      setNotes([]);
      setSelectedSectionId(GENERAL_SECTION.id);
      setTab('analysis');
      await refreshLibrary();
      if (!saved.unsaved) showToast('분석을 완료하고 저장했습니다.');
  }, [store, settings, refreshLibrary, showToast]);

  // ---- 캡처 → 분석 → 저장 ----
  const runAnalysis = useCallback(async () => {
    if (job) return;
    const target = url.trim();
    if (!target) { showToast('분석할 URL 을 입력해 주세요.', 'error'); return; }
    if (!bridge.isElectron) {
      if (!webReady) {
        showToast('서버에 ANTHROPIC_API_KEY 환경 변수가 아직 설정되지 않았습니다. Vercel 프로젝트 설정에서 추가해 주세요.', 'error');
        return;
      }
      if (store.kind !== 'supabase') {
        showToast('웹에서 분석하려면 설정에서 Supabase 를 먼저 연결해 주세요.', 'error');
        setSettingsOpen(true);
        return;
      }
    } else if (!hasApiKey) {
      showToast('Anthropic API 키가 없습니다. 설정에서 키를 입력해 주세요.', 'error');
      setSettingsOpen(true);
      return;
    }
    setJob({ stage: 'capture', message: '캡처 준비 중…' });
    try {
      const capture = await bridge.capturePage(target);
      await analyzeAndSave(capture, newId());
    } catch (err) {
      const msg = err.message || String(err);
      const blocked = /불러오지 못했|타임아웃|끝나지 않았|차단|403|blocked/i.test(msg) && !/스크린샷 업로드/.test(msg);
      showToast(blocked ? `${msg} 브라우저에서 전체 페이지 스크린샷을 찍어 "스크린샷 업로드"로 분석할 수도 있습니다.` : msg, 'error');
      if (err.code === 'invalid_code') { bridge.clearStudioCode(); setGate('locked'); }
    } finally {
      setJob(null);
    }
  }, [job, url, hasApiKey, webReady, store, settings, analyzeAndSave, showToast]);

  // 사용자가 직접 올린 전체 페이지 스크린샷으로 분석 (봇 차단 페이지용)
  const analyzeUploaded = useCallback(async (file) => {
    if (job || !file) return;
    if (!bridge.isElectron) {
      if (!webReady) { showToast('서버에 ANTHROPIC_API_KEY 환경 변수가 아직 설정되지 않았습니다.', 'error'); return; }
      if (store.kind !== 'supabase') { showToast('웹에서 분석하려면 설정에서 Supabase 를 먼저 연결해 주세요.', 'error'); setSettingsOpen(true); return; }
    } else if (!hasApiKey) {
      showToast('Anthropic API 키가 없습니다. 설정에서 키를 입력해 주세요.', 'error'); setSettingsOpen(true); return;
    }
    setJob({ stage: 'capture', message: '올린 스크린샷을 준비하는 중…' });
    try {
      const image = await prepareManualScreenshot(file);
      const id = newId();
      let screenshot;
      if (bridge.isElectron) {
        screenshot = { base64: image.base64 };
      } else {
        setJob({ stage: 'capture', message: '스크린샷을 Supabase 에 올리는 중…' });
        screenshot = await store.uploadScreenshotBlob(id, image.blob);
      }
      const capture = buildManualCapture({ url: url.trim(), file, image, screenshot });
      if (image.scaled) showToast(`이미지가 커서 ${image.width}×${image.height}px 로 축소했습니다.`);
      await analyzeAndSave(capture, id);
    } catch (err) {
      showToast(err.message || String(err), 'error');
      if (err.code === 'invalid_code') { bridge.clearStudioCode(); setGate('locked'); }
    } finally {
      setJob(null);
    }
  }, [job, url, hasApiKey, webReady, store, analyzeAndSave, showToast]);

  const cancelJob = useCallback(async () => {
    await bridge.cancelAnalysis();
    showToast('분석을 취소했습니다.');
  }, [showToast]);

  // ---- 코멘트 ----
  const withNotes = async (fn) => {
    if (!store || !selected) return;
    if (selected.unsaved) { showToast('저장되지 않은 레퍼런스에는 코멘트를 남길 수 없습니다. Supabase 설정을 확인해 주세요.', 'error'); return; }
    setNotesBusy(true);
    try {
      await fn();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setNotesBusy(false);
    }
  };
  const addNote = ({ sectionId, sectionLabel, body }) => withNotes(async () => {
    const created = await store.addNote({ referenceId: selected.id, sectionId, sectionLabel, body });
    setNotes((n) => [...n, created]);
  });
  const updateNote = (id, body) => withNotes(async () => {
    const updated = await store.updateNote(id, body);
    setNotes((n) => n.map((x) => (x.id === id ? updated : x)));
  });
  const deleteNote = (note) => withNotes(async () => {
    if (!window.confirm('이 코멘트를 삭제할까요?')) return;
    await store.deleteNote(note.id);
    setNotes((n) => n.filter((x) => x.id !== note.id));
  });

  const saveSettings = async (form) => {
    const saved = await bridge.saveSettings(form);
    setSettings(saved);
    showToast('설정을 저장했습니다.');
  };

  const selectSection = (id) => { setSelectedSectionId(id || GENERAL_SECTION.id); };

  // ---- 렌더 ----
  const analysis = selected?.analysis || null;
  let banner = null;
  if (settings) {
    if (!bridge.isElectron) {
      if (appInfo && !appInfo.server) {
        banner = { type: 'warn', text: `서버 API 에 연결하지 못했습니다${appInfo.serverError ? ` (${appInfo.serverError})` : ''}. Vercel 배포 상태를 확인해 주세요.` };
      } else if (appInfo && !webReady) {
        banner = { type: 'warn', text: '서버에 ANTHROPIC_API_KEY 환경 변수가 설정되지 않았습니다. Vercel 프로젝트 설정 → Environment Variables 에 추가하고 다시 배포하면 웹에서도 분석할 수 있습니다.' };
      } else if (store?.kind !== 'supabase') {
        banner = { type: 'info', text: '웹에서 분석한 결과는 Supabase 에 저장됩니다. 설정(⚙)에서 Supabase URL 과 anon key 를 입력해 주세요.' };
      }
    } else if (!hasApiKey) {
      banner = { type: 'warn', text: 'Anthropic API 키가 설정되지 않아 분석을 실행할 수 없습니다. 설정(⚙)에서 키를 입력하면 바로 사용할 수 있습니다.' };
    } else if (store?.kind !== 'supabase') {
      banner = { type: 'info', text: 'Supabase 가 설정되지 않아 결과를 이 PC 에만 저장합니다. 설정에서 Supabase URL 과 anon key 를 입력하면 클라우드에 저장됩니다.' };
    }
  }

  if (gate === 'checking') {
    return <div className="gate"><div className="gate__card"><p className="muted">확인 중…</p></div></div>;
  }
  if (gate === 'locked') {
    return (
      <Gate
        serverInfo={appInfo ? (appInfo.server ?? null) : undefined}
        onVerify={async (code) => { await bridge.verifyStudioCode(code); setGate('open'); }}
      />
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__logo">UX</span>
          <span className="brand__name">Reference Studio</span>
        </div>
        <form className="urlbar" onSubmit={(e) => { e.preventDefault(); runAnalysis(); }}>
          <input
            className="input urlbar__input"
            placeholder="분석할 페이지 URL (예: https://linear.app)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={Boolean(job)}
            spellCheck={false}
          />
          {job ? (
            <button type="button" className="btn btn--ghost" onClick={cancelJob}>취소</button>
          ) : (
            <>
              <button type="submit" className="btn btn--primary" disabled={!settings}>분석 시작</button>
              <button
                type="button"
                className="btn"
                disabled={!settings}
                title="봇 차단 등으로 캡처가 안 되는 페이지는 브라우저에서 찍은 전체 페이지 스크린샷을 올려 분석할 수 있습니다. URL 은 참고용으로 함께 저장됩니다."
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
              >
                스크린샷 업로드
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) analyzeUploaded(f); }}
              />
            </>
          )}
        </form>
        <button type="button" className="btn btn--ghost" onClick={() => setSettingsOpen(true)} title="설정">⚙ 설정</button>
        {!bridge.isElectron && (
          <button type="button" className="btn btn--ghost" title="입장 코드를 지우고 잠급니다" onClick={() => { bridge.clearStudioCode(); setGate('locked'); }}>잠금</button>
        )}
      </header>

      {banner && (
        <div className={`banner banner--${banner.type}`}>
          <span>{banner.text}</span>
          <button type="button" className="link" onClick={() => setSettingsOpen(true)}>설정 열기</button>
        </div>
      )}

      {job && (
        <div className="progress">
          <span className="spinner" />
          <span className="progress__stage">{{ capture: '1/3 캡처', analyze: '2/3 분석', save: '3/3 저장' }[job.stage] || job.stage}</span>
          <span className="progress__message">{job.message}</span>
        </div>
      )}

      <main className="layout">
        <Library
          references={references}
          selectedId={selected?.id}
          loading={libraryLoading}
          storeKind={store?.kind}
          onSelect={selectReference}
          onDelete={deleteReference}
          onRefresh={refreshLibrary}
        />

        <section className="workspace">
          {selected ? (
            <>
              <div className="workspace__head">
                <div className="workspace__title">
                  <h1 title={selected.title}>{selected.title || selected.url}</h1>
                  <button type="button" className="link" onClick={() => bridge.openExternal(selected.url)} title="브라우저에서 열기">{selected.url}</button>
                </div>
                <nav className="tabs">
                  {TABS.map((t) => (
                    <button key={t.id} type="button" className={`tab${tab === t.id ? ' tab--active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
                  ))}
                </nav>
              </div>
              <div className="workspace__body">
                {tab === 'screenshot' && (
                  <Screenshot src={selected.screenshot_url} width={selected.screenshot_width} height={selected.screenshot_height} url={selected.url} />
                )}
                {tab === 'wireframe' && (
                  <Wireframe
                    analysis={analysis}
                    screenshotUrl={selected.screenshot_url}
                    pageWidth={selected.screenshot_width}
                    pageHeight={selected.screenshot_height}
                    selectedSectionId={selectedSectionId}
                    onSelectSection={selectSection}
                  />
                )}
                {tab === 'analysis' && (
                  <Analysis analysis={analysis} meta={{ model: selected.model }} selectedSectionId={selectedSectionId} onSelectSection={selectSection} />
                )}
              </div>
            </>
          ) : (
            <div className="workspace__empty">
              <h1>레퍼런스를 분석해 보세요</h1>
              <p>위 입력창에 URL 을 넣고 <strong>분석 시작</strong>을 누르면 페이지를 캡처하고 Claude 가 정보구조·와이어프레임·UX 패턴을 정리합니다. 봇 차단 등으로 캡처가 안 되는 페이지는 브라우저에서 전체 페이지 스크린샷을 찍어 <strong>스크린샷 업로드</strong>로 분석하세요.</p>
              {bridge.isElectron ? (
                <ol>
                  <li>설정(⚙)에서 Anthropic API 키를 입력합니다.</li>
                  <li>(선택) Supabase URL 과 anon key 를 입력하면 결과가 클라우드에 저장됩니다.</li>
                  <li>URL 을 입력하고 분석을 시작합니다. 1~3분 정도 걸립니다.</li>
                </ol>
              ) : (
                <ol>
                  <li>설정(⚙)에서 Supabase URL 과 anon key 를 입력합니다. 스크린샷과 분석 결과가 Supabase 에 저장됩니다.</li>
                  <li>URL 을 입력하고 분석을 시작합니다. 서버에서 캡처(10~40초)와 Claude 분석(1~3분)이 진행됩니다.</li>
                  <li>Anthropic 키는 Vercel 환경 변수에만 있고 브라우저로 내려오지 않습니다.</li>
                </ol>
              )}
              {appInfo?.version && <p className="muted small">v{appInfo.version}{appInfo.electron ? ` · Electron ${appInfo.electron}` : ''}</p>}
            </div>
          )}
        </section>

        <Comments
          reference={selected}
          analysis={analysis}
          notes={notes}
          selectedSectionId={selectedSectionId}
          onSelectSection={selectSection}
          onAdd={addNote}
          onUpdate={updateNote}
          onDelete={deleteNote}
          busy={notesBusy}
        />
      </main>

      {toast && <div className={`toast toast--${toast.type}`}>{toast.message}</div>}

      {settingsOpen && settings && (
        <SettingsModal
          settings={settings}
          modelOptions={appInfo?.modelOptions}
          appInfo={appInfo}
          onSave={saveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
