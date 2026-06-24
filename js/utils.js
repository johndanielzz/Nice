// Minimal utilities used by index.html and placeholder pages
(function(window){
  'use strict';
  function defaultDebts(){
    return [
      { id: uid(), name: 'Visa', balance: 4000, apr: 18.99, min: 80 },
      { id: uid(), name: 'Car Loan', balance: 8200, apr: 5.5, min: 185 }
    ];
  }
  function loadAppState(){
    try{
      var s = localStorage.getItem('df_state');
      if(!s) throw 0;
      var parsed = JSON.parse(s);
      // migrate older shapes
      if(!parsed.debts) parsed.debts = defaultDebts();
      return parsed;
    }catch(e){
      return { debts: defaultDebts(), extra:100, strategy:'avalanche', pro:false };
    }
  }
  function saveAppState(state){
    try{ localStorage.setItem('df_state', JSON.stringify(state)); }
    catch(e){ console.warn('save failed',e); }
  }
  function uid(){ return 'id-'+Math.random().toString(36).slice(2,10); }
  function esc(s){ if(s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function fmtMoney(n){ if(n==null) return '$0.00'; return '$'+Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function monthsToLabel(m){
    if(m<=0) return 'Now';
    var d = new Date(); d.setMonth(d.getMonth()+m);
    return d.toLocaleDateString('en-US',{year:'numeric',month:'long'});
  }
  function monthsToYM(m){ if(m<=0) return '0 months'; return m+' months'; }
  function monthToDate(m){ return monthsToLabel(m); }

  // Very small payoff simulator (approximate) that produces plausible-looking output
  function simulate(debts, extra, strategy){
    var dcopy = debts.map(function(d){ return { id:d.id, name:d.name||'Debt', balance:Number(d.balance)||0, apr:Number(d.apr)||0, min:Number(d.min)||0, paid:0, interestPaid:0 }; });
    var months = 0; var history = [];
    var totalMin = dcopy.reduce(function(s,x){ return s + (x.min||0); },0);
    var payment = totalMin + (Number(extra)||0);
    // simple monthly loop
    var MAX=600;
    while(dcopy.some(function(x){ return x.balance>0.005; }) && months<MAX){
      months++;
      var monthRecord = { month: months, totalBalance:0, interestThisMonth:0 };
      // accrue interest
      dcopy.forEach(function(x){ if(x.balance<=0) return; var monthlyRate = (x.apr||0)/100/12; var interest = x.balance*monthlyRate; x.balance += interest; x.interestPaid += interest; monthRecord.interestThisMonth += interest; });
      // pay minimums first
      var remaining = payment;
      dcopy.forEach(function(x){ if(x.balance<=0) return; var pay = Math.min(x.min||0, x.balance); x.balance -= pay; x.paid += pay; remaining -= pay; });
      // apply remaining according to strategy
      var order = ordering(dcopy, strategy);
      for(var i=0;i<order.length && remaining>0;i++){
        var x = order[i]; if(x.balance<=0) continue;
        var pay = Math.min(remaining, x.balance);
        x.balance -= pay; x.paid += pay; remaining -= pay;
      }
      // clamp negatives
      dcopy.forEach(function(x){ if(x.balance<0) x.balance = 0; monthRecord.totalBalance += x.balance; });
      history.push(monthRecord);
      if(months>1000) break;
    }
    // build order summary
    var orderArr = dcopy.map(function(x){ return { id:x.id, name:x.name, balance:Math.round(x.balance*100)/100, apr:x.apr, paid:x.paid, interestPaid:Math.round(x.interestPaid*100)/100, payoffMonth: Math.round(months) }; });
    var schedule = history.map(function(h,i){ return { month: h.month, totalBalance: Math.round(h.totalBalance*100)/100, interestThisMonth: Math.round(h.interestThisMonth*100)/100 }; });
    var totalInterest = dcopy.reduce(function(s,x){ return s + x.interestPaid; },0);
    return { months: months, history: history, order: orderArr, schedule: schedule, totalInterest: Math.round(totalInterest*100)/100 };
  }
  function ordering(debts, strategy){
    var copy = debts.slice().filter(function(d){ return d.balance>0; });
    if(strategy==='avalanche') copy.sort(function(a,b){ return b.apr - a.apr; });
    else if(strategy==='snowball') copy.sort(function(a,b){ return a.balance - b.balance; });
    else if(strategy==='hybrid') copy.sort(function(a,b){ var s = (b.apr*0.6) - (a.apr*0.6) + (a.balance*0.4) - (b.balance*0.4); return s; });
    return copy;
  }

  function simulateMinimumsOnly(debts){ return simulate(debts, 0, 'avalanche'); }
  function setPro(val){ var s = loadAppState(); s.pro = !!val; saveAppState(s); }

  // toast helper
  function showToast(msg){
    var t = document.getElementById('toast');
    if(!t){ t = document.createElement('div'); t.id='toast'; t.style.position='fixed'; t.style.right='18px'; t.style.bottom='18px'; t.style.padding='10px 14px'; t.style.background='rgba(0,0,0,0.8)'; t.style.color='#fff'; t.style.borderRadius='8px'; document.body.appendChild(t); }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._hide);
    t._hide = setTimeout(function(){ t.style.opacity='0'; },2000);
  }

  // expose
  window.loadAppState = loadAppState;
  window.saveAppState = saveAppState;
  window.uid = uid;
  window.esc = esc;
  window.fmtMoney = fmtMoney;
  window.monthsToLabel = monthsToLabel;
  window.monthToDate = monthToDate;
  window.monthsToYM = monthsToYM;
  window.simulate = simulate;
  window.simulateMinimumsOnly = simulateMinimumsOnly;
  window.defaultDebts = defaultDebts;
  window.setPro = setPro;
  window.showToast = showToast;
})(window);
