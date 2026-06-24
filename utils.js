/* =====================================================
   DEBT FREEDOM PRO — Shared Utilities
   ===================================================== */

// ── Format helpers ──
function fmtMoney(v) {
  if (v >= 1e6) return '$' + (v/1e6).toFixed(2) + 'M';
  if (v >= 1000) return '$' + v.toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0});
  return '$' + v.toFixed(0);
}

function fmtMoneyFull(v) {
  return '$' + Math.abs(v).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
}

function monthToDate(m) {
  var d = new Date();
  d.setMonth(d.getMonth() + m);
  return d.toLocaleDateString('en-US', {month:'short', year:'numeric'});
}

function monthsToLabel(m) {
  if (!m || m <= 0) return '—';
  var d = new Date();
  d.setMonth(d.getMonth() + m);
  return d.toLocaleDateString('en-US', {month:'long', year:'numeric'});
}

function monthsToYM(m) {
  if (!m) return '—';
  var y = Math.floor(m/12), mo = m%12;
  if (y === 0) return mo + ' mo';
  if (mo === 0) return y + ' yr';
  return y + ' yr ' + mo + ' mo';
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function uid() { return 'd' + Math.random().toString(36).slice(2,9); }

// ── Debt simulation engine ──
function simulate(debts, extraPayment, strategy) {
  var working = debts.filter(function(d){ return d.balance > 0; })
    .map(function(d){ return { id:d.id, name:d.name||'Debt', balance:d.balance, apr:d.apr||0, min:d.min||0, paid:0, payoffMonth:null, interestPaid:0 }; });
  if (working.length === 0) return { months:0, totalInterest:0, order:[], history:[], schedule:[] };

  var history = [], schedule = [], month = 0, totalInterest = 0, maxMonths = 720;
  var startTotal = working.reduce(function(a,d){ return a+d.balance; }, 0);
  history.push({ month:0, totalBalance:startTotal });
  var extra = extraPayment;

  while (working.reduce(function(a,d){ return a+Math.max(d.balance,0); }, 0) > 0.01 && month < maxMonths) {
    month++;
    var pool = extra;
    var monthInterest = 0;

    working.forEach(function(d) {
      if (d.balance <= 0) return;
      var rate = (d.apr/100)/12;
      var interest = d.balance * rate;
      totalInterest += interest; monthInterest += interest;
      d.interestPaid += interest;
      d.balance += interest;
      var pay = Math.min(d.min, d.balance);
      d.balance -= pay; d.paid += pay;
    });

    var order = sortOrder(working.filter(function(d){ return d.balance > 0.005; }), strategy);
    for (var i = 0; i < order.length && pool > 0.005; i++) {
      var d2 = order[i], ep = Math.min(pool, d2.balance);
      d2.balance -= ep; d2.paid += ep; pool -= ep;
    }

    working.forEach(function(d) {
      if (d.balance <= 0.01 && d.payoffMonth === null) { d.balance = 0; d.payoffMonth = month; }
    });

    // freed minimums roll into extra
    var freed = 0;
    working.forEach(function(d){ if (d.balance <= 0) freed += d.min; });
    extra = extraPayment + freed;

    var totalBal = working.reduce(function(a,d){ return a+Math.max(d.balance,0); }, 0);
    history.push({ month:month, totalBalance:totalBal, interestThisMonth:monthInterest });
    schedule.push({ month:month, totalBalance:totalBal, interestThisMonth:monthInterest });
  }

  var orderResult = working.slice().sort(function(a,b){ return (a.payoffMonth||9999)-(b.payoffMonth||9999); });
  return { months:month, totalInterest:totalInterest, order:orderResult, history:history, schedule:schedule };
}

function simulateMinimumsOnly(debts) {
  var working = debts.filter(function(d){ return d.balance > 0; })
    .map(function(d){ return { balance:d.balance, apr:d.apr||0, min:d.min||0 }; });
  if (working.length === 0) return { totalInterest:0, months:0 };
  var month = 0, ti = 0, max = 720;
  while (working.reduce(function(a,d){ return a+Math.max(d.balance,0); }, 0) > 0.01 && month < max) {
    month++;
    working.forEach(function(d) {
      if (d.balance <= 0) return;
      var interest = d.balance * (d.apr/100)/12;
      ti += interest; d.balance += interest;
      var pay = Math.min(d.min, d.balance);
      d.balance -= pay;
      if (d.balance <= 0.01) d.balance = 0;
    });
  }
  return { totalInterest: ti, months: month };
}

function sortOrder(list, strategy) {
  var arr = list.slice();
  if (strategy === 'avalanche') {
    arr.sort(function(a,b){ return b.apr - a.apr; });
  } else if (strategy === 'snowball') {
    arr.sort(function(a,b){ return a.balance - b.balance; });
  } else {
    var maxBal = Math.max.apply(null, arr.map(function(d){ return d.balance; })) || 1;
    var maxApr = Math.max.apply(null, arr.map(function(d){ return d.apr; })) || 1;
    arr.sort(function(a,b) {
      var sa = 0.4*(1 - a.balance/maxBal) + 0.6*(a.apr/maxApr);
      var sb = 0.4*(1 - b.balance/maxBal) + 0.6*(b.apr/maxApr);
      return sb - sa;
    });
  }
  return arr;
}

// ── Local storage ──
var SK = 'df.debts.v3', EK = 'df.extra.v3', STK = 'df.strategy.v3';
var GOALK = 'df.goals.v1', LOGK = 'df.paylog.v1', NOTK = 'df.notes.v1';

function loadAppState() {
  try {
    return {
      debts: JSON.parse(localStorage.getItem(SK)) || defaultDebts(),
      extra: parseFloat(localStorage.getItem(EK)) || 100,
      strategy: localStorage.getItem(STK) || 'avalanche',
      goals: JSON.parse(localStorage.getItem(GOALK)) || [],
      payLog: JSON.parse(localStorage.getItem(LOGK)) || [],
      notes: localStorage.getItem(NOTK) || ''
    };
  } catch(e) {
    return { debts: defaultDebts(), extra: 100, strategy: 'avalanche', goals: [], payLog: [], notes: '' };
  }
}

function saveAppState(state) {
  try {
    localStorage.setItem(SK, JSON.stringify(state.debts));
    localStorage.setItem(EK, String(state.extra));
    localStorage.setItem(STK, state.strategy);
    localStorage.setItem(GOALK, JSON.stringify(state.goals || []));
    localStorage.setItem(LOGK, JSON.stringify(state.payLog || []));
    if (state.notes !== undefined) localStorage.setItem(NOTK, state.notes);
  } catch(e) {}
}

function defaultDebts() {
  return [
    { id:uid(), name:'Credit Card', balance:4200, apr:22.9, min:120, color:'#3FA374' },
    { id:uid(), name:'Car Loan', balance:9800, apr:6.5, min:230, color:'#C99B3A' },
    { id:uid(), name:'Student Loan', balance:15200, apr:4.8, min:180, color:'#7C5CBF' }
  ];
}

// ── Toast helper ──
var _toastTimer;
function showToast(msg, duration) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg || 'Saved ✓';
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function(){ t.classList.remove('show'); }, duration || 1800);
}

// ── FAQ accordion ──
function initFaq(container) {
  (container || document).querySelectorAll('.faq-q').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var a = btn.nextElementSibling;
      var isOpen = btn.classList.contains('open');
      document.querySelectorAll('.faq-q.open').forEach(function(ob) {
        ob.classList.remove('open');
        ob.querySelector('.icon').textContent = '+';
        ob.nextElementSibling.style.maxHeight = '0';
      });
      if (!isOpen) {
        btn.classList.add('open');
        btn.querySelector('.icon').textContent = '×';
        a.style.maxHeight = a.scrollHeight + 'px';
      }
    });
  });
}

// ── Navigation router (SPA) ──
function navigateTo(page) {
  window.location.href = page;
}

// ── Pro status ──
function isPro() {
  return localStorage.getItem('df.pro') === 'true';
}

function setPro(val) {
  localStorage.setItem('df.pro', val ? 'true' : 'false');
}
