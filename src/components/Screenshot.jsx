import React, { useState } from 'react';

export default function Screenshot({ src, width, height, url }) {
  const [zoom, setZoom] = useState('fit');

  if (!src) {
    return <div className="empty-state">스크린샷이 없습니다.</div>;
  }

  const style = zoom === 'fit' ? { width: '100%' } : { width: `${width}px`, maxWidth: 'none' };

  return (
    <div className="screenshot">
      <div className="toolbar">
        <span className="muted">{width} × {height}px</span>
        <div className="toolbar__spacer" />
        <div className="segmented">
          <button type="button" className={zoom === 'fit' ? 'active' : ''} onClick={() => setZoom('fit')}>너비 맞춤</button>
          <button type="button" className={zoom === '100' ? 'active' : ''} onClick={() => setZoom('100')}>100%</button>
        </div>
      </div>
      <div className="screenshot__scroll">
        <img src={src} alt={`${url} 스크린샷`} style={style} className="screenshot__img" />
      </div>
    </div>
  );
}
