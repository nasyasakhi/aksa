// ====== LOGIN DUMMY AKSA ======
// Dipakai bersama oleh login.html, admin.html, dan user.html
(function () {
  const USERS = [
    { username: 'admin', password: 'password', role: 'admin' },
    { username: 'user',  password: 'password', role: 'user'  }
  ];
  const KEY = 'aksa_auth';
  const HOME = { admin: '/laporan/lapor-petugas.html', user: '/laporan/lapor-user.html' };

  function getAuth() {
    try { return JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { return null; }
  }

  function login(username, password) {
    const found = USERS.find((u) => u.username === username && u.password === password);
    if (!found) return null;
    try { sessionStorage.setItem(KEY, JSON.stringify({ username: found.username, role: found.role })); } catch (e) {}
    return found.role;
  }

  function logout() {
    try { sessionStorage.removeItem(KEY); } catch (e) {}
    location.replace('/login/login.html');
  }

  function goHome(role) { location.replace(HOME[role] || '/login/login.html'); }

  // Taruh di <head> halaman yang butuh login. role = 'admin' atau 'user'
  function guard(role) {
    const auth = getAuth();
    if (!auth) { location.replace('/login/login.html'); return; }
    if (auth.role !== role) { goHome(auth.role); return; } // salah role -> balik ke halamannya sendiri
  }

  // Halaman login: kalau sudah login, langsung ke halaman sesuai role
  function guestOnly() {
    const auth = getAuth();
    if (auth) goHome(auth.role);
  }

  // Isi nama user & aktifkan tombol keluar
  function initPage() {
    const auth = getAuth();
    document.querySelectorAll('.who').forEach((el) => { el.textContent = auth ? auth.username : ''; });
    document.querySelectorAll('.btnLogout').forEach((b) => b.addEventListener('click', logout));
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }

  window.Aksa = { login, logout, goHome, guard, guestOnly, initPage, getAuth };
})();
