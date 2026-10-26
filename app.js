(() => {
'use strict';
const DAY = 86400000, INTERVALS = [1, 3, 7, 21], NEED = 3, TOTAL = 3000;
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const FA = n => Number(n).toLocaleString('fa-IR');
const $app = document.getElementById('app');
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.random() * a.length | 0];

let DATA = null; const W = {};           // id -> word (with .lesson)
const timers = new Set();
const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };

/* ---------- storage ---------- */
const KEY = 'ew3000-v1';
let S;
try { S = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { S = {}; }
S.words = S.words || {}; S.lessons = S.lessons || {}; S.streak = S.streak || { count: 0, last: null }; S.best60 = S.best60 || 0;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const ws = id => (S.words[id] = S.words[id] || { miss: 0 });
const dkey = d => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
function touchStreak() {
  const t = dkey(new Date()); if (S.streak.last === t) return;
  const y = dkey(new Date(Date.now() - DAY));
  S.streak.count = S.streak.last === y ? S.streak.count + 1 : 1; S.streak.last = t; save();
}
function streakNow() {
  const t = dkey(new Date()), y = dkey(new Date(Date.now() - DAY));
  return (S.streak.last === t || S.streak.last === y) ? S.streak.count : 0;
}
const learnedIds = () => Object.keys(S.words).filter(id => S.words[id].learnedAt && W[id]);
const dueIds = () => learnedIds().filter(id => S.words[id].due && S.words[id].due <= Date.now()).sort((a, b) => S.words[a].due - S.words[b].due);
const hardIds = () => Object.keys(S.words).filter(id => W[id] && S.words[id].miss >= 2).sort((a, b) => S.words[b].miss - S.words[a].miss);
function nextDueText() {
  const ds = learnedIds().map(id => S.words[id].due).filter(Boolean).sort((a, b) => a - b);
  if (!ds.length) return '';
  const days = Math.max(1, Math.ceil((ds[0] - Date.now()) / DAY));
  return days === 1 ? 'مرور بعدی: فردا' : 'مرور بعدی: ' + FA(days) + ' روز دیگه';
}

/* ---------- audio (one element = reliable on iPhone) ---------- */
const au = new Audio(); au.preload = 'auto';
let aq = [], aToken = 0, aCb = null;
function playSeq(srcs, cb) {
  const tok = ++aToken; aq = srcs.slice(); aCb = cb || null;
  const step = () => {
    if (tok !== aToken) return;
    if (!aq.length) { setPlaying(false); const c = aCb; aCb = null; c && c(); return; }
    au.src = aq.shift();
    const p = au.play(); setPlaying(true);
    if (p && p.catch) p.catch(() => { if (tok === aToken) { aq = []; step(); } });
  };
  au.onended = step; au.onerror = step; step();
}
function stopAudio() { aToken++; aq = []; aCb = null; try { au.pause(); } catch (e) {} setPlaying(false); }
function setPlaying(on) { document.querySelectorAll('.spk').forEach(b => b.classList.toggle('playing', on)); }
const A = id => 'audio/' + id + '.mp3', AX = id => 'audio/' + id + '-ex.mp3';
const vibrate = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

/* ---------- helpers ---------- */
function screen(html) { clearTimers(); $app.innerHTML = '<div class="screen">' + html + '</div>'; }
function bindX(fn) { const x = $app.querySelector('.x'); if (x) x.onclick = fn; }
const exHtml = w => esc(w.example).replace(new RegExp('\\b(' + w.word + ')\\b', 'i'), '<mark>$1</mark>');

/* ---------- home ---------- */
function home() {
  stopAudio();
  const learned = learnedIds().length, due = dueIds().length, hard = hardIds().length;
  const L1 = DATA.lessons[0], l1done = S.lessons[L1.id] && S.lessons[L1.id].done;
  const lessonTile = `<button class="tile ${due ? '' : 'main'}" id="tLesson"><span class="ic">${l1done ? '✅' : '📘'}</span>
      <span class="t"><b>${esc(L1.title)}${l1done ? ' — تمام شد' : ''}</b><span>${l1done ? 'دوباره تمرین کن · درس ۲ به‌زودی' : FA(L1.words.length) + ' لغت جدید · حدود ۱۰ دقیقه'}</span></span>
      <span class="n">${l1done ? '↺' : 'شروع'}</span></button>`;
  const reviewTile = `<button class="tile ${due ? 'main due' : ''}" id="tReview"><span class="ic">🔁</span>
      <span class="t"><b>مرور امروز</b><span>${due ? 'این لغت‌ها امروز باید مرور بشن' : (learned ? nextDueText() : 'بعد از اولین درس فعال می‌شه')}</span></span>
      <span class="n">${FA(due)}</span></button>`;
  screen(`
    <div class="home-head"><div class="logo">۳۰۰۰ لغت<small>لغت‌های پرکاربرد انگلیسی</small></div>
      <div class="streak" title="روزهای پشت سر هم">🔥 ${FA(streakNow())}</div></div>
    <div class="prog"><div class="row"><span>پیشرفت تو</span><b><span class="en">${FA(learned)}</span> / ${FA(TOTAL)} لغت</b></div>
      <div class="bar"><i style="width:${Math.max(learned / TOTAL * 100, learned ? 1.2 : 0)}%"></i></div></div>
    <div class="tiles">
      ${due ? reviewTile + lessonTile : lessonTile + reviewTile}
      <button class="tile" id="tHard"><span class="ic">💪</span><span class="t"><b>لغت‌های سخت من</b><span>${hard ? 'لغت‌هایی که بیشتر اشتباه زدی' : 'فعلاً لغت سختی نداری'}</span></span><span class="n">${FA(hard)}</span></button>
      <button class="tile" id="tQuick"><span class="ic">⚡</span><span class="t"><b>مرور سریع ۶۰ ثانیه‌ای</b><span>${S.best60 ? 'بهترین رکورد: ' + FA(S.best60) + ' جواب درست' : 'هر چند تا که می‌تونی در یک دقیقه'}</span></span><span class="n">⏱</span></button>
    </div>
    ${DEBUG ? `<div class="dbg"><button id="dDue">debug: due now</button><button id="dLearn">debug: learn L1</button><button id="dReset">debug: reset</button></div>` : ''}
    <div class="foot">پیشرفتت روی همین گوشی ذخیره می‌شه</div>`);
  document.getElementById('tLesson').onclick = () => startLesson(L1);
  document.getElementById('tReview').onclick = reviewScreen;
  document.getElementById('tHard').onclick = hardScreen;
  document.getElementById('tQuick').onclick = quickIntro;
  if (DEBUG) {
    document.getElementById('dDue').onclick = () => { learnedIds().forEach(id => { if (!S.words[id].mastered) S.words[id].due = Date.now() - 1000; }); save(); home(); };
    document.getElementById('dLearn').onclick = () => { finishLessonState(L1); home(); };
    document.getElementById('dReset').onclick = () => { localStorage.removeItem(KEY); location.reload(); };
  }
}

/* ---------- learning phase ---------- */
function startLesson(L) {
  const ws_ = L.words, r2 = shuffle(ws_); let r3 = shuffle(ws_);
  while (r3[0].id === r2[r2.length - 1].id) r3 = shuffle(ws_);
  let r2b = r2; while (r2b[0].id === ws_[ws_.length - 1].id) r2b = shuffle(ws_);
  if (r2b !== r2) { r3 = shuffle(ws_); while (r3[0].id === r2b[r2b.length - 1].id) r3 = shuffle(ws_); }
  const seq = ws_.concat(r2b, r3);
  const run = { L, seq, i: 0, t0: Date.now() };
  learnCard(run);
}
function learnCard(run) {
  const w = run.seq[run.i], n = run.seq.length, round = Math.floor(run.i / run.L.words.length) + 1;
  const last = run.i === n - 1;
  screen(`
    <div class="top"><button class="x" aria-label="خروج">✕</button><div class="bar"><i style="width:${(run.i + 1) / n * 100}%"></i></div><span class="pill">${FA(run.i + 1)}/${FA(n)}</span></div>
    <div class="card">
      ${w.image ? `<div class="pic"><img src="${esc(w.image)}" alt=""></div>` : '<div class="pic"></div>'}
      <div class="word en">${esc(w.word)}</div>
      <div class="fa">${esc(w.fa)}</div>
      <div class="ex en">${exHtml(w)}</div>
      <button class="spk" id="spk" aria-label="پخش دوباره">🔊</button>
    </div>
    <div class="round">دور ${FA(round)} از ۳ ${round === 1 ? '· به ترتیب' : '· تصادفی'}</div>
    <button class="btn" id="next">${last ? 'شروع آزمون ✓' : 'بعدی ←'}</button>`);
  bindX(() => { if (confirm('از درس خارج می‌شی؟ پیشرفت این درس ذخیره نمی‌شه.')) home(); });
  const say = () => playSeq([A(w.id), AX(w.id)]);
  document.getElementById('spk').onclick = say;
  document.getElementById('next').onclick = () => { if (last) startLessonQuiz(run); else { run.i++; learnCard(run); } };
  say();
}

/* ---------- quiz engine ---------- */
const TYPES = [['en2fa', .4], ['fa2en', .3], ['listen', .3]];
function pickType() { let r = Math.random(); for (const [t, p] of TYPES) { if ((r -= p) < 0) return t; } return 'en2fa'; }
function distractorPool(targetIds) {
  const set = new Set(targetIds);
  learnedIds().forEach(id => set.add(id));
  targetIds.forEach(id => W[id].lesson.words.forEach(w => set.add(w.id)));
  return [...set];
}
/* opts: {mode, targets:[ids], need, pool:[ids], onAnswer(id,ok,first), onDone(stats), deadline?, title} */
function runQuiz(o) {
  const st = { correct: {}, seenWrong: {}, wrong: 0, right: 0, asked: 0, last: null, t0: Date.now(), firstTry: {} };
  o.targets.forEach(id => st.correct[id] = 0);
  const total = o.targets.length * o.need;
  let q = null, locked = false;
  const progress = () => o.targets.reduce((s, id) => s + Math.min(st.correct[id], o.need), 0);
  function nextQ() {
    if (o.deadline && Date.now() >= o.deadline) return o.onDone(st);
    let active = o.targets.filter(id => st.correct[id] < o.need);
    if (o.mode === 'quick') active = o.targets.slice();
    if (!active.length) return o.onDone(st);
    let cand = active.length > 1 ? active.filter(id => id !== st.last) : active;
    const id = pick(cand), type = pickType();
    const others = shuffle(o.pool.filter(x => x !== id && W[x].fa !== W[id].fa)).slice(0, 3);
    const optIds = shuffle([id].concat(others));
    q = { id, type, optIds, correctIdx: optIds.indexOf(id), limit: type === 'listen' ? 7000 : 5000 };
    st.last = id; st.asked++; locked = false;
    render();
  }
  function render() {
    const w = W[q.id], showFa = q.type !== 'fa2en';
    const label = { en2fa: 'معنی این لغت چیه؟', fa2en: 'انگلیسیِ این کلمه کدومه؟', listen: 'گوش کن و معنی رو انتخاب کن' }[q.type];
    const pill = o.mode === 'quick' ? `<span class="clock" id="clock"></span>` : `<span class="pill">${FA(progress())}/${FA(total)} درست</span>`;
    let mid;
    if (q.type === 'en2fa') mid = `<div class="qword en">${esc(w.word)}</div>`;
    else if (q.type === 'fa2en') mid = `<div class="qword fa">${esc(w.fa)}</div>`;
    else mid = `<button class="spk big" id="spk" aria-label="پخش دوباره">🔊</button>`;
    screen(`
      <div class="top"><button class="x" aria-label="خروج">✕</button>
        ${o.mode === 'quick' ? `<div class="h2">⚡ امتیاز: <span id="score">${FA(st.right)}</span></div>` : `<div class="bar"><i style="width:${progress() / total * 100}%"></i></div>`}${pill}</div>
      <div class="timer"><i id="tbar"></i></div>
      <div class="prompt" id="prompt" data-type="${q.type}"><div class="qlabel">${label}</div>${mid}</div>
      <div class="opts">${q.optIds.map((oid, i) => `<button class="opt ${showFa ? '' : 'en'}" data-i="${i}">${esc(showFa ? W[oid].fa : W[oid].word)}</button>`).join('')}</div>`);
    bindX(() => { stopAudio(); clearTimers(); (o.onQuit || home)(); });
    $app.querySelectorAll('.opt').forEach(b => b.onclick = () => answer(+b.dataset.i));
    const spk = document.getElementById('spk'); if (spk) spk.onclick = () => playSeq([A(w.id)]);
    if (q.type !== 'fa2en') playSeq([A(w.id)]); else stopAudio();
    // timer bar
    const tb = document.getElementById('tbar');
    tb.style.transition = 'none'; tb.style.transform = 'scaleX(1)';
    requestAnimationFrame(() => requestAnimationFrame(() => { tb.style.transition = `transform ${q.limit}ms linear, background ${q.limit}ms`; tb.style.transform = 'scaleX(0)'; tb.style.background = '#ef4444'; }));
    q.t = later(() => answer(null), q.limit);
    if (o.mode === 'quick') tickClock();
  }
  function tickClock() {
    const c = document.getElementById('clock'); if (!c) return;
    const left = Math.max(0, Math.ceil((o.deadline - Date.now()) / 1000));
    c.textContent = FA(left) + '″';
    if (left <= 0 && !locked) { answer(null, true); return; }
    later(tickClock, 250);
  }
  function answer(i, timeUp) {
    if (locked) return; locked = true;
    clearTimers();
    const w = W[q.id], ok = i === q.correctIdx, timeout = i === null;
    const btns = $app.querySelectorAll('.opt');
    btns.forEach((b, k) => { b.disabled = true; if (k === q.correctIdx) b.classList.add('ok'); else if (k === i) b.classList.add('bad'); else b.classList.add('dim'); });
    const tb = document.getElementById('tbar'); if (tb) { const cs = getComputedStyle(tb), m = cs.transform, bg = cs.backgroundColor; tb.style.transition = 'none'; tb.style.transform = m; tb.style.background = bg; }
    const first = !st.firstTry.hasOwnProperty(q.id); if (first) st.firstTry[q.id] = ok;
    if (ok) { st.correct[q.id]++; st.right++; }
    else { st.wrong++; st.seenWrong[q.id] = (st.seenWrong[q.id] || 0) + 1; ws(q.id).miss = (ws(q.id).miss || 0) + 1; save(); vibrate(timeout ? [80, 60, 80] : 200); const p = document.getElementById('prompt'); p && p.classList.add('shake'); }
    o.onAnswer && o.onAnswer(q.id, ok, first);
    const prompt = document.getElementById('prompt');
    if (prompt) prompt.insertAdjacentHTML('beforeend', `<div class="fb ${ok ? 'ok' : 'bad'}">${ok ? '✓ آفرین! ' : (timeout ? '⏱ وقت تموم شد — ' : '✗ ')}<span class="en">${esc(w.word)}</span> = ${esc(w.fa)}</div>`);
    if (o.mode === 'quick') { const sc = document.getElementById('score'); if (sc) sc.textContent = FA(st.right); }
    playSeq([ok ? 'audio/sfx-correct.mp3' : 'audio/sfx-wrong.mp3', A(w.id)]);
    if (timeUp) return later(() => o.onDone(st), 900);
    later(nextQ, o.mode === 'quick' ? (ok ? 750 : 1300) : (ok ? 1150 : 1700));
  }
  window.__app.quiz = { get q() { return q; }, get locked() { return locked; }, st, answer: i => answer(i) };
  nextQ();
}

/* ---------- lesson quiz + completion ---------- */
function finishLessonState(L) {
  const now = Date.now();
  L.words.forEach(w => { const s = ws(w.id); if (!s.learnedAt) { s.learnedAt = now; s.stage = 0; s.due = now + INTERVALS[0] * DAY; } });
  S.lessons[L.id] = { done: true, at: now }; touchStreak(); save();
}
function startLessonQuiz(run) {
  const ids = run.L.words.map(w => w.id);
  runQuiz({ mode: 'lesson', targets: ids, need: NEED, pool: ids, onDone: st => {
    finishLessonState(run.L);
    const acc = Math.round(st.right / Math.max(1, st.right + st.wrong) * 100);
    const mins = Math.max(1, Math.round((Date.now() - run.t0) / 60000));
    doneScreen('🎉', `${esc(run.L.title)} تمام شد!`, 'این ۱۰ لغت فردا، ۳ روز، ۷ روز و ۲۱ روز بعد برای مرور برمی‌گردن تا برای همیشه تو ذهنت بمونن.',
      [[FA(acc) + '٪', 'دقت'], [FA(st.wrong), 'اشتباه'], [FA(mins), 'دقیقه']], run.L.words.map(w => w.id));
  }});
}
function doneScreen(icon, title, text, stats, chips, extraBtn) {
  stopAudio();
  screen(`<div class="done"><div class="big">${icon}</div><h1>${title}</h1><p>${text}</p>
    ${stats ? `<div class="stats">${stats.map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('')}</div>` : ''}
    ${chips && chips.length ? `<div class="chips">${chips.map(id => `<span class="chip"><span class="en">${esc(W[id].word)}</span> · ${esc(W[id].fa)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="btns">${extraBtn ? `<button class="btn ghost" id="extra">${extraBtn[0]}</button>` : ''}<button class="btn" id="home">بازگشت به خانه</button></div>`);
  document.getElementById('home').onclick = home;
  if (extraBtn) document.getElementById('extra').onclick = extraBtn[1];
  touchStreak();
}

/* ---------- spaced review ---------- */
function reviewScreen() {
  stopAudio();
  const due = dueIds();
  if (!due.length) {
    screen(`<div class="top"><button class="x">✕</button><div class="h2">🔁 مرور امروز</div></div>
      <div class="empty"><div class="big">🌙</div><div>${learnedIds().length ? 'امروز مروری نداری، عالیه!<br>' + nextDueText() : 'اول درس ۱ رو تموم کن،<br>بعد لغت‌ها اینجا برای مرور برمی‌گردن.'}</div></div>
      <button class="btn" id="home">بازگشت</button>`);
    bindX(home); document.getElementById('home').onclick = home; return;
  }
  screen(`<div class="top"><button class="x">✕</button><div class="h2">🔁 مرور امروز</div><span class="pill">${FA(due.length)} لغت</span></div>
    <div class="empty" style="justify-content:flex-start;gap:1.6dvh"><div>این لغت‌ها امروز باید مرور بشن:</div>
    <div class="chips" style="max-height:none">${due.slice(0, 20).map(id => `<span class="chip"><span class="en">${esc(W[id].word)}</span></span>`).join('')}</div></div>
    <button class="btn" id="go">شروع مرور</button>`);
  bindX(home);
  document.getElementById('go').onclick = () => {
    runQuiz({ mode: 'review', targets: due, need: 1, pool: distractorPool(due),
      onAnswer: (id, ok, first) => { if (!first) return; const s = ws(id);
        if (ok) { s.stage = (s.stage || 0) + 1; if (s.stage >= INTERVALS.length) { s.mastered = true; s.due = null; } else s.due = Date.now() + INTERVALS[s.stage] * DAY; }
        else { s.stage = 0; s.due = Date.now() + INTERVALS[0] * DAY; }
        save(); },
      onDone: st => { const good = Object.values(st.firstTry).filter(Boolean).length;
        doneScreen('✅', 'مرور تمام شد!', 'لغت‌هایی که درست زدی دیرتر برمی‌گردن، و اونایی که اشتباه زدی فردا دوباره میان.', [[FA(good), 'بار اول درست'], [FA(due.length - good), 'نیاز به تمرین']], due); } });
  };
}

/* ---------- hard words ---------- */
function hardScreen() {
  stopAudio();
  const hard = hardIds();
  if (!hard.length) {
    screen(`<div class="top"><button class="x">✕</button><div class="h2">💪 لغت‌های سخت من</div></div>
      <div class="empty"><div class="big">🏆</div><div>هنوز لغت سختی نداری.<br>هر لغتی که ۲ بار یا بیشتر اشتباه بزنی، اینجا میاد تا بیشتر تمرینش کنی.</div></div>
      <button class="btn" id="home">بازگشت</button>`);
    bindX(home); document.getElementById('home').onclick = home; return;
  }
  screen(`<div class="top"><button class="x">✕</button><div class="h2">💪 لغت‌های سخت من</div><span class="pill">${FA(hard.length)}</span></div>
    <div class="hl">${hard.slice(0, 12).map(id => `<div class="hw"><div><div class="en">${esc(W[id].word)}</div><span>${esc(W[id].fa)}</span></div><small>✗${FA(S.words[id].miss)}</small></div>`).join('')}</div>
    <button class="btn" id="go">تمرین لغت‌های سخت</button>`);
  bindX(home);
  document.getElementById('go').onclick = () => {
    runQuiz({ mode: 'hard', targets: hard, need: 2, pool: distractorPool(hard),
      onAnswer: (id, ok) => { if (ok) { const s = ws(id); s.miss = Math.max(0, (s.miss || 0) - 1); save(); } },
      onDone: st => doneScreen('💪', 'تمرین تمام شد!', 'هر جواب درست، لغت رو یه قدم از لیست سخت‌ها دورتر می‌کنه.', [[FA(st.right), 'درست'], [FA(st.wrong), 'اشتباه'], [FA(hardIds().length), 'هنوز سخت']], null, ['دوباره تمرین کن', hardScreen]) });
  };
}

/* ---------- 60-second quick review ---------- */
function quickIntro() {
  stopAudio();
  const ids = learnedIds();
  if (ids.length < 4) {
    screen(`<div class="top"><button class="x">✕</button><div class="h2">⚡ مرور سریع</div></div>
      <div class="empty"><div class="big">⚡</div><div>اول درس ۱ رو تموم کن،<br>بعد اینجا در ۶۰ ثانیه هر چند تا لغت که بتونی جواب می‌دی.</div></div>
      <button class="btn" id="home">بازگشت</button>`);
    bindX(home); document.getElementById('home').onclick = home; return;
  }
  screen(`<div class="top"><button class="x">✕</button><div class="h2">⚡ مرور سریع ۶۰ ثانیه‌ای</div></div>
    <div class="empty"><div class="big">⏱</div><div>۶۰ ثانیه وقت داری.<br>هر چند تا سؤال که بتونی درست جواب بده!<br>${S.best60 ? 'رکورد تو: ' + FA(S.best60) : ''}</div></div>
    <button class="btn" id="go">شروع!</button>`);
  bindX(home);
  document.getElementById('go').onclick = () => {
    const deadline = Date.now() + 60000;
    runQuiz({ mode: 'quick', targets: ids, need: Infinity, pool: distractorPool(ids), deadline,
      onDone: st => { const rec = st.right > S.best60; if (rec) { S.best60 = st.right; save(); }
        doneScreen(rec ? '🏆' : '⚡', rec ? 'رکورد جدید!' : 'وقت تموم شد!', `در ۶۰ ثانیه ${FA(st.right)} جواب درست دادی.`, [[FA(st.right), 'درست'], [FA(st.wrong), 'اشتباه'], [FA(S.best60), 'رکورد']], null, ['دوباره', quickIntro]); } });
  };
}

/* ---------- boot ---------- */
window.__app = { get S() { return S; }, W, home, DEBUG };
fetch('words.json').then(r => r.json()).then(d => {
  DATA = d; d.lessons.forEach(L => L.words.forEach(w => { w.lesson = L; W[w.id] = w; }));
  home();
}).catch(() => { $app.innerHTML = '<div class="empty">خطا در بارگذاری. اینترنت رو چک کن و دوباره باز کن.</div>'; });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
})();
