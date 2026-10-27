(() => {
'use strict';
const fitFa = t => { const m = Math.max(...t.split(/[\s،؛]+/).map(x => x.replace(/\u200c/g, '').length)); return m > 7 ? ` style="font-size:min(var(--fs),${(130 / m).toFixed(1)}vw)"` : ''; };
const fitO = t => t.length > 9 ? ` style="font-size:min(var(--fs),${(66 / t.length).toFixed(1)}vw)"` : '';
const fitW = t => t.length > 8 ? ` style="font-size:min(var(--fs),${(128 / t.length).toFixed(1)}vw)"` : '';
const DAY = 86400000, INTERVALS = [1, 3, 7, 21], NEED = 3, PER_PAGE = 20;
const LEVELS = [['A1', 'مبتدی'], ['A2', 'پایه'], ['B1', 'متوسط'], ['B2', 'بالاتر از متوسط']];
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const FA = n => Number(n).toLocaleString('fa-IR');
const $app = document.getElementById('app');
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.random() * a.length | 0];

const W = {};            // id -> {id,w,fa,ex,img,level,li}
const LV = {};           // level -> {id,name,lessons:[[ids]], count, available}
let TOTAL = 0;
const timers = new Set();
const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };

/* ---------- storage ---------- */
const KEY = 'ew3000-v1';
let S;
try { S = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { S = {}; }
S.words = S.words || {}; S.lessons = S.lessons || {}; S.streak = S.streak || { count: 0, last: null }; S.best60 = S.best60 || 0;
if (S.lessons['1']) { S.lessons['A1-1'] = S.lessons['1']; delete S.lessons['1']; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
save();
const ws = id => (S.words[id] = S.words[id] || { miss: 0 });
const dkey = d => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
function touchStreak() {
  const t = dkey(new Date()); if (S.streak.last === t) return;
  const y = dkey(new Date(Date.now() - DAY));
  S.streak.count = S.streak.last === y ? S.streak.count + 1 : 1; S.streak.last = t; save();
}
function streakNow() { const t = dkey(new Date()), y = dkey(new Date(Date.now() - DAY)); return (S.streak.last === t || S.streak.last === y) ? S.streak.count : 0; }
const learnedIds = () => Object.keys(S.words).filter(id => S.words[id].learnedAt && W[id]);
const dueIds = () => learnedIds().filter(id => S.words[id].due && S.words[id].due <= Date.now()).sort((a, b) => S.words[a].due - S.words[b].due);
const hardIds = () => Object.keys(S.words).filter(id => W[id] && S.words[id].miss >= 2).sort((a, b) => S.words[b].miss - S.words[a].miss);
const lessonDone = (lv, i) => !!(S.lessons[lv + '-' + (i + 1)] && S.lessons[lv + '-' + (i + 1)].done);
const nextLessonIdx = lv => { const n = LV[lv].lessons.length; for (let i = 0; i < n; i++) if (!lessonDone(lv, i)) return i; return n; };
const unlocked = (lv, i) => i === 0 || lessonDone(lv, i - 1) || lessonDone(lv, i);
const learnedIn = lv => learnedIds().filter(id => W[id].level === lv).length;
function nextDueText() {
  const ds = learnedIds().map(id => S.words[id].due).filter(Boolean).sort((a, b) => a - b);
  if (!ds.length) return '';
  const days = Math.max(1, Math.ceil((ds[0] - Date.now()) / DAY));
  return days === 1 ? 'مرور بعدی: فردا' : 'مرور بعدی: ' + FA(days) + ' روز دیگه';
}
// meanings overlap -> never offer as distractor
const toks = fa => fa.replace(/\(.*?\)/g, '').split(/[،؛,]/).map(s => s.trim()).filter(Boolean);
const clash = (a, b) => { const ta = toks(W[a].fa), tb = toks(W[b].fa); return W[a].fa === W[b].fa || ta.some(t => tb.includes(t)) || W[a].w.toLowerCase() === W[b].w.toLowerCase(); };

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
const A = id => 'audio/' + id + '.mp3', AX = id => 'audio/' + id + '-ex.mp3', IMG = id => 'img/' + id + '.webp';
const vibrate = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
function prefetchLesson(ids) { // cache a lesson's files on demand (service worker stores them)
  ids.forEach(id => { [A(id), AX(id)].concat(W[id].img ? [IMG(id)] : []).forEach(u => fetch(u).catch(() => {})); });
}

/* ---------- helpers ---------- */
function screen(html) { clearTimers(); $app.innerHTML = '<div class="screen">' + html + '</div>'; }
function bindX(fn) { const x = $app.querySelector('.x'); if (x) x.onclick = fn; }
const exHtml = w => { const re = new RegExp('\\b(' + w.w.replace(/[^A-Za-z ]/g, '.').split(' ')[0].slice(0, Math.max(3, w.w.length - 2)) + '[a-z]*)', 'i'); return esc(w.ex).replace(re, '<mark>$1</mark>'); };
const lvName = lv => (LEVELS.find(l => l[0] === lv) || [lv, ''])[1];
const tag = lv => `<span class="lvtag ${lv}">${lv}</span>`;

/* ---------- home ---------- */
function home() {
  stopAudio();
  const learned = learnedIds().length, due = dueIds().length, hard = hardIds().length;
  const rec = S.placement && S.placement.level;
  screen(`
    <div class="home-head"><div class="logo">۳۰۰۰ لغت<small>انگلیسی آمریکایی · Oxford 3000</small></div>
      <div class="hd-r"><button class="inst pwa-install" data-install title="نصب اپ روی گوشی یا کامپیوتر">📲 نصب اپ</button><div class="streak" title="روزهای پشت سر هم">🔥 ${FA(streakNow())}</div></div></div>
    <div class="prog"><div class="row"><span>پیشرفت کل</span><b>${FA(learned)} / ${FA(TOTAL)} لغت</b></div>
      <div class="bar"><i style="width:${Math.max(learned / TOTAL * 100, learned ? 1 : 0)}%"></i></div></div>
    <div class="levels">${LEVELS.map(([lv, nm]) => { const L = LV[lv]; const n = L ? L.count : 0, done = L ? learnedIn(lv) : 0, ok = L && L.available;
      return `<button class="lvl ${lv} ${rec === lv ? 'rec' : ''} ${ok ? '' : 'soon'}" data-lv="${lv}">
        <div class="lt"><span class="code">${lv}</span><span class="nm">${nm}${rec === lv ? '<br>⭐ پیشنهاد' : ''}</span></div>
        <div><div class="meta"><span>${ok ? FA(L.lessons.length) + ' درس' : 'به‌زودی'}</span><span>${FA(done)}/${FA(n)}</span></div>
        <div class="bar"><i style="width:${n ? Math.max(done / n * 100, done ? 2 : 0) : 0}%"></i></div></div></button>`; }).join('')}</div>
    <div class="tools">
      <button class="tool ${due ? 'due' : ''}" id="tReview"><span class="badge">${FA(due)}</span><span class="ic">🔁</span><b>مرور امروز</b></button>
      <button class="tool" id="tHard"><span class="badge">${FA(hard)}</span><span class="ic">💪</span><b>لغت‌های سخت</b></button>
      <button class="tool" id="tQuick"><span class="ic">⚡</span><b>مرور ۶۰ ثانیه</b></button>
    </div>
    <button class="place" id="tPlace">🎯 آزمون تعیین سطح${rec ? ' · نتیجه: <span class="en">' + rec + '</span>' : ' (۲ دقیقه)'}</button>
    ${DEBUG ? `<div class="dbg"><button id="dDue">debug: due now</button><button id="dLearn">debug: learn A1-1..3</button><button id="dReset">debug: reset</button></div>` : ''}`);
  $app.querySelectorAll('.lvl').forEach(b => b.onclick = () => { const lv = b.dataset.lv; if (LV[lv] && LV[lv].available) levelScreen(lv); });
  document.getElementById('tReview').onclick = reviewScreen;
  document.getElementById('tHard').onclick = hardScreen;
  document.getElementById('tQuick').onclick = quickIntro;
  document.getElementById('tPlace').onclick = placementIntro;
  if (DEBUG) {
    document.getElementById('dDue').onclick = () => { learnedIds().forEach(id => { if (!S.words[id].mastered) S.words[id].due = Date.now() - 1000; }); save(); home(); };
    document.getElementById('dLearn').onclick = () => { [0, 1, 2].forEach(i => finishLessonState(lessonObj('A1', i))); home(); };
    document.getElementById('dReset').onclick = () => { localStorage.removeItem(KEY); location.reload(); };
  }
}

/* ---------- level: lesson list (paged grid, no scrolling) ---------- */
function levelScreen(lv, page) {
  stopAudio();
  const L = LV[lv], n = L.lessons.length, pages = Math.ceil(n / PER_PAGE), cur = nextLessonIdx(lv);
  if (page == null) page = Math.min(pages - 1, Math.floor(Math.min(cur, n - 1) / PER_PAGE));
  const from = page * PER_PAGE, to = Math.min(n, from + PER_PAGE);
  let cells = '';
  for (let i = from; i < to; i++) {
    const d = lessonDone(lv, i), u = unlocked(lv, i), c = i === cur;
    cells += `<button class="ls ${d ? 'done' : c ? 'cur' : u ? '' : 'lock'}" data-i="${i}" ${u ? '' : 'aria-disabled="true"'}>${d ? '✓' : u ? FA(i + 1) : '🔒'}<small>${d || !u ? 'درس ' + FA(i + 1) : c ? 'شروع' : ''}</small></button>`;
  }
  for (let i = to; i < from + PER_PAGE; i++) cells += '<span></span>';
  screen(`<div class="top"><button class="x" aria-label="بازگشت">✕</button><div class="h2">${tag(lv)} ${lvName(lv)}</div><span class="pill">${FA(Math.min(cur, n))}/${FA(n)} درس</span></div>
    <div class="lgrid">${cells}</div>
    <div class="pager"><button id="pPrev" ${page > 0 ? '' : 'disabled'}>›</button><span>صفحه ${FA(page + 1)} از ${FA(pages)}</span><button id="pNext" ${page < pages - 1 ? '' : 'disabled'}>‹</button></div>`);
  bindX(home);
  document.getElementById('pPrev').onclick = () => levelScreen(lv, page - 1);
  document.getElementById('pNext').onclick = () => levelScreen(lv, page + 1);
  $app.querySelectorAll('.ls[data-i]').forEach(b => b.onclick = () => {
    const i = +b.dataset.i;
    if (!unlocked(lv, i)) { b.classList.add('shake'); vibrate(60); later(() => b.classList.remove('shake'), 400); return; }
    startLesson(lessonObj(lv, i));
  });
}
const lessonObj = (lv, i) => ({ id: lv + '-' + (i + 1), lv, i, title: lv + ' · درس ' + FA(i + 1), words: LV[lv].lessons[i].map(id => W[id]) });

/* ---------- learning phase ---------- */
function startLesson(L) {
  const base = L.words; prefetchLesson(base.map(w => w.id));
  const notAfter = (arr, prev) => { let r = shuffle(arr), k = 0; while (base.length > 1 && r[0].id === prev.id && k++ < 20) r = shuffle(arr); return r; };
  const r2 = notAfter(base, base[base.length - 1]), r3 = notAfter(base, r2[r2.length - 1]);
  learnCard({ L, seq: base.concat(r2, r3), i: 0, t0: Date.now() });
}
function learnCard(run) {
  const w = run.seq[run.i], n = run.seq.length, per = run.L.words.length, round = Math.floor(run.i / per) + 1, last = run.i === n - 1;
  screen(`
    <div class="top"><button class="x" aria-label="خروج">✕</button><div class="bar"><i style="width:${(run.i + 1) / n * 100}%"></i></div><span class="pill">${FA(run.i + 1)}/${FA(n)}</span></div>
    <div class="card ${w.img ? '' : 'noimg'}">
      <div class="pic">${w.img ? `<img src="${IMG(w.id)}" alt="">` : ''}</div>
      <div class="word en"${fitW(w.w)}>${esc(w.w)}</div>
      <div class="fa">${esc(w.fa)}</div>
      <div class="ex en">${exHtml(w)}</div>
      <button class="spk" id="spk" aria-label="پخش دوباره">🔊</button>
    </div>
    <div class="round">${tag(run.L.lv)} درس ${FA(run.L.i + 1)} · دور ${FA(round)} از ۳ ${round === 1 ? '· به ترتیب' : '· تصادفی'}</div>
    <button class="btn" id="next">${last ? 'شروع آزمون ✓' : 'بعدی ←'}</button>`);
  bindX(() => { if (confirm('از درس خارج می‌شی؟ پیشرفت این درس ذخیره نمی‌شه.')) levelScreen(run.L.lv); });
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
  targetIds.forEach(id => { const w = W[id]; LV[w.level].lessons[w.li].forEach(x => set.add(x)); });
  return [...set];
}
function makeOptions(id, pool) {
  let cand = shuffle(pool.filter(x => x !== id && W[x] && !clash(x, id)));
  const opts = [];
  for (const x of cand) { if (opts.length === 3) break; if (!opts.some(o => clash(o, x))) opts.push(x); }
  if (opts.length < 3) { // top up from the same level
    for (const x of shuffle(Object.keys(W).filter(k => W[k].level === W[id].level))) { if (opts.length === 3) break; if (x !== id && !clash(x, id) && !opts.some(o => o === x || clash(o, x))) opts.push(x); }
  }
  return shuffle([id].concat(opts));
}
/* o: {mode, targets, need, pool, onAnswer, onDone, deadline, next(st)->{id,type}|null, noMiss, label, onQuit} */
function runQuiz(o) {
  const st = { correct: {}, wrong: 0, right: 0, asked: 0, last: null, t0: Date.now(), firstTry: {} };
  (o.targets || []).forEach(id => st.correct[id] = 0);
  const total = (o.targets || []).length * (o.need || 0);
  let q = null, locked = false;
  const progress = () => o.targets.reduce((s, id) => s + Math.min(st.correct[id], o.need), 0);
  function defaultNext() {
    let active = o.mode === 'quick' ? o.targets.slice() : o.targets.filter(id => st.correct[id] < o.need);
    if (!active.length) return null;
    const cand = active.length > 1 ? active.filter(id => id !== st.last) : active;
    return { id: pick(cand), type: pickType() };
  }
  function nextQ() {
    if (o.deadline && Date.now() >= o.deadline) return o.onDone(st);
    const nx = (o.next || defaultNext)(st);
    if (!nx) return o.onDone(st);
    const optIds = makeOptions(nx.id, o.pool || distractorPool([nx.id]));
    q = { id: nx.id, type: nx.type, optIds, correctIdx: optIds.indexOf(nx.id), limit: nx.type === 'listen' ? 7000 : 5000 };
    st.last = nx.id; st.asked++; locked = false;
    render();
  }
  function render() {
    const w = W[q.id], showFa = q.type !== 'fa2en';
    const label = { en2fa: 'معنی این لغت چیه؟', fa2en: 'انگلیسیِ این کلمه کدومه؟', listen: 'گوش کن و معنی رو انتخاب کن' }[q.type];
    let head;
    if (o.mode === 'quick') head = `<div class="h2">⚡ امتیاز: <span id="score">${FA(st.right)}</span></div><span class="clock" id="clock"></span>`;
    else if (o.mode === 'placement') head = `<div class="h2">🎯 تعیین سطح ${tag(w.level)}</div><span class="pill">${FA(st.asked)}</span>`;
    else head = `<div class="bar"><i style="width:${progress() / total * 100}%"></i></div><span class="pill">${FA(progress())}/${FA(total)} درست</span>`;
    let mid;
    if (q.type === 'en2fa') mid = `<div class="qword en"${fitW(w.w)}>${esc(w.w)}</div>`;
    else if (q.type === 'fa2en') mid = `<div class="qword fa"${fitFa(w.fa)}>${esc(w.fa)}</div>`;
    else mid = `<button class="spk big" id="spk" aria-label="پخش دوباره">🔊</button>`;
    screen(`
      <div class="top"><button class="x" aria-label="خروج">✕</button>${head}</div>
      <div class="timer"><i id="tbar"></i></div>
      <div class="prompt" id="prompt" data-type="${q.type}"><div class="qlabel">${label}</div>${mid}</div>
      <div class="opts">${q.optIds.map((oid, i) => `<button class="opt ${showFa ? '' : 'en'}" data-i="${i}"${showFa ? '' : fitO(W[oid].w)}>${esc(showFa ? W[oid].fa : W[oid].w)}</button>`).join('')}</div>`);
    bindX(() => { stopAudio(); clearTimers(); (o.onQuit || home)(); });
    $app.querySelectorAll('.opt').forEach(b => b.onclick = () => answer(+b.dataset.i));
    const spk = document.getElementById('spk'); if (spk) spk.onclick = () => playSeq([A(w.id)]);
    if (q.type !== 'fa2en') playSeq([A(w.id)]); else stopAudio();
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
    $app.querySelectorAll('.opt').forEach((b, k) => { b.disabled = true; if (k === q.correctIdx) b.classList.add('ok'); else if (k === i) b.classList.add('bad'); else b.classList.add('dim'); });
    const tb = document.getElementById('tbar'); if (tb) { const cs = getComputedStyle(tb), m = cs.transform, bg = cs.backgroundColor; tb.style.transition = 'none'; tb.style.transform = m; tb.style.background = bg; }
    const first = !Object.prototype.hasOwnProperty.call(st.firstTry, q.id); if (first) st.firstTry[q.id] = ok;
    if (ok) { st.correct[q.id] = (st.correct[q.id] || 0) + 1; st.right++; }
    else { st.wrong++; if (!o.noMiss) { ws(q.id).miss = (ws(q.id).miss || 0) + 1; save(); } vibrate(timeout ? [80, 60, 80] : 200); const p = document.getElementById('prompt'); p && p.classList.add('shake'); }
    o.onAnswer && o.onAnswer(q.id, ok, first);
    const prompt = document.getElementById('prompt');
    if (prompt) prompt.insertAdjacentHTML('beforeend', `<div class="fb ${ok ? 'ok' : 'bad'}">${ok ? '✓ آفرین! ' : (timeout ? '⏱ وقت تموم شد — ' : '✗ ')}<span class="en">${esc(w.w)}</span> = ${esc(w.fa)}</div>`);
    if (o.mode === 'quick') { const sc = document.getElementById('score'); if (sc) sc.textContent = FA(st.right); }
    playSeq([ok ? 'audio/sfx-correct.mp3' : 'audio/sfx-wrong.mp3', A(w.id)]);
    if (timeUp) return later(() => o.onDone(st), 900);
    later(nextQ, (o.mode === 'quick' || o.mode === 'placement') ? (ok ? 750 : 1300) : (ok ? 1150 : 1700));
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
  runQuiz({ mode: 'lesson', targets: ids, need: NEED, pool: ids, onQuit: () => levelScreen(run.L.lv), onDone: st => {
    finishLessonState(run.L);
    const acc = Math.round(st.right / Math.max(1, st.right + st.wrong) * 100);
    const mins = Math.max(1, Math.round((Date.now() - run.t0) / 60000));
    const lv = run.L.lv, ni = run.L.i + 1, hasNext = ni < LV[lv].lessons.length;
    doneScreen('🎉', `${esc(run.L.title)} تمام شد!`, 'این لغت‌ها فردا، ۳ روز، ۷ روز و ۲۱ روز بعد برای مرور برمی‌گردن تا برای همیشه تو ذهنت بمونن.',
      [[FA(acc) + '٪', 'دقت'], [FA(st.wrong), 'اشتباه'], [FA(mins), 'دقیقه']], ids,
      hasNext ? ['درس بعدی ←', () => startLesson(lessonObj(lv, ni))] : null, () => levelScreen(lv));
  }});
}
function doneScreen(icon, title, text, stats, chips, extraBtn, back) {
  stopAudio();
  screen(`<div class="done"><div class="big">${icon}</div><h1>${title}</h1><p>${text}</p>
    ${stats ? `<div class="stats">${stats.map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('')}</div>` : ''}
    ${chips && chips.length ? `<div class="chips">${chips.slice(0, 12).map(id => `<span class="chip"><span class="en">${esc(W[id].w)}</span> · ${esc(W[id].fa)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="btns">${extraBtn ? `<button class="btn" id="extra">${extraBtn[0]}</button>` : ''}<button class="btn ${extraBtn ? 'ghost' : ''}" id="home">${back ? 'بازگشت به لیست درس‌ها' : 'بازگشت به خانه'}</button></div>`);
  document.getElementById('home').onclick = back || home;
  if (extraBtn) document.getElementById('extra').onclick = extraBtn[1];
  touchStreak();
}

/* ---------- spaced review ---------- */
function emptyScreen(title, icon, text) {
  screen(`<div class="top"><button class="x">✕</button><div class="h2">${title}</div></div>
    <div class="empty"><div class="big">${icon}</div><div>${text}</div></div><button class="btn" id="home">بازگشت</button>`);
  bindX(home); document.getElementById('home').onclick = home;
}
function reviewScreen() {
  stopAudio();
  const due = dueIds();
  if (!due.length) return emptyScreen('🔁 مرور امروز', '🌙', learnedIds().length ? 'امروز مروری نداری، عالیه!<br>' + nextDueText() : 'اول یه درس رو تموم کن،<br>بعد لغت‌ها اینجا برای مرور برمی‌گردن.');
  const batch = due.slice(0, 30);
  screen(`<div class="top"><button class="x">✕</button><div class="h2">🔁 مرور امروز</div><span class="pill">${FA(due.length)} لغت</span></div>
    <div class="empty" style="justify-content:flex-start;gap:1.6dvh"><div>این لغت‌ها امروز باید مرور بشن${due.length > 30 ? ' (۳۰ تای اول)' : ''}:</div>
    <div class="chips" style="max-height:none">${batch.slice(0, 18).map(id => `<span class="chip"><span class="en">${esc(W[id].w)}</span></span>`).join('')}${batch.length > 18 ? '<span class="chip">…</span>' : ''}</div></div>
    <button class="btn" id="go">شروع مرور</button>`);
  bindX(home);
  document.getElementById('go').onclick = () => {
    prefetchLesson(batch);
    runQuiz({ mode: 'review', targets: batch, need: 1, pool: distractorPool(batch),
      onAnswer: (id, ok, first) => { if (!first) return; const s = ws(id);
        if (ok) { s.stage = (s.stage || 0) + 1; if (s.stage >= INTERVALS.length) { s.mastered = true; s.due = null; } else s.due = Date.now() + INTERVALS[s.stage] * DAY; }
        else { s.stage = 0; s.due = Date.now() + INTERVALS[0] * DAY; }
        save(); },
      onDone: st => { const good = Object.values(st.firstTry).filter(Boolean).length;
        doneScreen('✅', 'مرور تمام شد!', 'لغت‌هایی که درست زدی دیرتر برمی‌گردن، و اونایی که اشتباه زدی فردا دوباره میان.', [[FA(good), 'بار اول درست'], [FA(batch.length - good), 'نیاز به تمرین']], batch); } });
  };
}

/* ---------- hard words ---------- */
function hardScreen() {
  stopAudio();
  const hard = hardIds();
  if (!hard.length) return emptyScreen('💪 لغت‌های سخت من', '🏆', 'هنوز لغت سختی نداری.<br>هر لغتی که ۲ بار یا بیشتر اشتباه بزنی، اینجا میاد تا بیشتر تمرینش کنی.');
  const batch = hard.slice(0, 12);
  screen(`<div class="top"><button class="x">✕</button><div class="h2">💪 لغت‌های سخت من</div><span class="pill">${FA(hard.length)}</span></div>
    <div class="hl">${batch.map(id => `<div class="hw"><div><div class="en">${esc(W[id].w)}</div><span>${esc(W[id].fa)}</span></div><small>✗${FA(S.words[id].miss)}</small></div>`).join('')}</div>
    <button class="btn" id="go">تمرین لغت‌های سخت</button>`);
  bindX(home);
  document.getElementById('go').onclick = () => {
    prefetchLesson(batch);
    runQuiz({ mode: 'hard', targets: batch, need: 2, pool: distractorPool(batch),
      onAnswer: (id, ok) => { if (ok) { const s = ws(id); s.miss = Math.max(0, (s.miss || 0) - 1); save(); } },
      onDone: st => doneScreen('💪', 'تمرین تمام شد!', 'هر جواب درست، لغت رو یه قدم از لیست سخت‌ها دورتر می‌کنه.', [[FA(st.right), 'درست'], [FA(st.wrong), 'اشتباه'], [FA(hardIds().length), 'هنوز سخت']], null, ['دوباره تمرین کن', hardScreen]) });
  };
}

/* ---------- 60-second quick review ---------- */
function quickIntro() {
  stopAudio();
  const ids = learnedIds();
  if (ids.length < 4) return emptyScreen('⚡ مرور سریع', '⚡', 'اول یه درس رو تموم کن،<br>بعد اینجا در ۶۰ ثانیه هر چند تا لغت که بتونی جواب می‌دی.');
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

/* ---------- placement test (stepwise, ~2 min, does NOT mark words learned) ---------- */
const PQ = 8, PASS = 6;
function placementIntro(first) {
  stopAudio();
  screen(`<div class="top">${first ? '' : '<button class="x">✕</button>'}<div class="h2">🎯 آزمون تعیین سطح</div>${first ? '<button class="inst pwa-install" data-install>📲 نصب اپ</button>' : ''}</div>
    <div class="empty"><div class="big">🎯</div><div>${first ? 'خوش اومدی! 👋<br>' : ''}حدود ۲ دقیقه.<br>لغت انگلیسی میاد، معنی فارسی رو انتخاب کن.<br>از A1 شروع می‌شه و اگه خوب جواب بدی، می‌ره سطح بالاتر.</div></div>
    <div class="btns"><button class="btn" id="go">شروع آزمون</button><button class="btn ghost" id="skip">${first ? 'رد کردن، خودم سطح رو انتخاب می‌کنم' : 'بازگشت'}</button></div>`);
  bindX(home);
  document.getElementById('skip').onclick = () => { S.onboarded = true; save(); home(); };
  document.getElementById('go').onclick = () => { S.onboarded = true; save(); runPlacement(); };
}
function runPlacement() {
  const avail = LEVELS.map(l => l[0]).filter(lv => LV[lv] && LV[lv].available);
  const per = {}; avail.forEach(lv => per[lv] = { asked: 0, right: 0, ids: shuffle(Object.keys(W).filter(id => W[id].level === lv)).slice(0, PQ) });
  let li = 0, lastId = null, result = null;
  runQuiz({ mode: 'placement', noMiss: true, pool: [],
    next: st => {
      if (lastId) { const lv = avail[li]; per[lv].asked++; if (st.firstTry[lastId]) per[lv].right++;
        const p = per[lv], left = PQ - p.asked;
        if (p.right >= PASS || p.right + left < PASS || left === 0) {
          if (p.right >= PASS && li < avail.length - 1) li++;
          else { result = p.right >= PASS ? avail[li] : avail[li]; return null; }
        } }
      const lv = avail[li], id = per[lv].ids[per[lv].asked]; lastId = id;
      return { id, type: 'en2fa' };
    },
    onDone: () => {
      const rec = result || avail[li];
      S.placement = { level: rec, at: Date.now(), scores: Object.fromEntries(avail.map(lv => [lv, [per[lv].right, per[lv].asked]])) }; save();
      stopAudio();
      screen(`<div class="done"><div class="big">🎯</div><h1>سطح پیشنهادی: <span class="lvtag ${rec}" style="font-size:1em">${rec}</span></h1>
        <p>${lvName(rec)} — از این سطح شروع کن.<br>سطح‌ها قفل نیستن؛ هر وقت خواستی می‌تونی سطح دیگه‌ای رو انتخاب کنی.</p>
        <div class="stats">${avail.filter(lv => per[lv].asked).map(lv => `<div class="stat"><b>${FA(per[lv].right)}/${FA(per[lv].asked)}</b><span class="en">${lv}</span></div>`).join('')}</div></div>
        <div class="btns"><button class="btn" id="goLv">برو به سطح ${rec} ←</button><button class="btn ghost" id="home">بازگشت به خانه</button></div>`);
      document.getElementById('goLv').onclick = () => levelScreen(rec);
      document.getElementById('home').onclick = home;
    } });
}

/* ---------- boot ---------- */
window.__app = { get S() { return S; }, W, LV, home, DEBUG, levelScreen, lessonObj,
  cardFor: id => { const w = W[id]; learnCard({ L: lessonObj(w.level, w.li), seq: [w], i: 0, t0: 0 }); stopAudio(); },
  quizFor: (id, type) => { let n = 0; runQuiz({ mode: 'lesson', targets: [id], need: 1, pool: LV[W[id].level].lessons[W[id].li], next: () => n++ ? null : { id, type }, onDone: () => {} }); stopAudio(); clearTimers(); } };
fetch('data/index.json').then(r => r.json()).then(ix => {
  TOTAL = ix.total;
  ix.levels.forEach(l => LV[l.id] = { id: l.id, count: l.count, available: false, lessons: [] });
  return Promise.all(ix.levels.filter(l => l.available).map(l => fetch('data/' + l.id + '.json?v=' + ix.version).then(r => r.json()).then(d => {
    const L = LV[l.id]; L.available = true; L.lessons = d.lessons.map((ls, li) => ls.map(([id, w, fa, ex, img]) => { W[id] = { id, w, fa, ex, img: !!img, level: l.id, li }; return id; }));
  })));
}).then(() => { window.__app.ready = true; if (!S.onboarded && !learnedIds().length) placementIntro(true); else { S.onboarded = true; save(); home(); } })
  .catch(e => { $app.innerHTML = '<div class="empty">خطا در بارگذاری. اینترنت رو چک کن و دوباره باز کن.</div>'; console.error(e); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
})();
