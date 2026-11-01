/* Aksa - Lapor Kerusakan (Smart Reporting & Mapping) */
const CATS = {
  jalan:   {label:'Jalan rusak',   icon:'🕳️', kw:['jalan','lubang','aspal','retak','berlubang','trotoar']},
  lampu:   {label:'Lampu mati',    icon:'💡', kw:['lampu','pju','gelap','penerangan','tiang']},
  drainase:{label:'Drainase/banjir',icon:'💧', kw:['banjir','got','selokan','drainase','air','tergenang','mampet']},
  sampah:  {label:'Sampah/lingkungan',icon:'🗑️', kw:['sampah','limbah','bau','tumpukan','polusi','asap']},
  jembatan:{label:'Jembatan',      icon:'🌉', kw:['jembatan','pagar','longsor','tiang jembatan']},
  fasum:   {label:'Fasilitas umum',icon:'🏫', kw:['halte','taman','bangku','toilet','fasilitas','sekolah','rambu']},
  proyek:  {label:'Dugaan penyimpangan',icon:'🔎', kw:['proyek','mangkrak','korupsi','pungli','anggaran','material','kontraktor','dana']}
};
const STAGES = ['Dikirim','Diverifikasi','Dalam perbaikan','Selesai'];
const KEY = 'aksa_reports_v2';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- Data ---------- */
const now = Date.now(), H = 36e5;
const SEED = [
  [-6.1754,106.8272,'jalan',3,'Lubang besar di tengah jalan, sering bikin motor oleng.',3,2],
  [-6.2146,106.8451,'lampu',2,'Lampu PJU mati 3 minggu, jalanan gelap saat malam.',1,1],
  [-6.2297,106.8003,'drainase',3,'Got tersumbat, air meluap setiap hujan.',2,2],
  [-6.1865,106.8341,'sampah',2,'Tumpukan sampah menutup separuh trotoar.',1,0],
  [-6.2441,106.8481,'fasum',1,'Halte bus rusak, atap bocor.',3,3],
  [-6.1992,106.8223,'jembatan',3,'Pagar pembatas jembatan penyeberangan patah.',2,1],
  [-6.2615,106.8106,'proyek',2,'Proyek trotoar mangkrak 3 bulan, material dibiarkan menutup jalur pejalan kaki.',4,1]
].map((r,i)=>({id:'AKSA-'+(1001+i),lat:r[0],lng:r[1],cat:r[2],sev:r[3],desc:r[4],votes:r[5],stage:r[6],
  addr:'Jakarta',photo:null,created:now-[4,6,1,10,20,5,3][i]*24*H,seed:true}));

let reports = JSON.parse(localStorage.getItem(KEY) || 'null') || SEED;
const save = () => { try{localStorage.setItem(KEY, JSON.stringify(reports));}catch(e){toast('Penyimpanan penuh, foto tidak tersimpan.');} };

/* Demo: laporan baru "naik status" otomatis agar fitur pelacakan terlihat hidup */
function stageOf(r){
  if(r.seed) return r.stage;
  const s=(Date.now()-r.created)/1000;
  return s>90?3:s>50?2:s>15?1:0;
}

/* ---------- Map ---------- */
const map = L.map('map',{zoomControl:true}).setView([-6.2088,106.8456],12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
const cluster = L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:45}).addTo(map);
const markers = {};
let draft = null, selLoc = null, selCat = null, photoData = null, activeFilter = 'all', catTouched = false;

const pinIcon = (emoji,cls) => L.divIcon({className:'',html:`<div class="pin ${cls}"><span>${emoji}</span></div>`,iconSize:[36,36],iconAnchor:[18,36],popupAnchor:[0,-34]});

function popupHtml(r){
  const c=CATS[r.cat];
  return `${r.photo?`<img class="popup-img" src="${r.photo}" alt="">`:''}
    <b>${c.icon} ${c.label}</b><br><small>${esc(r.desc)}</small><br>
    <span class="badge-st st-${stageOf(r)} mt-1 d-inline-block">${STAGES[stageOf(r)]}</span>
    <button class="btn btn-sm btn-outline-aksa mt-2 w-100" onclick="upvote('${r.id}')">👍 Saya juga melihat ini (${r.votes})</button>`;
}
function drawMarkers(){
  cluster.clearLayers();
  reports.filter(r=>activeFilter==='all'||r.cat===activeFilter).forEach(r=>{
    const done = stageOf(r)===3;
    const m = L.marker([r.lat,r.lng],{icon:pinIcon(CATS[r.cat].icon,done?'done':'')}).bindPopup(()=>popupHtml(r));
    markers[r.id]=m; cluster.addLayer(m);
  });
}
function upvote(id){
  const r=reports.find(x=>x.id===id); if(!r) return;
  const voted=JSON.parse(localStorage.getItem('aksa_voted')||'[]');
  if(voted.includes(id)) return toast('Kamu sudah mendukung laporan ini.');
  r.votes++; voted.push(id); localStorage.setItem('aksa_voted',JSON.stringify(voted));
  save(); renderAll(); map.closePopup(); toast('Dukunganmu tercatat. Laporan ini naik prioritas.');
}
window.upvote = upvote;

/* ---------- Location ---------- */
function setLocation(lat,lng,fly){
  selLoc={lat,lng,addr:null};
  if(!draft){
    draft=L.marker([lat,lng],{draggable:true,icon:pinIcon('📍','mine'),zIndexOffset:1000}).addTo(map);
    draft.on('dragend',()=>{const p=draft.getLatLng();setLocation(p.lat,p.lng,false);});
  } else draft.setLatLng([lat,lng]);
  if(fly) map.flyTo([lat,lng],17);
  $('#locBox').classList.add('set');
  $('#locText').textContent=`Mencari alamat… (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
  reverseGeocode(lat,lng); checkDuplicate(); updateProgress();
}
let geoTimer;
function reverseGeocode(lat,lng){
  clearTimeout(geoTimer);
  geoTimer=setTimeout(async()=>{
    try{
      const res=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=id&lat=${lat}&lon=${lng}`);
      const j=await res.json();
      if(selLoc && selLoc.lat===lat && selLoc.lng===lng){
        selLoc.addr=j.display_name?j.display_name.split(',').slice(0,4).join(','):null;
        $('#locText').textContent=selLoc.addr||`${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }
    }catch(e){ if(selLoc) $('#locText').textContent=`Koordinat: ${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
  },500);
}
map.on('click',e=>setLocation(e.latlng.lat,e.latlng.lng,false));
$('#btnLocate').onclick=()=>{
  if(!navigator.geolocation) return toast('Browser tidak mendukung GPS. Klik peta untuk menandai.');
  const b=$('#btnLocate'); b.disabled=true; b.innerHTML='<span class="spinner-border spinner-border-sm"></span> Mencari GPS…';
  navigator.geolocation.getCurrentPosition(
    p=>{setLocation(p.coords.latitude,p.coords.longitude,true);reset();},
    ()=>{toast('GPS ditolak/gagal. Klik peta untuk menandai lokasi.');reset();},
    {enableHighAccuracy:true,timeout:10000});
  function reset(){b.disabled=false;b.innerHTML='<i class="bi bi-crosshair"></i> Gunakan lokasiku';}
};

/* ---------- Photo (compress) ---------- */
$('#photo').onchange=e=>handlePhoto(e.target.files[0]);
const dz=$('#dropzone');
['dragover','dragenter'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('drag');}));
['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('drag');}));
dz.addEventListener('drop',e=>handlePhoto(e.dataTransfer.files[0]));
function handlePhoto(f){
  if(!f) return;
  if(!f.type.startsWith('image/')) return toast('File harus berupa gambar.');
  if(f.size>5*1024*1024) return toast('Ukuran foto maksimal 5 MB.');
  const img=new Image();
  img.onload=()=>{
    const s=Math.min(1,640/Math.max(img.width,img.height));
    const c=document.createElement('canvas'); c.width=img.width*s; c.height=img.height*s;
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    photoData=c.toDataURL('image/jpeg',.6);
    $('#preview').src=photoData; $('#preview').classList.remove('d-none'); $('#dropEmpty').classList.add('d-none');
    updateProgress();
  };
  img.src=URL.createObjectURL(f);
}

/* ---------- Category + smart suggestion ---------- */
const chips=$('#catChips');
chips.innerHTML=Object.entries(CATS).map(([k,c])=>`<button type="button" class="chip" data-k="${k}">${c.icon} ${c.label}</button>`).join('');
chips.onclick=e=>{const b=e.target.closest('.chip'); if(!b) return; catTouched=true; pickCat(b.dataset.k);};
function pickCat(k){
  selCat=k; chips.querySelectorAll('.chip').forEach(c=>c.classList.toggle('active',c.dataset.k===k));
  chips.querySelectorAll('.chip').forEach(c=>c.classList.remove('suggest'));
  checkDuplicate(); updateProgress();
}
$('#desc').addEventListener('input',e=>{
  $('#count').textContent=e.target.value.length;
  const t=e.target.value.toLowerCase(); let best=null,score=0;
  for(const [k,c] of Object.entries(CATS)){const s=c.kw.filter(w=>t.includes(w)).length; if(s>score){score=s;best=k;}}
  if(best && !catTouched){pickCat(best);$('#catHint').innerHTML=`<i class="bi bi-stars text-warning"></i> Kategori dipilih otomatis: <b>${CATS[best].label}</b>. Ubah jika kurang tepat.`;}
  updateProgress();
});

/* ---------- Duplicate detection ---------- */
const dist=(a,b,c,d)=>{const R=6371e3,t=x=>x*Math.PI/180,dl=t(c-a),dg=t(d-b);
  const h=Math.sin(dl/2)**2+Math.cos(t(a))*Math.cos(t(c))*Math.sin(dg/2)**2;return 2*R*Math.asin(Math.sqrt(h));};
function checkDuplicate(){
  const box=$('#dupBox');
  if(!selLoc||!selCat){box.classList.add('d-none');return;}
  const d=reports.find(r=>r.cat===selCat&&stageOf(r)<3&&dist(r.lat,r.lng,selLoc.lat,selLoc.lng)<75);
  if(!d){box.classList.add('d-none');return;}
  box.classList.remove('d-none');
  box.innerHTML=`<b>Mungkin sudah dilaporkan.</b> Ada laporan serupa <b>${d.id}</b> kurang dari 75 m dari sini. Daripada membuat duplikat, dukung laporan itu agar cepat ditangani.
  <div class="mt-2"><button type="button" class="btn btn-sm btn-aksa" onclick="upvote('${d.id}')">Dukung laporan ini</button>
  <button type="button" class="btn btn-sm btn-link" onclick="map.flyTo([${d.lat},${d.lng}],18)">Lihat di peta</button></div>`;
}
window.map=map;

/* ---------- Progress ---------- */
function updateProgress(){
  const n=[photoData,selLoc,selCat,$('#desc').value.trim().length>=10].filter(Boolean).length;
  const p=n*25; $('#progressBar').style.width=p+'%'; $('#progressText').textContent=p+'%';
}

/* ---------- Submit ---------- */
$('#reportForm').addEventListener('submit',e=>{
  e.preventDefault();
  const err=$('#formError'); const desc=$('#desc').value.trim();
  if(!photoData) return err.textContent='Tambahkan foto kerusakan dulu.';
  if(!selLoc) return err.textContent='Tandai lokasi di peta atau gunakan GPS.';
  if(!selCat) return err.textContent='Pilih kategori kerusakan.';
  if(desc.length<10) return err.textContent='Deskripsi minimal 10 karakter.';
  err.textContent='';
  let id; do{ id='AKSA-'+(1000+Math.floor(Math.random()*9000)); }while(reports.some(x=>x.id===id));
  const r={id,lat:selLoc.lat,lng:selLoc.lng,cat:selCat,sev:+document.querySelector('[name=sev]:checked').value,
    desc,addr:(selLoc.addr||'')+($('#landmark').value?` (${$('#landmark').value})`:''),photo:photoData,votes:1,stage:0,created:Date.now(),seed:false};
  reports.unshift(r); save();
  map.removeLayer(draft); draft=null; selLoc=null; selCat=null; photoData=null; catTouched=false;
  $('#reportForm').reset(); $('#preview').classList.add('d-none'); $('#dropEmpty').classList.remove('d-none');
  chips.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
  $('#locBox').classList.remove('set'); $('#locText').textContent='Klik peta atau seret pin untuk menandai lokasi.';
  $('#catHint').textContent=''; $('#count').textContent='0'; $('#dupBox').classList.add('d-none'); updateProgress();
  renderAll(); map.flyTo([r.lat,r.lng],17);
  $('#ticketCode').textContent=id; $('#trackInput').value=id;
  new bootstrap.Modal('#doneModal').show();
});
$('#copyBtn').onclick=()=>{navigator.clipboard?.writeText($('#ticketCode').textContent);toast('Kode disalin.');};
$('#trackNow').onclick=()=>{track();document.getElementById('lacak').scrollIntoView({behavior:'smooth'});};

/* ---------- Tracking ---------- */
function track(){
  const code=$('#trackInput').value.trim().toUpperCase(); const out=$('#trackResult');
  const r=reports.find(x=>x.id===code);
  if(!r){out.innerHTML='Kode tidak ditemukan. Periksa lagi penulisannya.';return;}
  const st=stageOf(r);
  out.innerHTML=`<div class="text-dark"><b>${r.id}</b> · ${CATS[r.cat].icon} ${CATS[r.cat].label}<br><small>${esc(r.addr)}</small></div>
  <ul class="timeline">${STAGES.map((s,i)=>`<li class="${i<=st?'on':''}">${s}</li>`).join('')}</ul>
  <div class="text-muted" style="font-size:.75rem">Demo: laporan baru otomatis diverifikasi, tahap berikutnya lewat Mode Petugas.</div>`;
}
$('#trackBtn').onclick=track;
$('#trackInput').addEventListener('keydown',e=>{if(e.key==='Enter')track();});
setInterval(()=>{if($('#trackInput').value&&$('#trackResult').querySelector('.timeline'))track();renderStats();},5000);

/* ---------- Render ---------- */
const filt=$('#mapFilter');
filt.innerHTML=`<button class="chip active" data-k="all">Semua</button>`+Object.entries(CATS).map(([k,c])=>`<button class="chip" data-k="${k}">${c.icon} ${c.label}</button>`).join('');
filt.onclick=e=>{const b=e.target.closest('.chip');if(!b)return;activeFilter=b.dataset.k;
  filt.querySelectorAll('.chip').forEach(c=>c.classList.toggle('active',c===b));drawMarkers();};

function renderStats(){
  const done=reports.filter(r=>stageOf(r)===3).length;
  const items=[[reports.length,'Total laporan'],[reports.filter(r=>stageOf(r)<3).length,'Sedang diproses'],[done,'Sudah selesai'],[reports.reduce((a,r)=>a+r.votes,0),'Dukungan warga']];
  $('#stats').innerHTML=items.map(i=>`<div class="col-6 col-md-3"><div class="stat"><b>${i[0]}</b>${i[1]}</div></div>`).join('');
}
function ago(t){const m=Math.max(1,Math.round((Date.now()-t)/6e4));return m<60?m+' mnt lalu':m<1440?Math.round(m/60)+' jam lalu':Math.round(m/1440)+' hari lalu';}
function renderList(){
  $('#reportList').innerHTML=reports.slice(0,6).map(r=>`<div class="rep" data-id="${r.id}">
    ${r.photo?`<img src="${r.photo}" alt="">`:`<div class="ph">${CATS[r.cat].icon}</div>`}
    <div class="flex-fill"><div class="fw-bold">${CATS[r.cat].label} <span class="badge-st st-${stageOf(r)}">${STAGES[stageOf(r)]}</span></div>
    <div class="small text-muted text-truncate" style="max-width:360px">${esc(r.desc)}</div>
    <div class="small text-muted">${r.id} · ${ago(r.created)} · 👍 ${r.votes}</div></div></div>`).join('');
}
$('#reportList').onclick=e=>{const el=e.target.closest('.rep');if(!el)return;const r=reports.find(x=>x.id===el.dataset.id);
  map.flyTo([r.lat,r.lng],17);setTimeout(()=>markers[r.id]&&cluster.zoomToShowLayer(markers[r.id],()=>markers[r.id].openPopup()),900);
  window.scrollTo({top:0,behavior:'smooth'});};
function renderAll(){drawMarkers();renderList();renderStats();}

/* ---------- Toast ---------- */
function toast(msg){
  let t=document.getElementById('toastBox');
  if(!t){t=document.createElement('div');t.id='toastBox';t.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:2000';document.body.appendChild(t);}
  const el=document.createElement('div');el.className='toast show align-items-center text-bg-dark border-0 mb-2';
  el.innerHTML=`<div class="toast-body">${esc(msg)}</div>`;t.appendChild(el);setTimeout(()=>el.remove(),3500);
}
renderAll();
