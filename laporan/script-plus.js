/* Aksa - Lapor Kerusakan v2: fitur tambahan (dimuat setelah lapor.js, berbagi scope global yang sama) */
const SEVL = ['', 'Ringan', 'Sedang', 'Berbahaya'];
const getMine = () => { try { return JSON.parse(localStorage.getItem('aksa_mine') || '[]'); } catch (e) { return []; } };
const DRAFT_KEY = 'aksa_draft';
let mineOnly = false, sortMode = 'new', heatOn = false, satOn = false;
let pending = { anon: false, name: '' };
const lastStage = {};

/* ---------- Skor prioritas: keparahan + dukungan warga + lama menunggu ---------- */
const prio = r => Math.round(r.sev * 12 + r.votes * 4 + Math.min((Date.now() - r.created) / 864e5, 30) * 1.5);
const prioLevel = s => s >= 50 ? ['Tinggi', 'hi'] : s >= 32 ? ['Sedang', 'md'] : ['Rendah', 'lo'];

/* ---------- Mode gelap ---------- */
function applyTheme(t) {
  document.documentElement.setAttribute('data-bs-theme', t);
  try { localStorage.setItem('aksa_theme', t); } catch (e) {}
  $('#themeBtn').innerHTML = t === 'dark' ? '<i class="bi bi-sun-fill"></i>' : '<i class="bi bi-moon-stars-fill"></i>';
}
applyTheme((() => { try { return localStorage.getItem('aksa_theme'); } catch (e) { return null; } })() || 'light');
$('#themeBtn').onclick = () => applyTheme(document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark');

/* ---------- Heatmap titik rawan ---------- */
const heat = L.heatLayer([], { radius: 32, blur: 24, maxZoom: 15, gradient: { .3: '#cdb8fb', .6: '#ff7a2f', 1: '#e53935' } });
function refreshHeat() {
  heat._latlngs = reports.filter(r => activeFilter === 'all' || r.cat === activeFilter)
    .map(r => [r.lat, r.lng, Math.min(1, r.sev / 3 * .6 + r.votes * .06)]);
  if (heatOn) {
    if (map.hasLayer(cluster)) map.removeLayer(cluster);
    if (!map.hasLayer(heat)) heat.addTo(map); else heat.redraw();
  } else {
    if (map.hasLayer(heat)) map.removeLayer(heat);
    if (!map.hasLayer(cluster)) map.addLayer(cluster);
  }
}
function setHeat(on) { heatOn = on; $('#heatBtn').classList.toggle('active', on); refreshHeat(); }
$('#heatBtn').onclick = () => setHeat(!heatOn);
const _drawMarkers = drawMarkers;
drawMarkers = function () { _drawMarkers(); refreshHeat(); };

/* ---------- Satelit ---------- */
const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles © Esri' });
$('#satBtn').onclick = () => {
  satOn = !satOn;
  satOn ? sat.addTo(map) : map.removeLayer(sat);
  $('#map').classList.toggle('sat', satOn);
  $('#satBtn').classList.toggle('active', satOn);
};

/* ---------- Cari lokasi ---------- */
async function searchPlace() {
  const q = $('#placeSearch').value.trim(); if (!q) return;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=id&accept-language=id&q=${encodeURIComponent(q)}`);
    const j = await res.json();
    if (!j.length) return toast('Lokasi tidak ditemukan. Coba nama jalan atau kelurahan.');
    setLocation(+j[0].lat, +j[0].lon, true);
  } catch (e) { toast('Gagal mencari lokasi. Periksa koneksi internetmu.'); }
}
$('#placeBtn').onclick = searchPlace;
$('#placeSearch').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); searchPlace(); } });

/* ---------- Input suara ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  const mic = $('#micBtn'); let rec, on = false;
  mic.classList.remove('d-none');
  mic.onclick = () => {
    if (on) { rec.stop(); return; }
    rec = new SR(); rec.lang = 'id-ID'; rec.interimResults = false;
    rec.onstart = () => { on = true; mic.classList.add('listening'); mic.innerHTML = '<i class="bi bi-stop-circle-fill"></i> Berhenti'; };
    rec.onend = () => { on = false; mic.classList.remove('listening'); mic.innerHTML = '<i class="bi bi-mic-fill"></i> Bicara'; };
    rec.onerror = () => toast('Mikrofon tidak bisa dipakai. Izinkan akses mikrofon lalu coba lagi.');
    rec.onresult = e => {
      const d = $('#desc'); d.value = ((d.value ? d.value + ' ' : '') + e.results[0][0].transcript).slice(0, 300);
      d.dispatchEvent(new Event('input', { bubbles: true }));
    };
    rec.start();
  };
}

/* ---------- Anonim + draf otomatis ---------- */
function syncAnon() { $('#reporter').disabled = $('#anon').checked; if ($('#anon').checked) $('#reporter').value = ''; }
function saveDraft() {
  pending = { anon: $('#anon').checked, name: $('#reporter').value.trim() };
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ d: $('#desc').value, l: $('#landmark').value, n: $('#reporter').value, a: $('#anon').checked })); } catch (e) {}
}
$('#anon').addEventListener('change', () => { syncAnon(); saveDraft(); });
$('#reportForm').addEventListener('input', saveDraft);
try {
  const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
  if (d) {
    $('#landmark').value = d.l || ''; $('#reporter').value = d.n || ''; $('#anon').checked = !!d.a; syncAnon();
    if (d.d) { $('#desc').value = d.d; $('#desc').dispatchEvent(new Event('input', { bubbles: true })); toast('Draf laporanmu dipulihkan.'); }
    pending = { anon: !!d.a, name: d.n || '' };
  }
} catch (e) {}

/* ---------- Setelah laporan terkirim ---------- */
$('#doneModal').addEventListener('show.bs.modal', () => {
  const id = $('#ticketCode').textContent, r = reports.find(x => x.id === id);
  if (r) { r.anon = pending.anon; r.name = pending.anon ? '' : pending.name; save(); }
  const m = getMine(); if (!m.includes(id)) { m.push(id); try { localStorage.setItem('aksa_mine', JSON.stringify(m)); } catch (e) {} }
  lastStage[id] = 0; pending = { anon: false, name: '' };
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
  renderList();
});

/* ---------- Daftar laporan (urut, filter "Laporanku") ---------- */
renderList = function () {
  const mine = getMine();
  const l = reports.filter(r => !mineOnly || mine.includes(r.id));
  if (sortMode === 'prio') l.sort((a, b) => prio(b) - prio(a));
  else if (sortMode === 'votes') l.sort((a, b) => b.votes - a.votes);
  else l.sort((a, b) => b.created - a.created);
  $('#reportList').innerHTML = l.length ? l.slice(0, 8).map(r => {
    const st = stageOf(r), [pl, pc] = prioLevel(prio(r));
    return `<div class="rep" role="button" tabindex="0" data-id="${r.id}">
      ${r.photo ? `<img src="${r.photo}" alt="">` : `<div class="ph">${CATS[r.cat].icon}</div>`}
      <div class="flex-fill" style="min-width:0"><div class="fw-bold">${CATS[r.cat].label}
        <span class="badge-st st-${st}">${STAGES[st]}</span>${st < 3 ? ` <span class="badge-st pr-${pc}">${pl}</span>` : ''}<div class="mt-1">${slaBadge(r)}</div></div>
      <div class="small text-muted text-truncate">${esc(r.desc)}</div>
      <div class="small text-muted">${r.id} · ${ago(r.created)} · 👍 ${r.votes}</div></div></div>`;
  }).join('') : '<div class="empty">Kamu belum punya laporan. Mulai dengan memotret kerusakan di formulir.</div>';
};
$('#mineOnly').onchange = e => { mineOnly = e.target.checked; renderList(); };
$('#sortSel').onchange = e => { sortMode = e.target.value; renderList(); };
$('#reportList').onclick = e => { const el = e.target.closest('.rep'); if (el) openDetail(el.dataset.id); };
$('#reportList').addEventListener('keydown', e => { if (e.key === 'Enter') { const el = e.target.closest('.rep'); if (el) openDetail(el.dataset.id); } });

/* ---------- Detail laporan ---------- */
popupHtml = function (r) {
  const c = CATS[r.cat];
  return `${r.photo ? `<img class="popup-img" src="${r.photo}" alt="">` : ''}<b>${c.icon} ${c.label}</b><br><small>${esc(r.desc)}</small><br>
    <span class="badge-st st-${stageOf(r)} mt-1 d-inline-block">${STAGES[stageOf(r)]}</span>
    <button class="btn btn-sm btn-aksa mt-2 w-100" onclick="openDetail('${r.id}')">Lihat detail</button>
    <button class="btn btn-sm btn-outline-aksa mt-1 w-100" onclick="upvote('${r.id}')">👍 Saya juga melihat ini (${r.votes})</button>`;
};
const osmLink = r => `https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=18/${r.lat}/${r.lng}`;
function openDetail(id) {
  renderDetail(id);
  map.closePopup();
  bootstrap.Modal.getOrCreateInstance('#detailModal').show();
}
window.openDetail = openDetail;
$('#detailBody').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = $('#detailBody').dataset.id, r = reports.find(x => x.id === id);
  if (b.dataset.act === 'vote') { upvote(id); renderDetail(id); }
  if (b.dataset.act === 'share') {
    const text = `Ada ${CATS[r.cat].label.toLowerCase()} yang perlu ditangani. Kode laporan Aksa: ${r.id}. Lokasi: ${osmLink(r)}`;
    navigator.share ? navigator.share({ title: 'Laporan Aksa', text }).catch(() => {}) : window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  }
  if (b.dataset.act === 'focus') { bootstrap.Modal.getInstance('#detailModal').hide(); focusReport(id); }
});
function focusReport(id) {
  const r = reports.find(x => x.id === id); if (!r) return;
  if (heatOn) setHeat(false);
  if (activeFilter !== 'all' && activeFilter !== r.cat) filt.querySelector('[data-k=all]').click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  map.flyTo([r.lat, r.lng], 17);
  setTimeout(() => { const m = markers[id]; if (m && cluster.hasLayer(m)) cluster.zoomToShowLayer(m, () => m.openPopup()); }, 900);
}

/* ---------- Ekspor CSV ---------- */
$('#exportBtn').onclick = () => {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['kode', 'kategori', 'keparahan', 'status', 'prioritas', 'lat', 'lng', 'alamat', 'deskripsi', 'dukungan', 'dibuat', 'instansi', 'tenggat', 'terlambat']];
  reports.forEach(r => rows.push([r.id, CATS[r.cat].label, SEVL[r.sev], STAGES[stageOf(r)], prio(r), r.lat, r.lng, r.addr, r.desc, r.votes, new Date(r.created).toISOString(), AGENCY[r.cat], new Date(deadline(r)).toISOString(), slaState(r).late ? 'ya' : 'tidak']));
  const blob = new Blob(['\ufeff' + rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'laporan-aksa.csv' });
  a.click(); URL.revokeObjectURL(a.href);
};

/* ---------- Notifikasi status & koneksi ---------- */
getMine().forEach(id => { const r = reports.find(x => x.id === id); if (r) lastStage[id] = stageOf(r); });
setInterval(() => {
  let changed = false;
  getMine().forEach(id => {
    const r = reports.find(x => x.id === id); if (!r) return;
    const st = stageOf(r);
    if (lastStage[id] !== undefined && st > lastStage[id]) { toast(`Laporan ${id} kini: ${STAGES[st]}`); changed = true; }
    lastStage[id] = st;
  });
  if (changed) drawMarkers();
  renderList();
}, 5000);
window.addEventListener('offline', () => toast('Kamu offline. Peta dan pencarian alamat butuh internet.'));
window.addEventListener('online', () => toast('Kembali online.'));