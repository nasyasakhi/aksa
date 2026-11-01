/* Aksa v4: fitur gabungan terinspirasi JAKI (CRM, bukti tindak lanjut, umpan balik) dan Laporin (PIC, notifikasi, kepuasan). Dimuat terakhir. */

/* ---------- Status: simulasi hanya sampai "Diverifikasi"; selanjutnya lewat Mode Petugas ---------- */
const _stageOf = stageOf;
stageOf = function (r) { if (r.stageSet !== undefined) return r.stageSet; const s = _stageOf(r); return r.seed ? s : Math.min(s, 1); };
const _sb = slaBadge;
slaBadge = function (r) {
  return (stageOf(r) === 0 && Date.now() - r.created > 6 * 36e5 ? '<span class="badge-st vf-bad">Belum direspons >6 jam</span> ' : '') + _sb(r);
};

/* ---------- PIC (penanggung jawab, nama contoh) ---------- */
const PICS = { 'Dinas Bina Marga': ['Budi Hartono', 'Rina Wulandari'], 'Dinas Sumber Daya Air': ['Agus Salim', 'Dewi Lestari'],
  'Dinas Lingkungan Hidup': ['Siti Aminah', 'Yoga Pratama'], 'Dinas Cipta Karya & Fasum': ['Hendra Gunawan', 'Maya Sari'], 'Inspektorat': ['Rudi Santoso', 'Lina Marlina'] };
const pickPic = r => { const l = PICS[AGENCY[r.cat]]; return l[r.id.charCodeAt(r.id.length - 1) % l.length]; };

/* ---------- Pemeriksaan foto: umur file + kemiripan (average hash) ---------- */
function aHashFrom(src) {
  return new Promise(res => {
    const i = new Image();
    i.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 8; const x = c.getContext('2d'); x.drawImage(i, 0, 0, 8, 8);
      const d = x.getImageData(0, 0, 8, 8).data, g = []; for (let k = 0; k < 64; k++) g.push(d[k * 4] * .3 + d[k * 4 + 1] * .59 + d[k * 4 + 2] * .11);
      const m = g.reduce((a, b) => a + b, 0) / 64; res(g.map(v => v > m ? '1' : '0').join('')); };
    i.onerror = () => res(null); i.src = src;
  });
}
const ham = (a, b) => { let n = 0; for (let k = 0; k < 64; k++) if (a[k] !== b[k]) n++; return n; };
let lastPh = null, lastWarn = '';
async function checkPhoto(f) {
  if (!f || !f.type.startsWith('image/')) return;
  const box = $('#photoCheck'); box.textContent = 'Memeriksa keaslian foto…';
  const url = URL.createObjectURL(f), h = await aHashFrom(url); URL.revokeObjectURL(url);
  lastPh = h; const msgs = [], age = (Date.now() - f.lastModified) / 36e5;
  if (f.lastModified && age > 48) msgs.push(`Foto berumur sekitar ${Math.round(age / 24)} hari. Gunakan foto yang baru diambil.`);
  const dup = h && reports.find(x => x.ph && ham(x.ph, h) <= 4);
  if (dup) msgs.push(`Foto sangat mirip dengan laporan ${dup.id}. Pastikan ini bukan foto yang sama.`);
  lastWarn = msgs.join(' ');
  box.innerHTML = msgs.length ? msgs.map(m => `<div class="pc-warn">⚠ ${esc(m)}</div>`).join('') : '<div class="pc-ok">✓ Foto tampak baru dan belum pernah dilaporkan (pemeriksaan sederhana, bukan AI).</div>';
}
const _hp = handlePhoto;
handlePhoto = function (f) { _hp(f); checkPhoto(f); };
$('#doneModal').addEventListener('show.bs.modal', () => {
  const r = reports.find(x => x.id === $('#ticketCode').textContent);
  if (r) { r.ph = lastPh; r.pw = lastWarn; save(); }
  lastPh = null; lastWarn = ''; $('#photoCheck').innerHTML = '';
});

/* ---------- Notifikasi browser ---------- */
function notify(msg) {
  toast(msg);
  if ('Notification' in window && Notification.permission === 'granted') { try { new Notification('Aksa', { body: msg }); } catch (e) {} }
}
function updateBell() { $('#bellBtn').innerHTML = ('Notification' in window && Notification.permission === 'granted') ? '<i class="bi bi-bell-fill"></i>' : '<i class="bi bi-bell"></i>'; }
$('#bellBtn').onclick = async () => {
  if (!('Notification' in window)) return toast('Browser ini tidak mendukung notifikasi.');
  const p = await Notification.requestPermission();
  toast(p === 'granted' ? 'Notifikasi aktif untuk laporanmu.' : 'Notifikasi ditolak. Kamu tetap melihat pemberitahuan di halaman.'); updateBell();
};
updateBell();

/* ---------- Ukuran teks (aksesibilitas) ---------- */
const SIZES = [100, 112, 125]; let sz = 0;
try { sz = (+localStorage.getItem('aksa_sz') || 0) % SIZES.length; } catch (e) {}
const applySize = () => { document.documentElement.style.fontSize = SIZES[sz] + '%'; };
applySize();
$('#a11yBtn').onclick = () => { sz = (sz + 1) % SIZES.length; try { localStorage.setItem('aksa_sz', sz); } catch (e) {} applySize(); toast(`Ukuran teks ${SIZES[sz]}%`); };

/* ---------- Filter peta: status + waktu ---------- */
function passFilter(r) {
  if (activeFilter !== 'all' && r.cat !== activeFilter) return false;
  const sv = $('#statusSel').value, s = slaState(r);
  if (sv === 'aktif' && s.done) return false;
  if (sv === 'late' && !(overdueDays(r) > 0)) return false;
  if (sv === 'done' && !s.done) return false;
  const t = $('#timeSel').value;
  return !(t !== 'all' && Date.now() - r.created > +t * 864e5);
}
const _dm3 = drawMarkers;
drawMarkers = function () {
  _dm3();
  reports.forEach(r => { const m = markers[r.id]; if (m && cluster.hasLayer(m) && !passFilter(r)) cluster.removeLayer(m); });
  refreshHeat();
};
$('#statusSel').onchange = $('#timeSel').onchange = () => drawMarkers();

/* ---------- Statistik gaya Laporin ---------- */
renderStats = function () {
  const done = reports.filter(r => slaState(r).done), good = done.filter(r => !slaState(r).late && verifState(r) !== 'disputed').length;
  const rs = reports.flatMap(r => r.ratings || []);
  const items = [[reports.length, 'Laporan diterima'], [done.length ? Math.round(good / done.length * 100) + '%' : '–', 'Selesai tepat waktu'],
    [new Set(Object.values(AGENCY)).size, 'Instansi terdaftar'], [rs.length ? (rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(1) + '★' : '–', 'Kepuasan warga']];
  $('#stats').innerHTML = items.map(i => `<div class="col-6 col-md-3"><div class="stat"><b>${i[0]}</b>${i[1]}</div></div>`).join('');
};

/* ---------- Mode petugas (demo CRM) ---------- */
let officerMode = false, fuFor = null;
try { officerMode = localStorage.getItem('aksa_ofc') === '1'; } catch (e) {}
$('#ofcBtn').classList.toggle('active', officerMode);
$('#ofcBtn').onclick = () => {
  officerMode = !officerMode; try { localStorage.setItem('aksa_ofc', officerMode ? '1' : '0'); } catch (e) {}
  $('#ofcBtn').classList.toggle('active', officerMode);
  const id = $('#detailBody').dataset.id; if (id && $('#detailModal').classList.contains('show')) renderDetail(id);
  toast(officerMode ? 'Mode petugas (demo) aktif. Buka detail laporan untuk memproses.' : 'Mode petugas dimatikan.');
};
$('#fuInput').onchange = e => {
  const id = fuFor; compress(e.target.files[0], async d => {
    const r = reports.find(x => x.id === id); if (!r) return;
    r.fu = d; r.fuHash = await sha(d); r.fuFlag = null;
    const h = await aHashFrom(d); r.fuAh = h;
    if (h) {
      if (r.ph && ham(r.ph, h) <= 4) r.fuFlag = 'Foto tindak lanjut hampir identik dengan foto sebelum. Belum ada perubahan yang terlihat.';
      else { const o = reports.find(x => x.id !== id && ((x.ph && ham(x.ph, h) <= 4) || (x.fuAh && ham(x.fuAh, h) <= 4))); if (o) r.fuFlag = `Foto tindak lanjut mirip dengan laporan ${o.id}. Kemungkinan dipakai ulang.`; }
    }
    save(); renderDetail(id); toast(r.fuFlag ? 'Foto diunggah, tetapi ditandai mencurigakan.' : 'Foto tindak lanjut tersimpan dan di-hash.');
  });
  e.target.value = '';
};
const ratedDone = id => { try { return JSON.parse(localStorage.getItem('aksa_rated') || '[]').includes(id); } catch (e) { return false; } };

/* ---------- Detail laporan ---------- */
function renderDetail(id) {
  const r = reports.find(x => x.id === id); if (!r) return;
  const st = stageOf(r), p = prio(r), [pl, pc] = prioLevel(p), c = CATS[r.cat], v = verifState(r), rk = riskInfo(r.desc, r.sev, r.cat);
  const imgs = [[r.photo, 'Sebelum'], [r.fu, 'Tindak lanjut petugas'], [r.after, 'Sesudah (warga)']].filter(x => x[0]);
  const rs = r.ratings || [], avg = rs.length ? (rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(1) : null;
  const NEXT = ['Verifikasi laporan', 'Mulai perbaikan', 'Tandai selesai'];
  $('#detailBody').dataset.id = id;
  $('#detailBody').innerHTML = `
    <div class="d-flex justify-content-between align-items-start mb-2"><div><div class="h5 fw-bold mb-0">${c.icon} ${c.label}</div>
      <small class="text-muted">${r.id} · ${ago(r.created)} · oleh ${r.anon ? 'Anonim' : esc(r.name || 'Warga')}</small></div>
      <button class="btn-close" data-bs-dismiss="modal" aria-label="Tutup"></button></div>
    ${imgs.length > 1 ? `<div class="ba" style="grid-template-columns:repeat(${imgs.length},1fr)">${imgs.map(i => `<figure><img src="${i[0]}" alt="${i[1]}"><figcaption>${i[1]}</figcaption></figure>`).join('')}</div>`
      : r.photo ? `<img class="detail-img" src="${r.photo}" alt="Foto kerusakan">` : ''}
    ${r.fuFlag ? `<div class="alert alert-danger small py-2 mt-2">⚠ ${esc(r.fuFlag)}</div>` : ''}
    ${r.pw ? `<div class="small pc-warn mt-1">⚠ ${esc(r.pw)}</div>` : ''}
    <div class="d-flex flex-wrap gap-2 my-2"><span class="badge-st st-${st}">${STAGES[st]}</span><span class="badge-st sev-${r.sev}">${SEVL[r.sev]}</span>
      ${st < 3 ? `<span class="badge-st pr-${pc}">Prioritas ${pl} (${p})</span>` : ''}${slaBadge(r)}</div>
    <div class="small mb-1">${st >= 1 ? `<b>PIC:</b> ${r.pic || pickPic(r)} <span class="text-muted">(nama contoh)</span> · ` : ''}<b>Instansi:</b> ${AGENCY[r.cat]} · <b>Tenggat:</b> ${new Date(deadline(r)).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} (${slaDays(r)} hari)</div>
    ${st < 3 ? `<div class="small mb-2"><b>Estimasi perbaikan:</b> ±${estDays(r)} hari · <b>Risiko:</b> ${rk.level}${rk.hits.length ? ` (${rk.hits.slice(0, 3).join(', ')})` : ''} <span class="text-muted">(berbasis aturan)</span></div>` : ''}
    ${escalated(r) ? '<div class="alert alert-danger small py-2">Lewat tenggat lebih dari 2 hari. Laporan ini dieskalasi ke Inspektorat dan Ombudsman.</div>' : ''}
    <p class="mb-1">${esc(r.desc)}</p>
    <p class="small text-muted"><i class="bi bi-geo-alt"></i> ${esc(r.addr || r.lat.toFixed(5) + ', ' + r.lng.toFixed(5))}</p>
    ${officerMode && st < 3 ? `<div class="ofc-box"><b>Panel petugas (demo)</b><div class="small text-muted mb-2">${AGENCY[r.cat]}. Menandai selesai wajib disertai foto tindak lanjut; foto dicek kemiripannya dan di-hash.</div>
      <div class="d-flex gap-2 flex-wrap">${st >= 1 ? '<button class="btn btn-sm btn-outline-aksa" data-act="ofc-fu">📷 Foto tindak lanjut</button>' : ''}<button class="btn btn-sm btn-aksa" data-act="ofc-next">${NEXT[st]}</button></div></div>` : ''}
    ${st === 3 ? `<div class="route-box"><b>Instansi menandai ini selesai. Benarkah?</b><br>${r.yes || 0} suara setuju, ${r.no || 0} menolak. Perlu 2 suara agar sah.
      <div class="d-flex gap-2 mt-2 flex-wrap">${confDone(id) ? '<span class="small text-muted">Kamu sudah memberi konfirmasi.</span>'
        : '<button class="btn btn-sm btn-aksa" data-act="yes">✅ Sudah diperbaiki</button><button class="btn btn-sm btn-outline-aksa" data-act="after">📷 Foto sesudah</button><button class="btn btn-sm btn-outline-aksa" data-act="no">❌ Belum</button>'}</div></div>` : ''}
    ${v === 'verified' ? `<div class="mb-3"><div class="small fw-semibold">Kepuasan warga: ${avg ? avg + '★ (' + rs.length + ' penilaian)' : 'belum ada penilaian'}</div>
      ${ratedDone(id) ? '' : `<div class="stars">${[1, 2, 3, 4, 5].map(n => `<button data-act="rate" data-v="${n}" aria-label="${n} bintang">★</button>`).join('')}</div>`}</div>` : ''}
    <ul class="timeline">${STAGES.map((s, i) => `<li class="${i <= st ? 'on' : ''}">${s}</li>`).join('')}</ul>
    <div class="seal mb-3">🔐 Segel laporan SHA-256: ${r.hash ? r.hash.slice(0, 16) + '…' : 'menyegel…'} <button class="btn btn-sm btn-link p-0 ms-1" data-act="seal">Verifikasi</button>
      ${r.fuHash ? `<br>📎 Hash foto tindak lanjut: ${r.fuHash.slice(0, 16)}…` : ''}</div>
    <div class="d-flex gap-2"><button class="btn btn-aksa flex-fill" data-act="vote">👍 Dukung (${r.votes})</button>
      <button class="btn btn-outline-aksa" data-act="share" aria-label="Bagikan"><i class="bi bi-share-fill"></i></button>
      <button class="btn btn-outline-aksa" data-act="focus" aria-label="Lihat di peta"><i class="bi bi-map-fill"></i></button></div>`;
}
$('#detailBody').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = $('#detailBody').dataset.id, a = b.dataset.act, r = reports.find(x => x.id === id); if (!r) return;
  if (a === 'ofc-fu') { fuFor = id; $('#fuInput').click(); }
  if (a === 'ofc-next') {
    const st = stageOf(r); if (st >= 3) return;
    if (st === 2 && !r.fu) return toast('Unggah foto tindak lanjut sebagai bukti sebelum menandai selesai.');
    r.stageSet = st + 1; r.pic = r.pic || pickPic(r); if (st + 1 === 3) r.doneAt = Date.now();
    lastStage[id] = st + 1; save(); notify(`Laporan ${id} kini: ${STAGES[st + 1]}`); drawMarkers(); renderList(); renderStats(); renderDetail(id);
  }
  if (a === 'rate') {
    if (ratedDone(id)) return toast('Kamu sudah memberi penilaian.');
    (r.ratings = r.ratings || []).push(+b.dataset.v);
    try { const l = JSON.parse(localStorage.getItem('aksa_rated') || '[]'); l.push(id); localStorage.setItem('aksa_rated', JSON.stringify(l)); } catch (e) {}
    save(); addPoints(5, 'penilaian tindak lanjut'); renderAll(); renderDetail(id);
  }
});

renderAll();
