/* Aksa v3: lapisan akuntabilitas (SLA, eskalasi, verifikasi warga, segel digital, poin). Dimuat terakhir. */
const AGENCY = { jalan: 'Dinas Bina Marga', lampu: 'Dinas Bina Marga', jembatan: 'Dinas Bina Marga', drainase: 'Dinas Sumber Daya Air',
  sampah: 'Dinas Lingkungan Hidup', fasum: 'Dinas Cipta Karya & Fasum', proyek: 'Inspektorat' };
const SLA_D = { 1: 14, 2: 7, 3: 3 };
const slaDays = r => r.cat === 'proyek' ? 14 : SLA_D[r.sev];
const deadline = r => r.created + slaDays(r) * 864e5;
const resolvedAt = r => stageOf(r) < 3 ? null : (r.doneAt || r.seed ? r.created + 12 * 864e5 : r.created + 9e4);
function slaState(r) {
  const d = resolvedAt(r);
  if (d) return { done: true, late: d > deadline(r) };
  const left = deadline(r) - Date.now();
  return { done: false, late: left < 0, left };
}
const fmtDur = ms => { ms = Math.abs(ms); const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5);
  return d ? `${d} hr ${h} jam` : h ? `${h} jam` : `${Math.max(1, Math.floor(ms / 6e4))} mnt`; };
const overdueDays = r => { const s = slaState(r); return !s.done && s.late ? -s.left / 864e5 : 0; };
const escalated = r => overdueDays(r) >= 2;
reports.forEach(r => { if (r.id === 'AKSA-1005' && r.yes === undefined) { r.yes = 3; r.ratings = [5, 4, 4]; } });

/* ---------- Verifikasi warga ---------- */
function verifState(r) {
  if (stageOf(r) < 3) return null;
  const y = r.yes || 0, n = r.no || 0;
  return n >= 2 && n > y ? 'disputed' : y >= 2 ? 'verified' : 'pending';
}
function verifBadge(r) {
  const v = verifState(r); if (!v) return '';
  return v === 'verified' ? '<span class="badge-st vf-ok">✓ Terverifikasi warga</span>'
    : v === 'disputed' ? '<span class="badge-st vf-bad">Disengketakan warga</span>'
    : '<span class="badge-st vf-wait">Menunggu konfirmasi warga</span>';
}
function slaBadge(r) {
  const s = slaState(r);
  if (s.done) return verifBadge(r) + (s.late ? ' <span class="badge-st sla-late">Selesai terlambat</span>' : '');
  return (escalated(r) ? '<span class="badge-st sla-late">⚠ Dieskalasi</span> ' : '') +
    (s.late ? `<span class="badge-st sla-late">Lewat ${fmtDur(s.left)}</span>` : `<span class="badge-st sla-ok">Sisa ${fmtDur(s.left)}</span>`);
}
const confDone = id => { try { return JSON.parse(localStorage.getItem('aksa_conf') || '[]').includes(id); } catch (e) { return false; } };
function confirmFix(id, answer, photo) {
  const r = reports.find(x => x.id === id); if (!r) return;
  if (confDone(id)) return toast('Kamu sudah memberi konfirmasi untuk laporan ini.');
  const w = getMine().includes(id) ? 2 : 1;
  if (answer === 'yes') r.yes = (r.yes || 0) + w; else r.no = (r.no || 0) + w;
  if (photo) r.after = photo;
  try { const c = JSON.parse(localStorage.getItem('aksa_conf') || '[]'); c.push(id); localStorage.setItem('aksa_conf', JSON.stringify(c)); } catch (e) {}
  save(); addPoints(photo ? 15 : 10, photo ? 'bukti foto sesudah' : 'konfirmasi lapangan');
  drawMarkers(); renderList(); renderDetail(id);
}
let afterFor = null;
function compress(f, cb) {
  if (!f || !f.type.startsWith('image/')) return toast('File harus berupa gambar.');
  const img = new Image();
  img.onload = () => { const s = Math.min(1, 640 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = img.width * s; c.height = img.height * s; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    cb(c.toDataURL('image/jpeg', .6)); URL.revokeObjectURL(img.src); };
  img.src = URL.createObjectURL(f);
}
$('#afterInput').onchange = e => { compress(e.target.files[0], d => confirmFix(afterFor, 'yes', d)); e.target.value = ''; };

/* ---------- Segel digital (SHA-256 berantai) ---------- */
async function sha(t) {
  if (window.crypto && crypto.subtle) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  let h = 2166136261; for (const ch of t) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return 'fnv' + (h >>> 0).toString(16).padStart(8, '0');
}
const sealInput = (r, prev) => [r.id, r.lat, r.lng, r.cat, r.sev, r.desc, r.created, prev].join('|');
async function verifySeal(id) {
  const r = reports.find(x => x.id === id);
  if (!r || !r.hash) return null;
  return (await sha(sealInput(r, r.prev))) === r.hash;
}
async function sealAll() {
  let prev = 'GENESIS', dirty = false;
  for (const r of [...reports].sort((a, b) => a.created - b.created)) {
    if (!r.hash) { r.prev = prev; r.hash = await sha(sealInput(r, prev)); dirty = true; }
    prev = r.hash;
  }
  if (dirty) { save(); const id = $('#detailBody').dataset.id; if (id) renderDetail(id); }
}

/* ---------- Poin & level warga ---------- */
const LEVELS = [[0, 'Warga Baru'], [30, 'Mata Warga'], [80, 'Pengawas Kota'], [150, 'Penjaga Kota']];
const getPts = () => { try { return +localStorage.getItem('aksa_pts') || 0; } catch (e) { return 0; } };
function renderPoints() {
  const p = getPts(); let lv = LEVELS[0]; LEVELS.forEach(l => { if (p >= l[0]) lv = l; });
  $('#pointsChip').innerHTML = `<i class="bi bi-shield-check"></i> ${lv[1]} · ${p} poin`;
}
function addPoints(n, why) { try { localStorage.setItem('aksa_pts', getPts() + n); } catch (e) {} renderPoints(); toast(`+${n} poin: ${why}`); }
const _up = upvote;
upvote = function (id) { const r = reports.find(x => x.id === id), b = r ? r.votes : 0; _up(id); if (r && r.votes > b) addPoints(3, 'dukungan laporan'); };
window.upvote = upvote;

/* ---------- Pratinjau rute instansi di form ---------- */
const RISK_KW = ['anak', 'sekolah', 'malam', 'gelap', 'korban', 'kecelakaan', 'jatuh', 'banjir', 'arus', 'listrik', 'longsor', 'bayi', 'lansia', 'rumah sakit'];
function riskInfo(desc, sev, cat) {
  const t = (desc || '').toLowerCase(), hits = RISK_KW.filter(k => t.includes(k));
  const sc = sev * 2 + hits.length * 1.5 + (cat === 'jembatan' || cat === 'drainase' ? 1 : 0);
  return { level: sc >= 8 ? 'Tinggi' : sc >= 5 ? 'Sedang' : 'Rendah', hits };
}
const EST = { jalan: 5, lampu: 4, drainase: 6, sampah: 3, jembatan: 9, fasum: 7, proyek: 14 };
const estDays = r => Math.max(1, Math.round(EST[r.cat] * (r.sev === 3 ? .6 : r.sev === 1 ? 1.4 : 1)));
function showRoute() {
  const b = $('#routeBox'); if (!selCat) return b.classList.add('d-none');
  const sev = +document.querySelector('[name=sev]:checked').value, d = selCat === 'proyek' ? 14 : SLA_D[sev], rk = riskInfo($('#desc').value, sev, selCat);
  b.classList.remove('d-none');
  b.innerHTML = `<b>Diteruskan ke ${AGENCY[selCat]}</b><br>Respons pertama petugas maks. 6 jam, target selesai ${d} hari (estimasi perbaikan ±${estDays({ cat: selCat, sev })} hari).<br>Prediksi risiko: <b>${rk.level}</b>${rk.hits.length ? ` (terdeteksi: ${rk.hits.slice(0, 3).join(', ')})` : ''}. Lewat tenggat, laporan otomatis dieskalasi.` +
    (selCat === 'proyek' ? '<br>Tulis fakta yang kamu lihat, bukan tuduhan. Mengirim sebagai anonim disarankan.' : '');
}
$('#desc').addEventListener('input', () => showRoute());
const _pickCat = pickCat;
pickCat = function (k) { _pickCat(k); showRoute(); };
$('#sevGroup').addEventListener('change', () => showRoute());

/* ---------- Pin merah untuk yang terlambat ---------- */
function recolor() {
  reports.forEach(r => { const m = markers[r.id];
    if (m && cluster.hasLayer(m)) m.setIcon(pinIcon(CATS[r.cat].icon, overdueDays(r) > 0 ? 'late' : stageOf(r) === 3 && verifState(r) !== 'disputed' ? 'done' : '')); });
}
const _dm2 = drawMarkers;
drawMarkers = function () { _dm2(); recolor(); renderAccount(); renderChart(); };

/* ---------- Papan akuntabilitas ---------- */
function renderAccount() {
  const ag = {};
  reports.forEach(r => {
    const o = ag[AGENCY[r.cat]] || (ag[AGENCY[r.cat]] = { n: 0, done: 0, good: 0, bad: 0, late: 0, rs: [] }), s = slaState(r);
    o.n++; o.rs.push(...(r.ratings || []));
    if (s.done) { o.done++; (!s.late && verifState(r) !== 'disputed') ? o.good++ : o.bad++; }
    else if (s.late) { o.bad++; o.late++; }
  });
  const rows = Object.entries(ag).map(([a, o]) => ({ a, ...o, score: o.good + o.bad ? Math.round(o.good / (o.good + o.bad) * 100) : null }))
    .sort((x, y) => (y.score ?? -1) - (x.score ?? -1));
  $('#agTable').innerHTML = `<thead><tr><th>Instansi</th><th class="text-center">Laporan</th><th class="text-center">Selesai</th><th class="text-center">Terlambat</th><th class="text-center">Kepuasan</th><th style="min-width:150px">Skor akuntabilitas</th></tr></thead><tbody>` +
    rows.map(o => { const col = o.score >= 70 ? '#2e9e5b' : o.score >= 40 ? '#f2b01e' : '#e53935';
      return `<tr><td class="fw-semibold">${o.a}</td><td class="text-center">${o.n}</td><td class="text-center">${o.done}</td><td class="text-center">${o.late}</td><td class="text-center">${o.rs.length ? (o.rs.reduce((a, b) => a + b, 0) / o.rs.length).toFixed(1) + '★' : '–'}</td><td>` +
        (o.score == null ? '<span class="text-muted small">Belum ada data</span>'
          : `<div class="d-flex align-items-center gap-2"><div class="progress flex-fill" style="height:8px"><div class="progress-bar" style="width:${o.score}%;background:${col}"></div></div><b>${o.score}</b></div>`) + '</td></tr>'; }).join('') + '</tbody>';
  const late = reports.filter(r => overdueDays(r) > 0).sort((a, b) => overdueDays(b) - overdueDays(a)).slice(0, 4);
  $('#lateList').innerHTML = late.length ? late.map(r => `<div class="rep" role="button" tabindex="0" data-id="${r.id}">
    <div class="ph">${CATS[r.cat].icon}</div><div class="flex-fill" style="min-width:0"><div class="fw-bold">${CATS[r.cat].label} <small class="text-muted fw-normal">· ${AGENCY[r.cat]}</small></div>
    <div class="small text-muted text-truncate">${esc(r.desc)}</div><div class="mt-1">${slaBadge(r)}</div></div></div>`).join('')
    : '<div class="empty">Tidak ada laporan yang melewati tenggat. Bagus!</div>';
}
$('#lateList').onclick = e => { const el = e.target.closest('.rep'); if (el) openDetail(el.dataset.id); };
$('#lateList').addEventListener('keydown', e => { if (e.key === 'Enter') { const el = e.target.closest('.rep'); if (el) openDetail(el.dataset.id); } });

let catChart;
function renderChart() {
  if (!window.Chart) return;
  const keys = Object.keys(CATS), data = keys.map(k => reports.filter(r => r.cat === k).length), color = getComputedStyle(document.body).color;
  if (!catChart) {
    catChart = new Chart($('#catChart'), { type: 'doughnut', data: { labels: keys.map(k => CATS[k].icon + ' ' + CATS[k].label),
      datasets: [{ data, backgroundColor: ['#ff7a2f', '#f9df9a', '#7c4dff', '#2e9e5b', '#cdb8fb', '#ffb184', '#8a7f95'], borderWidth: 0 }] },
      options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { color, boxWidth: 12 } }, title: { display: true, text: 'Jenis laporan', color } } } });
  } else {
    catChart.data.datasets[0].data = data;
    catChart.options.plugins.legend.labels.color = color; catChart.options.plugins.title.color = color; catChart.update();
  }
}
const _at = applyTheme;
applyTheme = function (t) { _at(t); setTimeout(renderChart, 0); };

$('#detailBody').addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = $('#detailBody').dataset.id, a = b.dataset.act;
  if (a === 'yes' || a === 'no') confirmFix(id, a);
  if (a === 'after') { afterFor = id; $('#afterInput').click(); }
  if (a === 'seal') {
    const ok = await verifySeal(id);
    toast(ok === null ? 'Segel belum selesai dibuat. Coba lagi sebentar.' : ok ? 'Segel valid: isi laporan tidak berubah sejak dikirim.' : 'Segel TIDAK cocok: isi laporan telah berubah.');
  }
});

/* ---------- Setelah laporan terkirim ---------- */
$('#doneModal').addEventListener('show.bs.modal', () => {
  $('#routeBox').classList.add('d-none');
  const id = $('#ticketCode').textContent, r = reports.find(x => x.id === id);
  addPoints(20, 'laporan terkirim');
  if (!r) return;
  const prev = reports.filter(x => x.id !== id && x.hash).sort((a, b) => b.created - a.created)[0];
  r.prev = prev ? prev.hash : 'GENESIS';
  sha(sealInput(r, r.prev)).then(h => { r.hash = h; save(); });
});

renderPoints();
sealAll();
renderAll();
