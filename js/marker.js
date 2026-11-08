"use strict";
// The trail marker, drawn on screen exactly like the printed pages (Trail Engine finds these in the
// GoPro photos): white page, light topo lines, big black number, orange square on the right.
// The digits come from an image of the printed font, so the phone's fonts can't change them.
(function (root) {
  const W = 1100, H = 850, PX = 100 / 72;           // the US Letter landscape page at 100 dpi
  const SQ = 150 * PX, MARGIN = 36 * PX, GAP = 28 * PX, SIZE = 330;
  const CELL = 183.48 * PX;                          // every digit is the same width
  const STRIP_BASE = 361.11, STRIP_H = 417;          // digit strip: baseline and height in px
  const ORANGE = "#FF6B00";
  let imgs = null;

  function load(src) {
    return new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error(`Couldn't load ${src}`));
      i.src = src;
    });
  }
  function assets() {
    if (!imgs) imgs = Promise.all([load("img/marker-topo.webp"), load("img/marker-digits.png"), load("img/marker-topo-tall.webp")]).catch((e) => { imgs = null; throw e; });
    return imgs;
  }

  // Upright layout (phone held upright): the number big across the top, a bigger orange square
  // centered below it. Trail Engine knows this layout too. All sizes in px on a 1100-wide page.
  const U = { SQ: 440, SIZE: 600, GAP: 120, ROOM: 1012 };

  function drawUpright(ctx, digits, text, CH) {
    let s = 1;
    if (text.length * CELL * (U.SIZE / SIZE) > U.ROOM) s = U.ROOM / (text.length * CELL * (U.SIZE / SIZE));
    const k = (U.SIZE / SIZE) * s;                       // digit strip scale
    const capH = 0.72 * U.SIZE;                          // block height uses the full-size number
    const top = Math.round((CH - (capH + U.GAP + U.SQ)) / 2);
    const sqY = top + capH + U.GAP;
    ctx.fillStyle = ORANGE; ctx.fillRect((W - U.SQ) / 2, sqY, U.SQ, U.SQ);
    const base = sqY - U.GAP;                            // number sits on this line
    const left = W / 2 - (text.length * CELL * k) / 2;
    for (let i = 0; i < text.length; i++) {
      const d = text.charCodeAt(i) - 48;
      ctx.drawImage(digits, d * CELL, 0, CELL, STRIP_H, left + i * CELL * k, base - STRIP_BASE * k, CELL * k, STRIP_H * k);
    }
  }

  /**
   * Draw marker `number` on a canvas 1100 wide. Taller than wide (phone upright): the upright layout. A taller canvas (phone held upright) keeps the
   * same marker in the middle of a white page; the topo lines cover the whole page.
   * footer = small grey line for people (area, name), at the bottom.
   */
  async function draw(cv, number, footer) {
    const [wide, digits, tall] = await assets();
    const ctx = cv.getContext("2d");
    const CH = cv.height, y0 = Math.round((CH - H) / 2);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, CH);
    // topo lines cover the page (cropped, never stretched): the tall image for an upright page
    const topo = CH > H ? tall : wide;
    const k = Math.max(W / topo.width, CH / topo.height);
    const tw = W / k, th = CH / k;
    ctx.drawImage(topo, (topo.width - tw) / 2, (topo.height - th) / 2, tw, th, 0, 0, W, CH);
    const upright = CH > W * 1.2;
    if (upright) drawUpright(ctx, digits, String(number), CH);
    ctx.save();
    ctx.translate(0, y0);
    if (!upright) {
    const sqX = W - MARGIN - SQ;
    ctx.fillStyle = ORANGE; ctx.fillRect(sqX, (H - SQ) / 2, SQ, SQ);
    const text = String(number);
    const room = sqX - GAP - MARGIN;
    let s = 1;
    if (text.length * CELL > room * 1.03) s = room / (text.length * CELL);   // only 1000+ needs this
    const cx = (MARGIN + sqX - GAP) / 2;
    const base = H - (612 / 2 - SIZE * s * 0.36) * PX;
    const left = cx - (text.length * CELL * s) / 2;
    for (let i = 0; i < text.length; i++) {
      const d = text.charCodeAt(i) - 48;
      ctx.drawImage(digits, d * CELL, 0, CELL, STRIP_H, left + i * CELL * s, base - STRIP_BASE * s, CELL * s, STRIP_H * s);
    }
    }
    ctx.restore();
    if (footer) {
      ctx.fillStyle = "#8c8c8c";
      ctx.font = "600 28px -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      let f = footer;
      while (ctx.measureText(f).width > W - 120 && f.length > 8) f = f.slice(0, -2);
      if (f !== footer) f = f.trimEnd() + "…";
      ctx.fillText(f, W / 2, CH - 30 * PX);
    }
  }

  (root.TN = root.TN || {}).marker = { draw, assets };
})(self);
