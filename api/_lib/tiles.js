// 서버(sharp)용 스크린샷 타일링. electron/analyzer.js 의 planTiles 와 같은 기하를 쓴다.
const sharp = require('sharp');
const { planTiles } = require('../../electron/analyzer');

async function tileWithSharp(pngBuffer) {
  const meta = await sharp(pngBuffer).metadata();
  if (!meta.width || !meta.height) throw new Error('스크린샷 이미지를 읽을 수 없습니다.');
  const plan = planTiles(meta.width, meta.height);
  const resized = await sharp(pngBuffer).resize(plan.targetWidth, plan.targetHeight, { fit: 'fill' }).png().toBuffer();
  const tiles = [];
  for (const t of plan.tiles) {
    const jpeg = await sharp(resized).extract({ left: 0, top: t.y, width: t.width, height: t.height }).jpeg({ quality: 82 }).toBuffer();
    tiles.push({
      index: t.index, fromPct: t.fromPct, toPct: t.toPct,
      mediaType: 'image/jpeg', base64: jpeg.toString('base64'), width: t.width, height: t.height,
    });
  }
  return tiles;
}

module.exports = { tileWithSharp };
