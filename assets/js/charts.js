// =========================================================
// Charts — رسوم بيانية SVG خالصة (بدون مكتبات خارجية)
// Bell Curve · Stacked Bar · Gauge · Distribution Bar
// =========================================================

/* ── مساعدات عامة ── */

const C = {
  primary: "var(--primary, #6c5ce7)",
  success: "var(--success, #00b894)",
  warning: "var(--warning, #fdcb6e)",
  danger: "var(--danger, #e17055)",
  info: "var(--info, #74b9ff)",
  muted: "var(--muted, #b2bec3)",
  border: "var(--border, #dfe6e9)",
  card: "var(--card-bg, #fff)",
  text: "var(--text, #2d3436)",
  bg: "var(--bg, #f5f6fa)",
  wallet: "#0984e3",
  cash: "#00b894",
  debt: "#e17055",
};

function pctColor(pct) {
  if (pct >= 70) return C.success;
  if (pct >= 50) return C.warning;
  return C.danger;
}

/* ═══════════════════════════════════════════════════════════
   1. Bell Curve — المُنحنى الجرسي
   ═══════════════════════════════════════════════════════════ */

export function renderBellCurve(scores, maxScore, opts = {}) {
  if (!scores.length || !maxScore) return "";

  const W = opts.width || 520;
  const H = opts.height || 220;
  const pad = { t: 30, r: 20, b: 40, l: 45 };
  const cw = W - pad.l - pad.r;
  const ch = H - pad.t - pad.b;

  const pcts = scores.map((s) => (s / maxScore) * 100);
  const bins = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // 0-10, 10-20, ..., 90-100
  pcts.forEach((p) => {
    const idx = Math.min(Math.floor(p / 10), 9);
    bins[idx]++;
  });
  const maxBin = Math.max(...bins, 1);

  const barW = cw / 10 - 4;
  const labels = ["0-10", "10-20", "20-30", "30-40", "40-50", "50-60", "60-70", "70-80", "80-90", "90-100"];

  // Gaussian fit
  const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length;
  const variance = pcts.reduce((a, b) => a + (b - mean) ** 2, 0) / pcts.length;
  const std = Math.sqrt(variance) || 15;

  const pts = [];
  for (let i = 0; i <= 100; i++) {
    const x = pad.l + (i / 100) * cw;
    const y = (1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((i - mean) / std) ** 2);
    const scaledY = (y / (1 / (std * Math.sqrt(2 * Math.PI)))) * ch * 0.85;
    pts.push(`${x},${pad.t + ch - scaledY}`);
  }

  const barsSvg = bins.map((count, i) => {
    const x = pad.l + i * (cw / 10) + 2;
    const h = (count / maxBin) * ch;
    const y = pad.t + ch - h;
    const color = pctColor(i * 10 + 5);
    return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="${color}" opacity="0.55"/>
            <text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="10" font-weight="700" fill="${C.text}">${count || ""}</text>`;
  }).join("");

  const axisLabels = labels.map((l, i) => {
    const x = pad.l + i * (cw / 10) + barW / 2 + 2;
    return `<text x="${x}" y="${H - 5}" text-anchor="middle" font-size="9" fill="${C.muted}">${l}</text>`;
  }).join("");

  // Stats
  const median = [...pcts].sort((a, b) => a - b)[Math.floor(pcts.length / 2)];
  const passCount = pcts.filter((p) => p >= 50).length;
  const failCount = pcts.length - passCount;

  return `
    <div class="ch-card" style="background:${C.card}; border:1px solid ${C.border}; border-radius:12px; padding:16px; margin-bottom:14px;">
      <div style="font-weight:700; font-size:14px; color:${C.primary}; margin-bottom:8px;">${opts.title || "المنحنى الجرسي — توزيع الدرجات"}</div>
      <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:10px; font-size:12px;">
        <span style="color:${C.muted};">المتوسط: <b style="color:${C.text};">${mean.toFixed(1)}%</b></span>
        <span style="color:${C.muted};">الوسيط: <b style="color:${C.text};">${median.toFixed(1)}%</b></span>
        <span style="color:${C.muted};">الانحراف: <b style="color:${C.text};">${std.toFixed(1)}</b></span>
        <span style="color:${C.success};">ناجح: <b>${passCount}</b></span>
        <span style="color:${C.danger};">راسب: <b>${failCount}</b></span>
      </div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%; max-width:${W}px; display:block;">
        <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + ch}" stroke="${C.border}" stroke-width="1"/>
        <line x1="${pad.l}" y1="${pad.t + ch}" x2="${W - pad.r}" y2="${pad.t + ch}" stroke="${C.border}" stroke-width="1"/>
        ${axisLabels}
        ${barsSvg}
        <polyline points="${pts.join(" ")}" fill="none" stroke="${C.primary}" stroke-width="2.5" stroke-linejoin="round"/>
      </svg>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════
   2. Distribution Bar — تحليل توزيع الدرجات (بديل Item Analysis)
   ═══════════════════════════════════════════════════════════ */

export function renderDistributionBar(exam, students, opts = {}) {
  if (!exam || !exam.results || !exam.results.length) return "";

  const W = opts.width || 520;
  const H = opts.height || 200;
  const pad = { t: 25, r: 20, b: 35, l: 45 };
  const cw = W - pad.l - pad.r;
  const ch = H - pad.t - pad.b;

  const results = exam.results.filter((r) => !r.absent && r.score != null);
  if (!results.length) return "";

  const maxScore = exam.maxScore || 100;

  // 5 buckets: 0-20, 20-40, 40-60, 60-80, 80-100
  const bucketLabels = ["0-20%", "20-40%", "40-60%", "60-80%", "80-100%"];
  const bucketColors = [C.danger, "#e17055", C.warning, C.info, C.success];
  const buckets = [0, 0, 0, 0, 0];
  results.forEach((r) => {
    const pct = (r.score / maxScore) * 100;
    const idx = Math.min(Math.floor(pct / 20), 4);
    buckets[idx]++;
  });
  const maxBucket = Math.max(...buckets, 1);

  const barW = cw / 5 - 8;

  const barsSvg = buckets.map((count, i) => {
    const x = pad.l + i * (cw / 5) + 4;
    const h = (count / maxBucket) * ch;
    const y = pad.t + ch - h;
    return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="4" fill="${bucketColors[i]}" opacity="0.8"/>
            <text x="${x + barW / 2}" y="${y - 5}" text-anchor="middle" font-size="11" font-weight="700" fill="${C.text}">${count}</text>`;
  }).join("");

  const axisLabels = bucketLabels.map((l, i) => {
    const x = pad.l + i * (cw / 5) + barW / 2 + 4;
    return `<text x="${x}" y="${H - 8}" text-anchor="middle" font-size="9" fill="${C.muted}">${l}</text>`;
  }).join("");

  const avg = results.reduce((s, r) => s + r.score, 0) / results.length;
  const avgPct = (avg / maxScore) * 100;

  return `
    <div class="ch-card" style="background:${C.card}; border:1px solid ${C.border}; border-radius:12px; padding:16px; margin-bottom:14px;">
      <div style="font-weight:700; font-size:14px; color:${C.primary}; margin-bottom:6px;">${opts.title || `توزيع الدرجات — ${exam.title || ""}`}</div>
      <div style="display:flex; gap:14px; flex-wrap:wrap; margin-bottom:8px; font-size:12px;">
        <span style="color:${C.muted};">المتوسط: <b style="color:${pctColor(avgPct)};">${avgPct.toFixed(1)}%</b></span>
        <span style="color:${C.muted};">عدد الممتحنين: <b style="color:${C.text};">${results.length}</b></span>
      </div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%; max-width:${W}px; display:block;">
        <line x1="${pad.l}" y1="${pad.t + ch}" x2="${W - pad.r}" y2="${pad.t + ch}" stroke="${C.border}" stroke-width="1"/>
        ${axisLabels}
        ${barsSvg}
      </svg>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════
   3. Stacked Bar Chart — مخطط شريطي مكدس (الإيرادات الشهرية)
   ═══════════════════════════════════════════════════════════ */

export function renderStackedBar(monthData, opts = {}) {
  if (!monthData || !monthData.length) return "";

  const W = opts.width || 560;
  const H = opts.height || 240;
  const pad = { t: 25, r: 20, b: 50, l: 60 };
  const cw = W - pad.l - pad.r;
  const ch = H - pad.t - pad.b;

  const maxTotal = Math.max(...monthData.map((m) => (m.cash || 0) + (m.wallet || 0) + (m.debt || 0)), 1);
  const barW = Math.min(cw / monthData.length - 8, 60);

  const barsSvg = monthData.map((m, i) => {
    const total = (m.cash || 0) + (m.wallet || 0) + (m.debt || 0);
    const x = pad.l + i * (cw / monthData.length) + (cw / monthData.length - barW) / 2;
    const totalH = (total / maxTotal) * ch;
    const cashH = ((m.cash || 0) / maxTotal) * ch;
    const walletH = ((m.wallet || 0) / maxTotal) * ch;
    const debtH = ((m.debt || 0) / maxTotal) * ch;

    let y = pad.t + ch;
    const segments = [];
    if (m.cash) { y -= cashH; segments.push(`<rect x="${x}" y="${y}" width="${barW}" height="${cashH}" rx="2" fill="${C.cash}" opacity="0.85"/>`); }
    if (m.wallet) { y -= walletH; segments.push(`<rect x="${x}" y="${y}" width="${barW}" height="${walletH}" rx="2" fill="${C.wallet}" opacity="0.85"/>`); }
    if (m.debt) { y -= debtH; segments.push(`<rect x="${x}" y="${y}" width="${barW}" height="${debtH}" rx="2" fill="${C.debt}" opacity="0.75"/>`); }

    const label = `<text x="${x + barW / 2}" y="${pad.t + ch + 14}" text-anchor="middle" font-size="9" fill="${C.muted}" transform="rotate(-25 ${x + barW / 2} ${pad.t + ch + 14})">${m.label || ""}</text>`;
    const totalLabel = total ? `<text x="${x + barW / 2}" y="${pad.t + ch - totalH - 5}" text-anchor="middle" font-size="9" font-weight="700" fill="${C.text}">${formatMoneyShort(total)}</text>` : "";

    return segments.join("") + label + totalLabel;
  }).join("");

  // Y-axis ticks
  const tickCount = 4;
  const ticks = [];
  for (let i = 0; i <= tickCount; i++) {
    const val = (maxTotal / tickCount) * i;
    const y = pad.t + ch - (i / tickCount) * ch;
    ticks.push(`<text x="${pad.l - 5}" y="${y + 3}" text-anchor="end" font-size="9" fill="${C.muted}">${formatMoneyShort(val)}</text>`);
    ticks.push(`<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="${C.border}" stroke-width="0.5" stroke-dasharray="3,3"/>`);
  }

  const legend = `
    <g transform="translate(${pad.l}, ${H - 12})">
      <rect x="0" y="0" width="10" height="10" rx="2" fill="${C.cash}"/>
      <text x="14" y="9" font-size="9" fill="${C.muted}">كاش</text>
      <rect x="50" y="0" width="10" height="10" rx="2" fill="${C.wallet}"/>
      <text x="64" y="9" font-size="9" fill="${C.muted}">محفظة</text>
      <rect x="110" y="0" width="10" height="10" rx="2" fill="${C.debt}"/>
      <text x="124" y="9" font-size="9" fill="${C.muted}">ديون</text>
    </g>`;

  return `
    <div class="ch-card" style="background:${C.card}; border:1px solid ${C.border}; border-radius:12px; padding:16px; margin-bottom:14px;">
      <div style="font-weight:700; font-size:14px; color:${C.primary}; margin-bottom:10px;">${opts.title || "الإيرادات الشهرية"}</div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%; max-width:${W}px; display:block;">
        <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + ch}" stroke="${C.border}" stroke-width="1"/>
        <line x1="${pad.l}" y1="${pad.t + ch}" x2="${W - pad.r}" y2="${pad.t + ch}" stroke="${C.border}" stroke-width="1"/>
        ${ticks.join("")}
        ${barsSvg}
        ${legend}
      </svg>
    </div>`;
}

function formatMoneyShort(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + "ك";
  return Math.round(n).toString();
}

/* ═══════════════════════════════════════════════════════════
   4. Gauge Chart — مؤشر قياس (السعة الاستيعابية)
   ═══════════════════════════════════════════════════════════ */

export function renderGauge(current, capacity, opts = {}) {
  if (!capacity || capacity <= 0) return "";

  const W = opts.width || 200;
  const H = opts.height || 130;
  const cx = W / 2;
  const cy = H - 15;
  const r = Math.min(cx - 10, cy - 10) * 0.85;

  const pct = Math.min((current / capacity) * 100, 100);
  const startAngle = Math.PI;
  const endAngle = 2 * Math.PI;
  const sweepAngle = startAngle + (pct / 100) * Math.PI;

  // Background arc
  const bgArc = describeArc(cx, cy, r, startAngle, endAngle);
  // Value arc
  const valArc = pct > 0 ? describeArc(cx, cy, r, startAngle, sweepAngle) : "";

  let color = C.success;
  if (pct >= 90) color = C.danger;
  else if (pct >= 70) color = C.warning;

  // Ticks
  const ticks = [];
  for (let i = 0; i <= 10; i++) {
    const angle = startAngle + (i / 10) * Math.PI;
    const inner = r - 6;
    const outer = r + 2;
    ticks.push(`<line x1="${cx + Math.cos(angle) * inner}" y1="${cy + Math.sin(angle) * inner}" x2="${cx + Math.cos(angle) * outer}" y2="${cy + Math.sin(angle) * outer}" stroke="${C.muted}" stroke-width="1"/>`);
  }

  return `
    <div class="ch-card" style="background:${C.card}; border:1px solid ${C.border}; border-radius:12px; padding:14px; text-align:center; margin-bottom:14px;">
      <div style="font-weight:700; font-size:13px; color:${C.primary}; margin-bottom:6px;">${opts.title || "السعة الاستيعابية"}</div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%; max-width:${W}px; display:block; margin:0 auto;">
        <path d="${bgArc}" fill="none" stroke="${C.border}" stroke-width="14" stroke-linecap="round"/>
        ${valArc ? `<path d="${valArc}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round"/>` : ""}
        ${ticks.join("")}
        <text x="${cx}" y="${cy - 10}" text-anchor="middle" font-size="22" font-weight="800" fill="${color}">${Math.round(pct)}%</text>
        <text x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="11" fill="${C.muted}">${current} / ${capacity}</text>
        <text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="9" fill="${C.muted}">${capacity - current} مقعد متبقى</text>
      </svg>
    </div>`;
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

/* ═══════════════════════════════════════════════════════════
   5. Bubble Scatter — مصفوفة الخلاصة (The Quadrant)
   ═══════════════════════════════════════════════════════════ */

export function renderBubbleScatter(bubbles, yearName, opts = {}) {
  if (!bubbles || !bubbles.length) return "";

  const W = opts.width || 500;
  const H = opts.height || 360;
  const pad = { t: 35, r: 30, b: 55, l: 65 };
  const cw = W - pad.l - pad.r;
  const ch = H - pad.t - pad.b;
  const midX = pad.l + cw / 2;
  const midY = pad.t + ch / 2;

  const maxStudents = Math.max(...bubbles.map((b) => b.students || 1), 1);
  const minR = 12;
  const maxR = 38;

  // Axis labels
  const axisSvg = `
    <line x1="${pad.l}" y1="${pad.t + ch}" x2="${W - pad.r}" y2="${pad.t + ch}" stroke="${C.border}" stroke-width="1"/>
    <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + ch}" stroke="${C.border}" stroke-width="1"/>
    <text x="${W / 2}" y="${H - 5}" text-anchor="middle" font-size="11" font-weight="700" fill="${C.muted}">نسبة الحضور (الانضباط) →</text>
    <text x="14" y="${H / 2}" text-anchor="middle" font-size="11" font-weight="700" fill="${C.muted}" transform="rotate(-90 14 ${H / 2})">المستوى الأكاديمي ←</text>
    <text x="${pad.l}" y="${H - 22}" text-anchor="middle" font-size="9" fill="${C.muted}">0%</text>
    <text x="${W - pad.r}" y="${H - 22}" text-anchor="middle" font-size="9" fill="${C.muted}">100%</text>
    <text x="${pad.l - 8}" y="${pad.t + 4}" text-anchor="end" font-size="9" fill="${C.muted}">100%</text>
    <text x="${pad.l - 8}" y="${pad.t + ch + 4}" text-anchor="end" font-size="9" fill="${C.muted}">0%</text>
  `;

  // Quadrant lines (dashed)
  const quadrantLines = `
    <line x1="${midX}" y1="${pad.t}" x2="${midX}" y2="${pad.t + ch}" stroke="${C.border}" stroke-width="1" stroke-dasharray="4,4"/>
    <line x1="${pad.l}" y1="${midY}" x2="${W - pad.r}" y2="${midY}" stroke="${C.border}" stroke-width="1" stroke-dasharray="4,4"/>
  `;

  // Quadrant labels (subtle)
  const qLabels = `
    <text x="${midX + cw / 4}" y="${pad.t + 16}" text-anchor="middle" font-size="10" font-weight="700" fill="${C.success}" opacity="0.7">🌟 النجوم</text>
    <text x="${pad.l + cw / 4}" y="${pad.t + 16}" text-anchor="middle" font-size="10" font-weight="700" fill="${C.warning}" opacity="0.7">🦊 الأذكياء المستهترون</text>
    <text x="${midX + cw / 4}" y="${pad.t + ch - 6}" text-anchor="middle" font-size="10" font-weight="700" fill="${C.info}" opacity="0.7">🐢 الملتزمون الضعاف</text>
    <text x="${pad.l + cw / 4}" y="${pad.t + ch - 6}" text-anchor="middle" font-size="10" font-weight="700" fill="${C.danger}" opacity="0.7">🚨 منطقة الخطر</text>
  `;

  // Bubbles
  const bubblesSvg = bubbles.map((b) => {
    const x = pad.l + (Math.max(0, Math.min(100, b.attendance || 0)) / 100) * cw;
    const y = pad.t + ch - (Math.max(0, Math.min(100, b.examAvg || 0)) / 100) * ch;
    const r = minR + ((b.students || 1) / maxStudents) * (maxR - minR);

    let color = C.success;
    if (b.debtRatio > 0.3) color = C.danger;
    else if (b.debtRatio > 0.1) color = C.warning;

    return `
      <circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="0.65" stroke="${color}" stroke-width="1.5"/>
      <text x="${x}" y="${y + 1}" text-anchor="middle" font-size="${r > 20 ? 10 : 8}" font-weight="700" fill="#fff">${b.students}</text>
      <text x="${x}" y="${y + r + 12}" text-anchor="middle" font-size="9" font-weight="600" fill="${C.text}">${escapeXML(b.name)}</text>
    `;
  }).join("");

  // Summary stats
  const totalStudents = bubbles.reduce((s, b) => s + (b.students || 0), 0);
  const avgAttendance = bubbles.length ? bubbles.reduce((s, b) => s + (b.attendance || 0), 0) / bubbles.length : 0;
  const avgExam = bubbles.length ? bubbles.reduce((s, b) => s + (b.examAvg || 0), 0) / bubbles.length : 0;
  const dangerCount = bubbles.filter((b) => b.debtRatio > 0.3).length;
  const starCount = bubbles.filter((b) => (b.attendance || 0) >= 50 && (b.examAvg || 0) >= 50).length;

  return `
    <div class="ch-card" style="background:${C.card}; border:1px solid ${C.border}; border-radius:12px; padding:16px; margin-bottom:14px;">
      <div style="font-weight:700; font-size:14px; color:${C.primary}; margin-bottom:6px;">📊 خلاصة ${escapeXML(yearName || "")}</div>
      <div style="display:flex; gap:14px; flex-wrap:wrap; margin-bottom:10px; font-size:12px;">
        <span style="color:${C.muted};">المجموعات: <b style="color:${C.text};">${bubbles.length}</b></span>
        <span style="color:${C.muted};">الطلاب: <b style="color:${C.text};">${totalStudents}</b></span>
        <span style="color:${C.muted};">متوسط الحضور: <b style="color:${avgAttendance >= 50 ? C.success : C.danger};">${avgAttendance.toFixed(0)}%</b></span>
        <span style="color:${C.muted};">متوسط الدرجات: <b style="color:${avgExam >= 50 ? C.success : C.danger};">${avgExam.toFixed(0)}%</b></span>
        ${starCount ? `<span style="color:${C.success};">🌟 نجوم: ${starCount}</span>` : ""}
        ${dangerCount ? `<span style="color:${C.danger};">🚨 خطر: ${dangerCount}</span>` : ""}
      </div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%; max-width:${W}px; display:block;">
        ${axisSvg}
        ${quadrantLines}
        ${qLabels}
        ${bubblesSvg}
      </svg>
      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:8px; font-size:10px; color:${C.muted};">
        <span>🟢 ديون &lt; 10%</span>
        <span>🟡 ديون متوسطة</span>
        <span>🔴 ديون &gt; 30%</span>
        <span>⭕ حجم الدائرة = عدد الطلاب</span>
      </div>
    </div>`;
}

function escapeXML(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
