// ── State ──────────────────────────────────────────────────────────────────
let trades            = [];
let currentUser       = null;
let currentOutcome    = 'profit';
let currentSide       = 'buy';
let currentMarket     = 'stock';
let currentScreenshot1 = null;
let currentScreenshot2 = null;
let chartMode         = 'daily';
let chartCurrency     = 'inr';
let pnlChart          = null;
let winLossChart      = null;
let marketChart       = null;
let usdToInr          = parseFloat(localStorage.getItem('usdToInr') || '0') || 84;

// Selection mode for settings
let selectionMode     = false;
let selectedTrades    = new Set();
let loginMode         = 'login';

// ── Authentication ─────────────────────────────────────────────────────────
function switchLoginTab(mode) {
  loginMode = mode;
  document.getElementById('tabLogin').classList.toggle('active', mode === 'login');
  document.getElementById('tabSignup').classList.toggle('active', mode === 'signup');
  document.getElementById('authSubmitBtn').innerHTML = mode === 'login' 
    ? '<span>Login</span><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'
    : '<span>Register</span><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
  document.getElementById('nameGroup').style.display = mode === 'signup' ? 'block' : 'none';
  document.getElementById('loginFooter').style.display = mode === 'login' ? 'flex' : 'none';
  document.getElementById('loginError').textContent = '';
}

function submitAuth(e) {
  e.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';

  if (!email || !password) {
    errorEl.textContent = 'Please enter email and password.';
    return;
  }

  if (loginMode === 'login') {
    auth.signInWithEmailAndPassword(email, password).catch(err => {
      errorEl.textContent = err.message;
    });
  } else {
    const name = document.getElementById('authName').value.trim() || 'Trader';
    auth.createUserWithEmailAndPassword(email, password)
      .then(cred => cred.user.updateProfile({ displayName: name }))
      .catch(err => { errorEl.textContent = err.message; });
  }
}

function resetPassword(e) {
  e.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  if (!email) {
    document.getElementById('loginError').textContent = 'Please enter your email address first.';
    return;
  }
  auth.sendPasswordResetEmail(email)
    .then(() => alert('Password reset email sent! Check your inbox.'))
    .catch(err => document.getElementById('loginError').textContent = err.message);
}

function togglePasswordVisibility() {
  const passwordInput = document.getElementById('authPassword');
  const eyeIcon = document.getElementById('eyeIcon');
  
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    eyeIcon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
  } else {
    passwordInput.type = 'password';
    eyeIcon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  }
}

function continueAsGuest() {
  currentUser = null;
  localStorage.setItem('guestMode', 'true');
  document.getElementById('loginScreen').style.display = 'none';
  // Load from localStorage for guest
  trades = JSON.parse(localStorage.getItem('guest_trades') || '[]');
  fetchRate();
  renderAll();
  updateProfileName('Guest');
}

function signOut() {
  if (confirm('Sign out?')) {
    if (currentUser) {
      auth.signOut();
    } else {
      // Guest logout
      trades = [];
      localStorage.removeItem('guestMode');
      localStorage.setItem('guest_trades', JSON.stringify(trades));
      document.getElementById('loginScreen').style.display = 'flex';
      updateProfileName('Trader');
    }
  }
}

// Firebase auth state listener
auth.onAuthStateChanged(user => {
  const loginScreen = document.getElementById('loginScreen');
  
  if (user) {
    // User is logged in with Firebase
    currentUser = user;
    loginScreen.style.display = 'none';
    loadTradesFromFirestore();
    fetchRate();
    updateProfileName(user.displayName || 'Trader');
  } else {
    // Check if guest mode
    const isGuestMode = localStorage.getItem('guestMode') === 'true';
    if (isGuestMode) {
      // Continue in guest mode
      currentUser = null;
      loginScreen.style.display = 'none';
      trades = JSON.parse(localStorage.getItem('guest_trades') || '[]');
      fetchRate();
      renderAll();
      updateProfileName('Guest');
    } else {
      // Show login screen
      currentUser = null;
      trades = [];
      loginScreen.style.display = 'flex';
    }
  }
});

// ── Firestore ──────────────────────────────────────────────────────────────
function tradesRef() {
  return db.collection('users').doc(currentUser.uid).collection('trades');
}

function loadTradesFromFirestore() {
  tradesRef().orderBy('id', 'desc').onSnapshot(snap => {
    trades = snap.docs.map(d => d.data());
    renderAll();
  });
}

function saveTrade(trade) {
  if (!currentUser) {
    // Guest mode - save to localStorage
    trades = trades.filter(t => t.id !== trade.id);
    trades.unshift(trade);
    localStorage.setItem('guest_trades', JSON.stringify(trades));
    renderAll();
    return;
  }
  tradesRef().doc(String(trade.id)).set(trade);
}

function deleteTradeFromStorage(id) {
  if (!currentUser) {
    // Guest mode - delete from localStorage
    trades = trades.filter(t => t.id !== id);
    localStorage.setItem('guest_trades', JSON.stringify(trades));
    renderAll();
    return;
  }
  tradesRef().doc(String(id)).delete();
}

function clearAllTrades() {
  if (!confirm('Delete all trades? This cannot be undone.')) return;
  
  if (!currentUser) {
    // Guest mode
    trades = [];
    localStorage.setItem('guest_trades', JSON.stringify(trades));
    renderAll();
    return;
  }
  
  const batch = db.batch();
  trades.forEach(t => batch.delete(tradesRef().doc(String(t.id))));
  batch.commit();
}

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('headerDate').textContent = new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  const inrEl  = document.getElementById('tradeAmountINR');
  const usdEl  = document.getElementById('tradeAmountUSD');
  const form   = document.getElementById('tradeForm');
  const drop   = document.getElementById('screenshotDrop');

  if (inrEl) inrEl.addEventListener('input', () => syncAmount('inr'));
  if (usdEl) usdEl.addEventListener('input', () => syncAmount('usd'));
  if (form)  form.addEventListener('submit', addTrade);
  if (drop) {
    drop.addEventListener('dragover',  e => { e.preventDefault(); drop.style.borderColor = '#6366f1'; });
    drop.addEventListener('dragleave', () => { drop.style.borderColor = ''; });
    drop.addEventListener('drop', e => {
      e.preventDefault(); drop.style.borderColor = '';
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) loadScreenshot(file, 1);
    });
  }
  
  // Handle mobile back button
  window.addEventListener('popstate', (e) => {
    const currentPage = document.querySelector('.page.active')?.id.replace('page-', '') || 'home';
    if (currentPage !== 'home') {
      navigate('home');
    }
  });
  
  // Push initial state
  history.pushState({ page: 'home' }, '', '');
});

// ── Navigation ─────────────────────────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));

  document.getElementById('page-' + page).classList.add('active');
  const nb = document.getElementById('nav-'  + page); if (nb) nb.classList.add('active');
  const sb = document.getElementById('snav-' + page); if (sb) sb.classList.add('active');

  // Push history state for back button
  if (page !== 'home') {
    history.pushState({ page: page }, '', '');
  }

  if (page === 'charts')    requestAnimationFrame(() => renderCharts());
  if (page === 'analytics') { requestAnimationFrame(() => { renderAnalytics(); renderPnlCalendar(); }); }
  if (page === 'settings')  renderSettings();
  if (page === 'home')      renderHome();
  if (page === 'journal')   renderJournal();
  if (page === 'add') {
    const d = today();
    document.getElementById('tradeDate').value = d;
    const lbl = document.getElementById('tradeDateLabel');
    if (lbl) lbl.textContent = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
    onMarketChange();
  }
}

// ── Exchange Rate ──────────────────────────────────────────────────────────
async function fetchRate() {
  try {
    const res  = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const data = await res.json();
    usdToInr   = data.rates.INR;
    localStorage.setItem('usdToInr', usdToInr);
  } catch (_) { /* use cached / fallback 84 */ }
}

function syncAmount(source) {
  const inrEl = document.getElementById('tradeAmountINR');
  const usdEl = document.getElementById('tradeAmountUSD');
  if (source === 'inr' && inrEl.value) {
    usdEl.value = (parseFloat(inrEl.value) / usdToInr).toFixed(2);
  } else if (source === 'usd' && usdEl.value) {
    inrEl.value = (parseFloat(usdEl.value) * usdToInr).toFixed(2);
  }
}

// ── Market / Symbol ────────────────────────────────────────────────────────
const MARKET_PICKS = {
  stock:  ['NIFTY 50', 'SENSEX', 'BANK NIFTY', 'MIDCAP NIFTY', 'FINNIFTY', 'RELIANCE', 'TCS', 'INFY', 'HDFC', 'ICICI'],
  crypto: ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'MATIC', 'AVAX', 'DOT'],
  forex:  ['GOLD', 'SILVER', 'CRUDE OIL', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/INR', 'NATURAL GAS', 'COPPER', 'PLATINUM'],
};

function onMarketChange() {
  const market = document.getElementById('marketSelect').value;
  currentMarket = market;

  const picksEl    = document.getElementById('symbolPicks');
  const usdRow     = document.getElementById('usdRow');
  const label      = document.getElementById('amountLabel');
  const symbolInput = document.getElementById('tradeSymbol');

  // Rebuild quick-pick buttons for this market
  picksEl.innerHTML = MARKET_PICKS[market].map(name =>
    '<button type="button" onclick="pickSymbol(\'' + name + '\')">' + name + '</button>'
  ).join('');
  picksEl.style.display = 'flex';

  // Clear previous symbol selection highlight
  symbolInput.value = '';

  if (market === 'stock') {
    usdRow.style.display    = 'none';
    label.textContent       = 'Amount (\u20B9 INR)';
    symbolInput.placeholder = 'e.g. RELIANCE, INFY';
  } else {
    usdRow.style.display    = 'flex';
    label.textContent       = 'Amount (\u20B9 INR / \u0024 USD)';
    symbolInput.placeholder = market === 'crypto' ? 'e.g. BTC, ETH' : 'e.g. GOLD, EUR/USD';
  }
}

function onSymbolInput() {
  // Clear active highlight when user types manually
  document.querySelectorAll('#symbolPicks button').forEach(b => b.classList.remove('active'));
}

function pickSymbol(name) {
  document.getElementById('tradeSymbol').value = name;
  document.querySelectorAll('#symbolPicks button').forEach(b => {
    b.classList.toggle('active', b.textContent.trim() === name);
  });
}

// keep old name working just in case
function pickIndex(name) { pickSymbol(name); }

// ── Optional trade details toggle ─────────────────────────────────────────
function toggleOptional() {
  const body = document.getElementById('optBody');
  const icon = document.getElementById('optToggleIcon');
  const open = body.style.display === 'none';
  body.style.display = open ? 'block' : 'none';
  icon.textContent   = open ? '－' : '＋';
}

// Auto-calc Risk:Reward when entry/tp/sl change
['tradeEntry','tradeTP','tradeSL'].forEach(id => {
  document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', calcRR);
  });
});

function calcRR() {
  const entry = parseFloat(document.getElementById('tradeEntry').value);
  const tp    = parseFloat(document.getElementById('tradeTP').value);
  const sl    = parseFloat(document.getElementById('tradeSL').value);
  const disp  = document.getElementById('rrDisplay');
  const val   = document.getElementById('rrVal');

  if (entry && tp && sl && sl !== entry) {
    const reward = Math.abs(tp - entry);
    const risk   = Math.abs(entry - sl);
    const rr     = (reward / risk).toFixed(2);
    val.textContent  = '1 : ' + rr;
    val.className    = 'rr-val ' + (parseFloat(rr) >= 1 ? 'green' : 'red');
    disp.style.display = 'flex';
  } else {
    disp.style.display = 'none';
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function save()  { localStorage.setItem('trades', JSON.stringify(trades)); }
function sign(t) { return t.outcome === 'profit' ? 1 : -1; }

function fmtINR(v) {
  return '\u20B9' + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtUSD(v) {
  return '\u0024' + Math.abs(v).toFixed(2);
}

function setOutcome(outcome) {
  currentOutcome = outcome;
  const p = document.getElementById('btnProfit');
  const l = document.getElementById('btnLoss');
  if (p) p.classList.toggle('active', outcome === 'profit');
  if (l) l.classList.toggle('active', outcome === 'loss');
}

function setSide(side) {
  currentSide = side;
  const b = document.getElementById('btnBuy');
  const s = document.getElementById('btnSell');
  if (b) b.classList.toggle('active', side === 'buy');
  if (s) s.classList.toggle('active', side === 'sell');
}

function setChartMode(mode, el) {
  chartMode = mode;
  document.querySelectorAll('.chip:not(.chip-cur)').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderCharts();
}

function setChartCurrency(cur, el) {
  chartCurrency = cur;
  document.querySelectorAll('.ch-cur-btn').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderCharts();
}

// ── Screenshot ─────────────────────────────────────────────────────────────
function handleScreenshot(e, num) {
  const file = e.target.files[0];
  if (file) loadScreenshot(file, num);
}

function loadScreenshot(file, num) {
  const reader = new FileReader();
  reader.onload = ev => {
    if (num === 1) {
      currentScreenshot1 = ev.target.result;
      const preview = document.getElementById('screenshotPreview1');
      const wrap = document.getElementById('ssPreviewWrap1');
      preview.src = ev.target.result;
      wrap.style.display = 'block';
      document.getElementById('ssLabel1').textContent = '✓ Screenshot 1';
    } else {
      currentScreenshot2 = ev.target.result;
      const preview = document.getElementById('screenshotPreview2');
      const wrap = document.getElementById('ssPreviewWrap2');
      preview.src = ev.target.result;
      wrap.style.display = 'block';
      document.getElementById('ssLabel2').textContent = '✓ Screenshot 2';
    }
  };
  reader.readAsDataURL(file);
}

function removeScreenshot(num) {
  if (num === 1) {
    currentScreenshot1 = null;
    document.getElementById('ssPreviewWrap1').style.display = 'none';
    document.getElementById('screenshotInput1').value = '';
    document.getElementById('ssLabel1').textContent = 'Screenshot 1';
  } else {
    currentScreenshot2 = null;
    document.getElementById('ssPreviewWrap2').style.display = 'none';
    document.getElementById('screenshotInput2').value = '';
    document.getElementById('ssLabel2').textContent = 'Screenshot 2';
  }
}

// ── Add Trade ──────────────────────────────────────────────────────────────
function addTrade(e) {
  e.preventDefault();

  // Use today if no date selected
  const dateEl = document.getElementById('tradeDate');
  if (!dateEl.value) dateEl.value = today();

  // Validate symbol
  const symbolVal = document.getElementById('tradeSymbol').value.trim();
  if (!symbolVal) {
    const sym = document.getElementById('tradeSymbol');
    sym.style.borderColor = 'var(--red)';
    sym.focus();
    setTimeout(() => sym.style.borderColor = '', 2000);
    return;
  }

  // If USD filled but INR empty, auto-convert
  const inrEl = document.getElementById('tradeAmountINR');
  const usdEl = document.getElementById('tradeAmountUSD');
  if (!inrEl.value && usdEl.value) {
    inrEl.value = (parseFloat(usdEl.value) * usdToInr).toFixed(2);
  }
  const inrVal = parseFloat(inrEl.value) || 0;
  const usdVal = parseFloat(usdEl.value) || parseFloat((inrVal / usdToInr).toFixed(2));

  if (!inrVal) {
    inrEl.style.borderColor = 'var(--red)';
    inrEl.focus();
    setTimeout(() => inrEl.style.borderColor = '', 2000);
    return;
  }

  const trade = {
    id:          Date.now(),
    date:        dateEl.value,
    symbol:      symbolVal.toUpperCase(),
    market:      currentMarket,
    outcome:     currentOutcome,
    side:        currentSide,
    amountINR:   parseFloat(inrVal.toFixed(2)),
    amountUSD:   parseFloat(usdVal.toFixed(2)),
    rateUsed:    usdToInr,
    logic:       document.getElementById('tradeLogic').value.trim(),
    screenshot1: currentScreenshot1,
    screenshot2: currentScreenshot2,
    time:        new Date().toLocaleTimeString(),
    entry:       parseFloat(document.getElementById('tradeEntry').value) || null,
    tp:          parseFloat(document.getElementById('tradeTP').value)    || null,
    sl:         parseFloat(document.getElementById('tradeSL').value)    || null,
    lot:        parseFloat(document.getElementById('tradeLot').value)   || null,
  };

  saveTrade(trade);
  resetForm();
  navigate('home');
  showToast('✅ Trade logged successfully!');
}

function resetForm() {
  const form = document.getElementById('tradeForm');
  if (form) form.reset();
  document.getElementById('tradeDate').value = today();
  const lbl = document.getElementById('tradeDateLabel');
  if (lbl) lbl.textContent = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
  document.getElementById('tradeAmountINR').value = '';
  document.getElementById('tradeAmountUSD').value = '';
  
  // Clear screenshots
  currentScreenshot1 = null;
  currentScreenshot2 = null;
  document.getElementById('ssPreviewWrap1').style.display = 'none';
  document.getElementById('ssPreviewWrap2').style.display = 'none';
  document.getElementById('screenshotInput1').value = '';
  document.getElementById('screenshotInput2').value = '';
  document.getElementById('ssLabel1').textContent = 'Screenshot 1';
  document.getElementById('ssLabel2').textContent = 'Screenshot 2';
  
  setOutcome('profit');
  setSide('buy');
  onMarketChange();
  const optBody = document.getElementById('optBody');
  if (optBody) optBody.style.display = 'none';
  const optIcon = document.getElementById('optToggleIcon');
  if (optIcon) optIcon.textContent = '\uff0b';
}

// ── Delete / Clear ─────────────────────────────────────────────────────────
function deleteTrade(id) {
  deleteTradeFromStorage(id);
}

function clearAll() {
  if (confirm('Delete all trades? This cannot be undone.')) {
    trades = [];
    localStorage.setItem('trades', JSON.stringify(trades));
    renderAll();
  }
}

// ── Home ───────────────────────────────────────────────────────────────────
let sparkChart = null;

function renderHome() {
  const todayStr    = today();
  const todayTrades = trades.filter(t => t.date === todayStr);
  const wins        = todayTrades.filter(t => t.outcome === 'profit').length;
  const losses      = todayTrades.filter(t => t.outcome === 'loss').length;
  const pnlINR      = todayTrades.reduce((s, t) => s + sign(t) * t.amountINR, 0);
  const pnlUSD      = todayTrades.reduce((s, t) => s + sign(t) * t.amountUSD, 0);
  const winRate     = todayTrades.length ? Math.round((wins / todayTrades.length) * 100) : 0;

  // Hero
  const pnlEl = document.getElementById('h-pnl');
  pnlEl.textContent = (pnlINR >= 0 ? '+' : '-') + fmtINR(pnlINR);
  pnlEl.className   = 'hero-pnl ' + (pnlINR > 0 ? 'green' : pnlINR < 0 ? 'red' : '');
  const pnlUsdEl = document.getElementById('h-pnl-usd');
  pnlUsdEl.textContent = (pnlUSD >= 0 ? '+' : '-') + fmtUSD(pnlUSD);
  pnlUsdEl.className   = 'hero-pnl-usd ' + (pnlUSD > 0 ? 'green' : pnlUSD < 0 ? 'red' : '');
  document.getElementById('headerDate').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Mood badge
  const badge = document.getElementById('h-badge');
  if (!todayTrades.length) {
    badge.textContent = '😴';
  } else if (pnlINR < 0) {
    // P&L is negative — never show happy regardless of win rate
    badge.textContent = winRate >= 30 ? '😐' : '😰';
  } else if (winRate >= 70) {
    badge.textContent = '🔥';
  } else if (winRate >= 50) {
    badge.textContent = '😊';
  } else if (winRate >= 30) {
    badge.textContent = '😐';
  } else {
    badge.textContent = '😰';
  }

  // Pills
  document.getElementById('h-total').textContent   = todayTrades.length;
  document.getElementById('h-wins').textContent    = wins;
  document.getElementById('h-losses').textContent  = losses;
  document.getElementById('h-winrate').textContent = winRate + '%';

  // Market breakdown — today only
  ['stock','crypto','forex'].forEach(m => {
    const mt = todayTrades.filter(t => t.market === m);
    const mp = mt.reduce((s, t) => s + sign(t) * t.amountINR, 0);
    document.getElementById('mb-' + m + '-count').textContent = mt.length + ' trade' + (mt.length !== 1 ? 's' : '');
    const mpEl = document.getElementById('mb-' + m + '-pnl');
    mpEl.textContent = (mp >= 0 ? '+' : '-') + fmtINR(mp);
    mpEl.className   = 'mb-pnl ' + (mp > 0 ? 'green' : mp < 0 ? 'red' : '');
  });

  // 7-day sparkline
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
  }
  const sparkData = days.map(d => {
    const dt = trades.filter(t => t.date === d);
    return parseFloat(dt.reduce((s, t) => s + sign(t) * t.amountINR, 0).toFixed(2));
  });
  const sparkLabels = days.map(d => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-IN', { weekday: 'short' });
  });

  const sCtx = document.getElementById('sparkChart').getContext('2d');
  if (sparkChart) sparkChart.destroy();
  sparkChart = new Chart(sCtx, {
    type: 'line',
    data: {
      labels: sparkLabels,
      datasets: [{
        data: sparkData,
        borderColor: '#6366f1',
        borderWidth: 2.5,
        pointBackgroundColor: sparkData.map(v => v >= 0 ? '#10b981' : '#f43f5e'),
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        backgroundColor: (ctx) => {
          const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 100);
          g.addColorStop(0, 'rgba(99,102,241,0.25)');
          g.addColorStop(1, 'rgba(99,102,241,0)');
          return g;
        },
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a2235',
          borderColor: '#1e2d45',
          borderWidth: 1,
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          callbacks: { label: c => ' ' + (c.parsed.y >= 0 ? '+' : '') + '\u20B9' + c.parsed.y.toFixed(2) }
        }
      },
      scales: {
        x: { ticks: { color: '#64748b', font: { size: 10, family: 'Inter' } }, grid: { display: false } },
        y: { ticks: { color: '#64748b', font: { size: 10, family: 'Inter' }, callback: v => '\u20B9' + v }, grid: { color: '#1e2d45' } }
      }
    }
  });

  // Recent trades — today only
  document.getElementById('recentTitle').textContent = "Today's Trades (" + todayTrades.length + ')';
  document.getElementById('recentTrades').innerHTML  = buildTradeCards(todayTrades, false);
}

// ── Journal ────────────────────────────────────────────────────────────────
let currentRange   = 'all';
let currentOutcomeFilter = '';
let currentMarketFilter  = '';
let currentSideFilter    = '';

function setJnlRange(range, el) {
  currentRange = range;
  document.querySelectorAll('#flt-period-drop .flt-opt').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  const labels = { all:'All', today:'Today', '7d':'7 Days', '1m':'1 Month', '1y':'1 Year', custom:'Custom' };
  document.getElementById('flt-period-val').textContent = labels[range] || 'All';
  document.getElementById('flt-period-btn').classList.toggle('flt-btn-active', range !== 'all');
  document.getElementById('customRange').style.display = range === 'custom' ? 'block' : 'none';
  if (range !== 'custom') {
    document.getElementById('filterDate').value     = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value   = '';
  }
  if (range !== 'custom') closeAllFilters();
  renderJournal();
}

function setJnlOutcome(val, el) {
  currentOutcomeFilter = val;
  document.querySelectorAll('#flt-result-drop .flt-opt').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  const labels = { '':'All', profit:'Profit', loss:'Loss' };
  document.getElementById('flt-result-val').textContent = labels[val];
  document.getElementById('flt-result-btn').classList.toggle('flt-btn-active', val !== '');
  closeAllFilters();
  renderJournal();
}

function setJnlMarket(val, el) {
  currentMarketFilter = val;
  document.querySelectorAll('#flt-market-drop .flt-opt').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  const labels = { '':'All', stock:'Stock', crypto:'Crypto', forex:'Forex' };
  document.getElementById('flt-market-val').textContent = labels[val];
  document.getElementById('flt-market-btn').classList.toggle('flt-btn-active', val !== '');
  closeAllFilters();
  renderJournal();
}

function setJnlSide(val, el) {
  currentSideFilter = val;
  document.querySelectorAll('#flt-side-drop .flt-opt').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  const labels = { '':'All', buy:'Buy', sell:'Sell' };
  document.getElementById('flt-side-val').textContent = labels[val];
  document.getElementById('flt-side-btn').classList.toggle('flt-btn-active', val !== '');
  closeAllFilters();
  renderJournal();
}

function toggleFilter(name) {
  const drops = { period:'flt-period-drop', result:'flt-result-drop', market:'flt-market-drop', side:'flt-side-drop' };
  const target = document.getElementById(drops[name]);
  const isOpen = target.classList.contains('open');
  closeAllFilters();
  if (!isOpen) target.classList.add('open');
}

function closeAllFilters() {
  document.querySelectorAll('.flt-dropdown').forEach(d => d.classList.remove('open'));
}

// Close dropdowns when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('.flt-btn-wrap')) closeAllFilters();
});

function onRangeSelect() { renderJournal(); }

function onSpecificDay() {
  const val = document.getElementById('filterDate').value;
  if (val) {
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value   = '';
    document.getElementById('calFromDisplay').textContent   = 'Select date';
    document.getElementById('calToDisplay').textContent     = 'Select date';
  }
  renderJournal();
}

// ── Mini Calendar ──────────────────────────────────────────────────────────
let calTarget = null; // 'from' | 'to' | 'single'
let calYear   = new Date().getFullYear();
let calMonth  = new Date().getMonth();

function openCal(target) {
  calTarget = target;
  let existing = '';
  if (target === 'from')      existing = document.getElementById('filterDateFrom').value;
  else if (target === 'to')   existing = document.getElementById('filterDateTo').value;
  else if (target === 'single') existing = document.getElementById('filterDate').value;
  else if (target === 'tradedate') existing = document.getElementById('tradeDate').value;
  else if (target === 'sttFrom') existing = document.getElementById('sttFrom').value;
  else if (target === 'sttTo')   existing = document.getElementById('sttTo').value;

  if (existing) {
    const d = new Date(existing);
    calYear  = d.getFullYear();
    calMonth = d.getMonth();
  } else {
    calYear  = new Date().getFullYear();
    calMonth = new Date().getMonth();
  }
  renderCal();
  positionCal(target);
  document.getElementById('miniCal').style.display = 'block';
}

function positionCal(target) {
  const idMap = { from: 'calFromDisplay', to: 'calToDisplay', single: 'calSingleDisplay', tradedate: 'tradeDateDisplay', sttFrom: 'sttFromDisplay', sttTo: 'sttToDisplay' };
  const anchorId = idMap[target] || 'calSingleDisplay';
  const anchor = document.getElementById(anchorId);
  const rect   = anchor.getBoundingClientRect();
  const cal    = document.getElementById('miniCal');

  // Measure calendar size
  cal.style.display  = 'block';
  cal.style.left     = '0px';
  cal.style.top      = '0px';
  const calW = cal.offsetWidth  || 248;
  const calH = cal.offsetHeight || 280;
  cal.style.display  = 'none';

  // Horizontal: align to anchor, clamp to viewport
  let left = rect.left;
  if (left + calW > window.innerWidth - 8) left = window.innerWidth - calW - 8;
  if (left < 8) left = 8;

  // Vertical: below anchor if room, else above
  let top = rect.bottom + 6;
  if (top + calH > window.innerHeight - 8) top = rect.top - calH - 6;
  if (top < 8) top = 8;

  cal.style.left = left + 'px';
  cal.style.top  = top  + 'px';
}

function renderCal() {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('mcTitle').textContent = months[calMonth] + ' ' + calYear;

  const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const offset = (firstDay === 0 ? 6 : firstDay - 1); // Mon-start

  const _t = new Date();
  const today = _t.getFullYear() + '-' + String(_t.getMonth() + 1).padStart(2, '0') + '-' + String(_t.getDate()).padStart(2, '0');
  const selected = getCalSelected();

  let html = '';
  for (let i = 0; i < offset; i++) html += '<span class="mc-day empty"></span>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = calYear + '-' + String(calMonth + 1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    const isToday    = dateStr === today;
    const isSelected = dateStr === selected;
    html += '<span class="mc-day' + (isToday ? ' mc-today-day' : '') + (isSelected ? ' mc-selected' : '') +
            '" onclick="calPick(\'' + dateStr + '\')">' + d + '</span>';
  }
  document.getElementById('mcDays').innerHTML = html;
}

function getCalSelected() {
  if (calTarget === 'from')      return document.getElementById('filterDateFrom').value;
  if (calTarget === 'to')        return document.getElementById('filterDateTo').value;
  if (calTarget === 'single')    return document.getElementById('filterDate').value;
  if (calTarget === 'tradedate') return document.getElementById('tradeDate').value;
  if (calTarget === 'sttFrom')   return document.getElementById('sttFrom').value;
  if (calTarget === 'sttTo')     return document.getElementById('sttTo').value;
  return '';
}

function calPick(dateStr) {
  const fmt = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
  if (calTarget === 'from') {
    document.getElementById('filterDateFrom').value = dateStr;
    document.getElementById('calFromDisplay').textContent = fmt;
    document.getElementById('filterDateTo').value = '';
    document.getElementById('calToDisplay').textContent = 'Select date';
  } else if (calTarget === 'to') {
    document.getElementById('filterDateTo').value = dateStr;
    document.getElementById('calToDisplay').textContent = fmt;
  } else if (calTarget === 'tradedate') {
    document.getElementById('tradeDate').value = dateStr;
    document.getElementById('tradeDateLabel').textContent = fmt;
  } else if (calTarget === 'sttFrom') {
    document.getElementById('sttFrom').value = dateStr;
    document.getElementById('sttFromDisplay').textContent = fmt;
    renderSettings();
  } else if (calTarget === 'sttTo') {
    document.getElementById('sttTo').value = dateStr;
    document.getElementById('sttToDisplay').textContent = fmt;
    renderSettings();
  } else {
    document.getElementById('filterDate').value = dateStr;
    document.getElementById('calSingleDisplay').textContent = fmt;
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value   = '';
    document.getElementById('calFromDisplay').textContent = 'Select date';
    document.getElementById('calToDisplay').textContent   = 'Select date';
  }
  document.getElementById('miniCal').style.display = 'none';
  if (calTarget !== 'tradedate') renderJournal();
}

function calNav(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0;  calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  renderCal();
}

function calClear() {
  if (calTarget === 'from')        { document.getElementById('filterDateFrom').value = ''; document.getElementById('calFromDisplay').textContent = 'Select date'; }
  else if (calTarget === 'to')     { document.getElementById('filterDateTo').value = '';   document.getElementById('calToDisplay').textContent   = 'Select date'; }
  else if (calTarget === 'tradedate') { document.getElementById('tradeDate').value = ''; document.getElementById('tradeDateLabel').textContent = 'Select date'; }
  else if (calTarget === 'sttFrom') { document.getElementById('sttFrom').value = ''; document.getElementById('sttFromDisplay').textContent = 'Select date'; renderSettings(); }
  else if (calTarget === 'sttTo')   { document.getElementById('sttTo').value = '';   document.getElementById('sttToDisplay').textContent   = 'Select date'; renderSettings(); }
  else { document.getElementById('filterDate').value = ''; document.getElementById('calSingleDisplay').textContent = 'Select date'; }
  document.getElementById('miniCal').style.display = 'none';
  if (calTarget !== 'tradedate') renderJournal();
}

function calToday() {
  const d = new Date();
  const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  calPick(dateStr);
}

// Close calendar on outside click
document.addEventListener('click', e => {
  const cal = document.getElementById('miniCal');
  if (cal && !e.target.closest('.mini-cal') && !e.target.closest('.cal-input-wrap')) {
    cal.style.display = 'none';
  }
});

function getDateRange() {
  const now = new Date();
  const pad = d => d.toISOString().split('T')[0];
  const r   = currentRange;

  if (r === 'today') return { from: pad(now), to: pad(now) };
  if (r === '7d')  { const f = new Date(now); f.setDate(now.getDate() - 6);      return { from: pad(f), to: pad(now) }; }
  if (r === '1m')  { const f = new Date(now); f.setMonth(now.getMonth() - 1);    return { from: pad(f), to: pad(now) }; }
  if (r === '1y')  { const f = new Date(now); f.setFullYear(now.getFullYear()-1); return { from: pad(f), to: pad(now) }; }
  if (r === 'custom') {
    const specific = document.getElementById('filterDate').value;
    if (specific) return { from: specific, to: specific };
    return {
      from: document.getElementById('filterDateFrom').value || null,
      to:   document.getElementById('filterDateTo').value   || null,
    };
  }
  return { from: null, to: null };
}

function renderJournal() {
  const fo = currentOutcomeFilter;
  const fm = currentMarketFilter;
  const fs = currentSideFilter;
  const { from, to } = getDateRange();

  const filtered = trades.filter(t => {
    if (from && t.date < from) return false;
    if (to   && t.date > to)   return false;
    if (fo   && t.outcome !== fo) return false;
    if (fm   && t.market  !== fm) return false;
    if (fs   && (t.side || 'buy') !== fs) return false;
    return true;
  });

  // Build period label
  let periodLabel = 'All Time';
  if (currentRange === 'today') periodLabel = 'Today';
  else if (currentRange === '7d')  periodLabel = 'Last 7 Days';
  else if (currentRange === '1m')  periodLabel = 'Last Month';
  else if (currentRange === '1y')  periodLabel = 'Last Year';
  else if (currentRange === 'custom') {
    const specific = document.getElementById('filterDate').value;
    if (specific) {
      periodLabel = new Date(specific + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } else if (from && to) {
      periodLabel = from + ' → ' + to;
    } else if (from) {
      periodLabel = 'From ' + from;
    } else if (to) {
      periodLabel = 'Until ' + to;
    }
  }
  if (fo) periodLabel += ' · ' + (fo === 'profit' ? 'Profits' : 'Losses');
  if (fm) periodLabel += ' · ' + fm.charAt(0).toUpperCase() + fm.slice(1);
  if (fs) periodLabel += ' · ' + (fs === 'buy' ? '▲ Buy' : '▼ Sell');

  document.getElementById('jnl-period').textContent = periodLabel;

  const wins   = filtered.filter(t => t.outcome === 'profit').length;
  const losses = filtered.filter(t => t.outcome === 'loss').length;
  const pnl    = filtered.reduce((s, t) => s + sign(t) * t.amountINR, 0);

  document.getElementById('jnl-sub').textContent    = filtered.length + ' trade' + (filtered.length !== 1 ? 's' : '');
  document.getElementById('jnl-wins').textContent   = wins;
  document.getElementById('jnl-losses').textContent = losses;
  const pnlEl = document.getElementById('jnl-pnl');
  pnlEl.textContent = (pnl >= 0 ? '+' : '-') + fmtINR(pnl);
  pnlEl.className   = 'jnl-stat-val ' + (pnl >= 0 ? 'green' : 'red');

  document.getElementById('journalLog').innerHTML = buildTradeCards(filtered, true);
}

// ── Trade card builder ─────────────────────────────────────────────────────
function buildTradeCards(list, showDelete) {
  if (!list.length) return '<div class="empty-state"><div class="empty-icon">!</div><div class="empty-text">No trades found.</div></div>';

  // Group by date for journal view
  if (showDelete) {
    const byDate = {};
    list.forEach(t => { if (!byDate[t.date]) byDate[t.date] = []; byDate[t.date].push(t); });
    const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

    return sortedDates.map(date => {
      const dayTrades = byDate[date];
      const dayPnl    = dayTrades.reduce((s, t) => s + sign(t) * t.amountINR, 0);
      const dayWins   = dayTrades.filter(t => t.outcome === 'profit').length;
      const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

      return [
        '<div class="jnl-day-group">',
          '<div class="jnl-day-header">',
            '<span class="jnl-day-date">' + dateLabel + '</span>',
            '<div class="jnl-day-meta">',
              '<span class="jnl-day-count">' + dayTrades.length + ' trade' + (dayTrades.length !== 1 ? 's' : '') + '</span>',
              '<span class="jnl-day-pnl ' + (dayPnl >= 0 ? 'green' : 'red') + '">' + (dayPnl >= 0 ? '+' : '-') + fmtINR(dayPnl) + '</span>',
            '</div>',
          '</div>',
          dayTrades.map(t => buildJournalCard(t, true)).join(''),
        '</div>'
      ].join('');
    }).join('');
  }

  return list.map(t => buildJournalCard(t, false)).join('');
}

function buildJournalCard(t, showDelete) {
  const inrAmt  = sign(t) * t.amountINR;
  const usdAmt  = sign(t) * t.amountUSD;
  const showUSD = t.market !== 'stock';
  const mIcon   = { stock: '\uD83C\uDDEE\uD83C\uDDF3', crypto: '\u20BF', gold: '\uD83E\uDD47' };

  return [
    '<div class="jnl-card ' + t.outcome + '" onclick="openTradeDetail(' + t.id + ')" style="cursor:pointer;">',
      '<div class="jnl-card-accent ' + t.outcome + '"></div>',
      '<div class="jnl-card-main">',
        '<div class="jnl-card-top">',
          '<div class="jnl-card-left">',
            '<div class="jnl-symbol-row">',
              '<span class="jnl-symbol">' + (mIcon[t.market] || '') + ' ' + t.symbol + '</span>',
              '<span class="jnl-badge ' + t.outcome + '">' + (t.outcome === 'profit' ? '▲ PROFIT' : '▼ LOSS') + '</span>',
              '<span class="jnl-badge side-badge ' + (t.side || 'buy') + '">' + (t.side === 'sell' ? '▼ SELL' : '▲ BUY') + '</span>',
            '</div>',
            t.logic ? '<div class="jnl-logic">' + escHtml(t.logic) + '</div>' : '',
            '<div class="jnl-meta">',
              '<span class="jnl-time">' + (t.time || '') + '</span>',
              '<span class="market-tag ' + t.market + '">' + t.market.toUpperCase() + '</span>',
            '</div>',
            (t.entry || t.tp || t.sl || t.lot) ? [
              '<div class="jnl-trade-details">',
                t.entry ? '<span class="jnl-detail">Entry: <b>' + t.entry + '</b></span>' : '',
                t.tp    ? '<span class="jnl-detail tp">TP: <b>' + t.tp + '</b></span>'    : '',
                t.sl    ? '<span class="jnl-detail sl">SL: <b>' + t.sl + '</b></span>'    : '',
                t.lot   ? '<span class="jnl-detail">Lot: <b>' + t.lot + '</b></span>'     : '',
              '</div>'
            ].join('') : '',
          '</div>',
          '<div class="jnl-card-right">',
            '<div class="jnl-amount ' + t.outcome + '">' + (inrAmt >= 0 ? '+' : '-') + fmtINR(inrAmt) + '</div>',
            showUSD ? '<div class="jnl-amount-usd">' + (usdAmt >= 0 ? '+' : '-') + fmtUSD(usdAmt) + '</div>' : '',
            t.screenshot ? '<div class="jnl-has-ss">📷</div>' : '',
          '</div>',
        '</div>',
      '</div>',
    '</div>'
  ].join('');
}

// ── Charts ─────────────────────────────────────────────────────────────────
let chWinLossChart = null;
let chWeekChart    = null;
let chDailyChart   = null;

function renderCharts() {
  const sym    = chartCurrency === 'usd' ? '\u0024' : '\u20B9';
  const getAmt = t => chartCurrency === 'usd' ? t.amountUSD : t.amountINR;

  // ── Hero stats ──
  const allPnl = trades.reduce((s, t) => s + sign(t) * getAmt(t), 0);
  const wins   = trades.filter(t => t.outcome === 'profit').length;
  const losses = trades.filter(t => t.outcome === 'loss').length;
  const wr     = trades.length ? Math.round(wins / trades.length * 100) : 0;

  const heroEl = document.getElementById('ch-hero-pnl');
  heroEl.textContent = (allPnl >= 0 ? '+' : '-') + (chartCurrency === 'usd' ? fmtUSD(allPnl) : fmtINR(allPnl));
  heroEl.className   = 'ch-hero-pnl ' + (allPnl >= 0 ? 'green' : 'red');
  document.getElementById('ch-wins').textContent   = wins;
  document.getElementById('ch-losses').textContent = losses;
  document.getElementById('ch-wr').textContent     = wr + '%';

  // ── 1. Cumulative line chart ──
  const byDate = {};
  [...trades].reverse().forEach(t => {
    if (!byDate[t.date]) byDate[t.date] = 0;
    byDate[t.date] += sign(t) * getAmt(t);
  });
  const labels = Object.keys(byDate).sort();
  let running = 0;
  const cumData = labels.map(d => { running += byDate[d]; return parseFloat(running.toFixed(2)); });

  const ctx1 = document.getElementById('pnlChart').getContext('2d');
  if (pnlChart) pnlChart.destroy();
  const grad = ctx1.createLinearGradient(0, 0, 0, 280);
  grad.addColorStop(0, 'rgba(99,102,241,0.35)');
  grad.addColorStop(1, 'rgba(99,102,241,0)');

  pnlChart = new Chart(ctx1, {
    type: 'line',
    data: { labels, datasets: [{
      label: 'Cumulative P&L',
      data: cumData,
      borderColor: '#6366f1', borderWidth: 2.5,
      pointBackgroundColor: cumData.map(v => v >= 0 ? '#10b981' : '#f43f5e'),
      pointRadius: 4, pointHoverRadius: 7,
      fill: true, backgroundColor: grad, tension: 0.4,
    }]},
    options: chartOpts(sym)
  });

  // ── 2. Win/Loss doughnut ──
  document.getElementById('ch-donut-pct').textContent = wr + '%';
  const ctx2 = document.getElementById('chWinLossChart').getContext('2d');
  if (chWinLossChart) chWinLossChart.destroy();
  chWinLossChart = new Chart(ctx2, {
    type: 'doughnut',
    data: { labels: ['Wins', 'Losses'], datasets: [{
      data: [wins, losses],
      backgroundColor: ['#10b981','#f43f5e'], borderWidth: 0, hoverOffset: 6
    }]},
    options: { responsive: true, cutout: '72%',
      plugins: { legend: { labels: { color: '#64748b', font: { family:'Inter', weight:'600', size:11 } } },
        tooltip: { backgroundColor:'#1a2235', borderColor:'#1e2d45', borderWidth:1, titleColor:'#e2e8f0', bodyColor:'#94a3b8',
          callbacks: { label: c => ' ' + c.label + ' (' + (trades.length ? Math.round(c.parsed / trades.length * 100) : 0) + '%)' }
        }
      }
    }
  });

  // ── 3. This week bar chart ──
  const weekDays = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    weekDays.push(d.toISOString().split('T')[0]);
  }
  const weekData   = weekDays.map(d => parseFloat((trades.filter(t => t.date === d).reduce((s, t) => s + sign(t) * getAmt(t), 0)).toFixed(2)));
  const weekLabels = weekDays.map(d => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday:'short' }));

  const ctx3 = document.getElementById('chWeekChart').getContext('2d');
  if (chWeekChart) chWeekChart.destroy();
  chWeekChart = new Chart(ctx3, {
    type: 'bar',
    data: { labels: weekLabels, datasets: [{
      data: weekData,
      backgroundColor: weekData.map(v => v >= 0 ? 'rgba(16,185,129,0.75)' : 'rgba(244,63,94,0.75)'),
      borderColor:     weekData.map(v => v >= 0 ? '#10b981' : '#f43f5e'),
      borderWidth: 1, borderRadius: 5,
    }]},
    options: { ...chartOpts(sym), plugins: { legend: { display: false }, tooltip: { backgroundColor:'#1a2235', borderColor:'#1e2d45', borderWidth:1, titleColor:'#e2e8f0', bodyColor:'#94a3b8', callbacks: { label: c => ' ' + (c.parsed.y >= 0 ? '+' : '') + sym + Math.abs(c.parsed.y).toFixed(2) } } } }
  });

  // ── 4. Last 30 days daily bar ──
  const days30 = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days30.push(d.toISOString().split('T')[0]);
  }
  const daily30Data   = days30.map(d => parseFloat((trades.filter(t => t.date === d).reduce((s, t) => s + sign(t) * getAmt(t), 0)).toFixed(2)));
  const daily30Labels = days30.map(d => { const dt = new Date(d + 'T00:00:00'); return dt.getDate() + '/' + (dt.getMonth()+1); });

  const ctx4 = document.getElementById('chDailyChart').getContext('2d');
  if (chDailyChart) chDailyChart.destroy();
  chDailyChart = new Chart(ctx4, {
    type: 'bar',
    data: { labels: daily30Labels, datasets: [{
      data: daily30Data,
      backgroundColor: daily30Data.map(v => v >= 0 ? 'rgba(99,102,241,0.7)' : 'rgba(244,63,94,0.7)'),
      borderColor:     daily30Data.map(v => v >= 0 ? '#6366f1' : '#f43f5e'),
      borderWidth: 1, borderRadius: 4,
    }]},
    options: { ...chartOpts(sym), plugins: { legend: { display: false }, tooltip: { backgroundColor:'#1a2235', borderColor:'#1e2d45', borderWidth:1, titleColor:'#e2e8f0', bodyColor:'#94a3b8', callbacks: { label: c => ' ' + (c.parsed.y >= 0 ? '+' : '') + sym + Math.abs(c.parsed.y).toFixed(2) } } } }
  });
}

function chartOpts(sym) {
  return {
    responsive: true,
    plugins: {
      legend: { labels: { color: '#64748b', font: { family:'Inter', weight:'600', size:11 } } },
      tooltip: { backgroundColor:'#1a2235', borderColor:'#1e2d45', borderWidth:1, titleColor:'#e2e8f0', bodyColor:'#94a3b8',
        callbacks: { label: c => ' ' + (c.parsed.y >= 0 ? '+' : '-') + sym + Math.abs(c.parsed.y).toFixed(2) }
      }
    },
    scales: {
      x: { ticks: { color:'#64748b', font:{ family:'Inter', size:10 } }, grid: { color:'#1e2d45' } },
      y: { ticks: { color:'#64748b', font:{ family:'Inter', size:10 }, callback: v => sym + v }, grid: { color:'#1e2d45' } }
    }
  };
}

// ── P&L Calendar ───────────────────────────────────────────────────────────
let calChartYear  = new Date().getFullYear();
let calChartMonth = new Date().getMonth();

function openJournalDate(dateStr) {
  // Set to custom single-day filter
  currentRange = 'custom';
  document.getElementById('filterDate').value     = dateStr;
  document.getElementById('filterDateFrom').value = '';
  document.getElementById('filterDateTo').value   = '';

  const fmt = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
  document.getElementById('calSingleDisplay').textContent = fmt;
  document.getElementById('calFromDisplay').textContent   = 'Select date';
  document.getElementById('calToDisplay').textContent     = 'Select date';

  // Update period button UI
  document.querySelectorAll('#flt-period-drop .flt-opt').forEach(b => b.classList.remove('active'));
  const customBtn = document.querySelector('#flt-period-drop .flt-opt:last-child');
  if (customBtn) customBtn.classList.add('active');
  document.getElementById('flt-period-val').textContent = fmt;
  document.getElementById('flt-period-btn').classList.add('flt-btn-active');
  document.getElementById('customRange').style.display = 'block';

  // Navigate then render with the filter applied
  navigate('journal');
  renderJournal();
}

function calChartNav(dir) {
  calChartMonth += dir;
  if (calChartMonth > 11) { calChartMonth = 0; calChartYear++; }
  if (calChartMonth < 0)  { calChartMonth = 11; calChartYear--; }
  renderPnlCalendar();
}

function renderPnlCalendar() {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('calChartTitle').textContent = months[calChartMonth] + ' ' + calChartYear;

  // Build daily P&L map for this month
  const dayPnl = {};
  trades.forEach(t => {
    const d = new Date(t.date + 'T00:00:00');
    if (d.getFullYear() === calChartYear && d.getMonth() === calChartMonth) {
      const key = t.date;
      if (!dayPnl[key]) dayPnl[key] = 0;
      dayPnl[key] += sign(t) * t.amountINR;
    }
  });

  const firstDay    = new Date(calChartYear, calChartMonth, 1).getDay();
  const daysInMonth = new Date(calChartYear, calChartMonth + 1, 0).getDate();
  const offset      = firstDay === 0 ? 6 : firstDay - 1;
  const todayStr    = today();

  let html = '';
  for (let i = 0; i < offset; i++) html += '<div class="pcal-day empty"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = calChartYear + '-' + String(calChartMonth + 1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    const pnl     = dayPnl[dateStr];
    const isToday = dateStr === todayStr;
    let cls = 'pcal-day';
    if (pnl !== undefined) cls += pnl >= 0 ? ' pcal-profit' : ' pcal-loss';
    if (isToday) cls += ' pcal-today';

    const label = pnl !== undefined
      ? '<span class="pcal-num">' + d + '</span><span class="pcal-amt">' + (pnl >= 0 ? '+' : '') + fmtINR(pnl) + '</span>'
      : '<span class="pcal-num">' + d + '</span>';

    const clickable = pnl !== undefined ? ' pcal-clickable" onclick="openJournalDate(\'' + dateStr + '\')' : '';
    html += '<div class="' + cls + clickable + '">' + label + '</div>';
  }

  document.getElementById('pnlCalGrid').innerHTML = html;
}

// ── Analytics ──────────────────────────────────────────────────────────────
let winRingChart = null;
let anPnlChart   = null;

function renderAnalytics() {
  const wins   = trades.filter(t => t.outcome === 'profit').length;
  const losses = trades.filter(t => t.outcome === 'loss').length;
  const wr     = trades.length ? Math.round((wins / trades.length) * 100) : 0;
  const pnlINR = trades.reduce((s, t) => s + sign(t) * t.amountINR, 0);
  const pnlUSD = trades.reduce((s, t) => s + sign(t) * t.amountUSD, 0);

  const profitTrades = trades.filter(t => t.outcome === 'profit');
  const lossTrades   = trades.filter(t => t.outcome === 'loss');
  const best  = profitTrades.length ? Math.max(...profitTrades.map(t => t.amountINR)) : null;
  const worst = lossTrades.length   ? Math.max(...lossTrades.map(t => t.amountINR))   : null;

  // Hero
  const heroEl = document.getElementById('an-hero-pnl');
  heroEl.textContent = (pnlINR >= 0 ? '+' : '-') + fmtINR(pnlINR);
  heroEl.className   = 'an-hero-pnl ' + (pnlINR >= 0 ? 'green' : 'red');

  const heroUsdEl = document.getElementById('an-hero-pnl-usd');
  heroUsdEl.textContent = (pnlUSD >= 0 ? '+' : '-') + fmtUSD(pnlUSD);
  heroUsdEl.className   = 'an-hero-pnl-usd ' + (pnlUSD >= 0 ? 'green' : 'red');

  // Ring chart
  document.getElementById('an-ring-pct').textContent = wr + '%';
  const rCtx = document.getElementById('winRingChart').getContext('2d');
  if (winRingChart) winRingChart.destroy();
  winRingChart = new Chart(rCtx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [wr, 100 - wr],
        backgroundColor: [wr >= 50 ? '#10b981' : '#f43f5e', 'rgba(255,255,255,0.05)'],
        borderWidth: 0,
        hoverOffset: 0,
      }]
    },
    options: {
      responsive: false,
      cutout: '78%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      animation: { animateRotate: true, duration: 800 }
    }
  });

  // Tiles
  document.getElementById('an-total').textContent   = trades.length;
  document.getElementById('an-wins').textContent    = wins;
  document.getElementById('an-losses').textContent  = losses;

  // P&L by market
  ['stock','crypto','forex'].forEach(m => {
    const mt     = trades.filter(t => t.market === m);
    const pnlINR = mt.reduce((s, t) => s + sign(t) * t.amountINR, 0);
    const pnlUSD = mt.reduce((s, t) => s + sign(t) * t.amountUSD, 0);
    const useUSD = m !== 'stock';

    const pEl = document.getElementById('an-mkt-' + m + '-pnl');
    pEl.textContent = (pnlINR >= 0 ? '+' : '-') + fmtINR(pnlINR);
    pEl.className   = 'an-mkt-pnl ' + (pnlINR > 0 ? 'green' : pnlINR < 0 ? 'red' : '');

    const subEl = document.getElementById('an-mkt-' + m + '-sub');
    if (subEl) {
      subEl.textContent = useUSD ? ((pnlUSD >= 0 ? '+' : '-') + fmtUSD(pnlUSD)) : '';
      subEl.className   = 'an-mkt-sub ' + (pnlINR > 0 ? 'green' : pnlINR < 0 ? 'red' : '');
    }

    document.getElementById('an-mkt-' + m + '-n').textContent = mt.length + ' trade' + (mt.length !== 1 ? 's' : '');
  });

  // Cumulative P&L Growth chart
  const byDate = {};
  [...trades].reverse().forEach(t => {
    if (!byDate[t.date]) byDate[t.date] = 0;
    byDate[t.date] += sign(t) * t.amountINR;
  });
  const labels = Object.keys(byDate).sort();
  let running = 0;
  const cumData = labels.map(d => { running += byDate[d]; return parseFloat(running.toFixed(2)); });

  const anCtx = document.getElementById('anPnlChart').getContext('2d');
  if (anPnlChart) anPnlChart.destroy();
  const grad = anCtx.createLinearGradient(0, 0, 0, 220);
  grad.addColorStop(0, 'rgba(99,102,241,0.3)');
  grad.addColorStop(1, 'rgba(99,102,241,0)');

  anPnlChart = new Chart(anCtx, {
    type: 'line',
    data: { labels, datasets: [{
      data: cumData,
      borderColor: '#6366f1',
      borderWidth: 2.5,
      pointBackgroundColor: cumData.map(v => v >= 0 ? '#10b981' : '#f43f5e'),
      pointRadius: 3,
      pointHoverRadius: 6,
      fill: true,
      backgroundColor: grad,
      tension: 0.4,
    }]},
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a2235',
          borderColor: '#1e2d45',
          borderWidth: 1,
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          callbacks: { label: c => ' ' + (c.parsed.y >= 0 ? '+' : '') + '₹' + c.parsed.y.toFixed(2) }
        }
      },
      scales: {
        x: { ticks: { color: '#64748b', font: { size: 10, family: 'Inter' } }, grid: { color: '#1e2d45' } },
        y: { ticks: { color: '#64748b', font: { size: 10, family: 'Inter' }, callback: v => '₹' + v }, grid: { color: '#1e2d45' } }
      }
    }
  });
}

// ── Modal ──────────────────────────────────────────────────────────────────
function openModal(id) {
  const t = trades.find(t => t.id === id);
  if (!t || !t.screenshot) return;
  document.getElementById('modalImg').src = t.screenshot;
  document.getElementById('modal').classList.add('open');
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
}

// ── Trade Detail Modal ─────────────────────────────────────────────────────
function openTradeDetail(id) {
  const t = trades.find(t => t.id === id);
  if (!t) return;

  const inrAmt  = sign(t) * t.amountINR;
  const usdAmt  = sign(t) * t.amountUSD;
  const showUSD = t.market !== 'stock';
  const mIcon   = { stock: '\uD83C\uDDEE\uD83C\uDDF3', crypto: '\u20BF', gold: '\uD83E\uDD47' };
  const dateStr = new Date(t.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // RR ratio
  let rrHtml = '';
  if (t.entry && t.tp && t.sl) {
    const reward = Math.abs(t.tp - t.entry);
    const risk   = Math.abs(t.entry - t.sl);
    const rr     = risk > 0 ? (reward / risk).toFixed(2) : '—';
    rrHtml = '<div class="td-row"><span class="td-lbl">Risk:Reward</span><span class="td-val ' + (parseFloat(rr) >= 1 ? 'green' : 'red') + '">1 : ' + rr + '</span></div>';
  }

  document.getElementById('tradeModalContent').innerHTML = [
    '<div class="td-header ' + t.outcome + '">',
      '<div class="td-symbol">' + (mIcon[t.market] || '') + ' ' + t.symbol + '</div>',
      '<div class="td-badge ' + t.outcome + '">' + (t.outcome === 'profit' ? '▲ PROFIT' : '▼ LOSS') + '</div>',
      '<div class="td-amount ' + t.outcome + '">' + (inrAmt >= 0 ? '+' : '-') + fmtINR(inrAmt) + '</div>',
      showUSD ? '<div class="td-amount-usd">' + (usdAmt >= 0 ? '+' : '-') + fmtUSD(usdAmt) + '</div>' : '',
    '</div>',
    '<div class="td-body">',
      '<div class="td-row"><span class="td-lbl">Date</span><span class="td-val">' + dateStr + '</span></div>',
      '<div class="td-row"><span class="td-lbl">Time</span><span class="td-val">' + (t.time || '—') + '</span></div>',
      '<div class="td-row"><span class="td-lbl">Market</span><span class="td-val"><span class="market-tag ' + t.market + '">' + t.market.toUpperCase() + '</span></span></div>',
      '<div class="td-row"><span class="td-lbl">Side</span><span class="td-val"><span class="jnl-badge side-badge ' + (t.side || 'buy') + '">' + (t.side === 'sell' ? '▼ SELL' : '▲ BUY') + '</span></span></div>',
      t.entry ? '<div class="td-row"><span class="td-lbl">Entry Price</span><span class="td-val">' + t.entry + '</span></div>' : '',
      t.lot   ? '<div class="td-row"><span class="td-lbl">Lot Size</span><span class="td-val">' + t.lot + '</span></div>' : '',
      t.tp    ? '<div class="td-row"><span class="td-lbl">Target (TP)</span><span class="td-val green">' + t.tp + '</span></div>' : '',
      t.sl    ? '<div class="td-row"><span class="td-lbl">Stop Loss (SL)</span><span class="td-val red">' + t.sl + '</span></div>' : '',
      rrHtml,
      t.logic ? [
        '<div class="td-section-title">Trade Logic</div>',
        '<div class="td-logic">' + escHtml(t.logic) + '</div>',
      ].join('') : '',
      t.screenshot ? [
        '<div class="td-section-title">Screenshot</div>',
        '<img class="td-screenshot" src="' + t.screenshot + '" alt="screenshot" onclick="openModal(' + t.id + ')" />',
      ].join('') : '',
    '</div>',
  ].join('');

  document.getElementById('tradeModal').classList.add('open');
}

function closeTradeModal(e) {
  if (!e || e.target === document.getElementById('tradeModal')) {
    document.getElementById('tradeModal').classList.remove('open');
  }
}

function confirmDeleteTrade(id) {
  if (confirm('Delete this trade?')) {
    deleteTrade(id);
    document.getElementById('tradeModal').classList.remove('open');
  }
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderAll() {
  renderHome();
  renderJournal();
}

function showToast(msg) {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.remove('toast-hide');
  toast.classList.add('toast-show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');
  }, 1500);
}

function updateProfileName(name) {
  const n = name.trim() || 'Trader';
  localStorage.setItem('profileName', n);
  const initial = n.charAt(0).toUpperCase();
  ['navAvatar','sidebarAvatar','settingsAvatar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = initial;
  });
  ['navProfileName','sidebarProfileName'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = n.length > 8 ? n.slice(0, 8) + '…' : n;
  });
}

// ── Settings ───────────────────────────────────────────────────────────────
function renderSettings() {
  document.getElementById('stt-count').textContent = trades.length;

  const from = document.getElementById('sttFrom').value;
  const to   = document.getElementById('sttTo').value;

  let filtered = trades;
  if (from) filtered = filtered.filter(t => t.date >= from);
  if (to)   filtered = filtered.filter(t => t.date <= to);

  // Sort oldest → newest
  filtered = [...filtered].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

  const list = document.getElementById('stt-trade-list');
  
  console.log('Total trades:', trades.length);
  console.log('Filtered trades:', filtered.length);
  console.log('From:', from, 'To:', to);
  
  if (!filtered.length) {
    list.innerHTML = '<div class="stt-row"><span class="stt-row-sub" style="padding:8px 0;">' + (trades.length ? 'No trades in selected range.' : 'No trades yet.') + '</span></div>';
    return;
  }

  const mIcon = { stock: '🇮🇳', crypto: '₿', forex: '💱' };
  list.innerHTML = filtered.map(t => {
    const inrAmt = sign(t) * t.amountINR;
    const d = new Date(t.date + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
    const isSelected = selectedTrades.has(t.id);
    return [
      '<div class="stt-row stt-trade-row' + (isSelected ? ' selected' : '') + '" data-trade-id="' + t.id + '">',
        selectionMode ? '<div class="stt-checkbox">' + (isSelected ? '✓' : '') + '</div>' : '',
        '<div class="stt-row-info">',
          '<span class="stt-row-label">' + (mIcon[t.market] || '') + ' ' + t.symbol + '</span>',
          '<span class="stt-row-sub">' + d + ' &nbsp;·&nbsp; ' + t.outcome.toUpperCase() + '</span>',
        '</div>',
        '<div class="stt-trade-right">',
          '<span class="stt-trade-amt ' + t.outcome + '">' + (inrAmt >= 0 ? '+' : '-') + fmtINR(inrAmt) + '</span>',
          !selectionMode ? '<button class="stt-del-btn" onclick="deleteTradeFromSettings(' + t.id + ')">🗑</button>' : '',
        '</div>',
      '</div>'
    ].join('');
  }).join('');
  
  // Add long-press handlers for both touch and mouse
  document.querySelectorAll('.stt-trade-row').forEach(row => {
    const tradeId = parseInt(row.dataset.tradeId);
    let pressTimer;
    
    // Touch events (mobile)
    row.addEventListener('touchstart', (e) => {
      pressTimer = setTimeout(() => {
        if (!selectionMode) {
          enterSelectionMode();
          toggleTradeSelection(tradeId);
        }
      }, 500);
    });
    
    row.addEventListener('touchend', () => {
      clearTimeout(pressTimer);
    });
    
    row.addEventListener('touchmove', () => {
      clearTimeout(pressTimer);
    });
    
    // Mouse events (PC)
    row.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('stt-del-btn')) return;
      pressTimer = setTimeout(() => {
        if (!selectionMode) {
          enterSelectionMode();
          toggleTradeSelection(tradeId);
        }
      }, 500);
    });
    
    row.addEventListener('mouseup', () => {
      clearTimeout(pressTimer);
    });
    
    row.addEventListener('mouseleave', () => {
      clearTimeout(pressTimer);
    });
    
    // Click handler for selection mode
    row.addEventListener('click', (e) => {
      if (selectionMode && !e.target.classList.contains('stt-del-btn')) {
        e.preventDefault();
        toggleTradeSelection(tradeId);
      }
    });
  });
  
  // Show/hide selection toolbar
  updateSelectionToolbar();
}

function clearSttFilter() {
  document.getElementById('sttFrom').value = '';
  document.getElementById('sttTo').value   = '';
  document.getElementById('sttFromDisplay').textContent = 'Select date';
  document.getElementById('sttToDisplay').textContent   = 'Select date';
  renderSettings();
}

function enterSelectionMode() {
  selectionMode = true;
  selectedTrades.clear();
  renderSettings();
}

function exitSelectionMode() {
  selectionMode = false;
  selectedTrades.clear();
  renderSettings();
}

function toggleTradeSelection(id) {
  if (selectedTrades.has(id)) {
    selectedTrades.delete(id);
  } else {
    selectedTrades.add(id);
  }
  renderSettings();
}

function deleteSelectedTrades() {
  if (selectedTrades.size === 0) return;
  if (!confirm(`Delete ${selectedTrades.size} selected trade(s)?`)) return;
  
  selectedTrades.forEach(id => {
    trades = trades.filter(t => t.id !== id);
  });
  localStorage.setItem('trades', JSON.stringify(trades));
  exitSelectionMode();
}

function updateSelectionToolbar() {
  let toolbar = document.getElementById('selectionToolbar');
  
  if (selectionMode) {
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.id = 'selectionToolbar';
      toolbar.className = 'selection-toolbar';
      toolbar.innerHTML = `
        <button class="sel-btn sel-cancel" onclick="exitSelectionMode()">Cancel</button>
        <span class="sel-count">${selectedTrades.size} selected</span>
        <button class="sel-btn sel-delete" onclick="deleteSelectedTrades()">Delete</button>
      `;
      document.getElementById('sttManagePanel').appendChild(toolbar);
    } else {
      toolbar.querySelector('.sel-count').textContent = `${selectedTrades.size} selected`;
    }
  } else if (toolbar) {
    toolbar.remove();
  }
}

function toggleManageTrades() {
  const panel = document.getElementById('sttManagePanel');
  const arrow = document.getElementById('sttManageArrow');
  const open  = panel.style.display === 'none';
  panel.style.display = open ? 'block' : 'none';
  arrow.textContent   = open ? '▾' : '›';
  if (open) renderSettings();
}

function deleteTradeFromSettings(id) {
  if (!confirm('Delete this trade?')) return;
  deleteTradeFromStorage(id);
  renderSettings();
}

function clearAllTrades() {
  if (!confirm('Delete ALL trades permanently? This cannot be undone.')) return;
  trades = [];
  localStorage.setItem('trades', JSON.stringify(trades));
  renderSettings();
}

function exportData() {
  const blob = new Blob([JSON.stringify(trades, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'tradejournal-backup-' + today() + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importData() {
  document.getElementById('importInput').click();
}

function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (!Array.isArray(imported)) throw new Error('Invalid format');
      if (!confirm('Import ' + imported.length + ' trades? This will merge with existing trades.')) return;
      // Merge, avoid duplicates by id
      const existingIds = new Set(trades.map(t => t.id));
      const newTrades   = imported.filter(t => !existingIds.has(t.id));
      trades = [...trades, ...newTrades].sort((a, b) => b.id - a.id);
      save();
      renderAll();
      renderSettings();
      alert('Imported ' + newTrades.length + ' new trades.');
    } catch {
      alert('Invalid backup file.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}
