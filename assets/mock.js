/* CELPIP LS full Speaking mock. Recordings stay in memory; ratings + used prompts in localStorage. Nothing is uploaded. */
(function () {
  'use strict';
  var root = document.getElementById('mock'); if (!root) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function L(en, zh) { return '<span class="inl"><span class="en">' + en + '</span><span class="zh">' + zh + '</span></span>'; }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function node(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  var D = JSON.parse($('#mock-data').textContent), T = D.tasks;
  var scale = parseFloat((location.search.match(/[?&]ts=([0-9.]+)/) || [])[1]) || 1;   // test hook only
  var GAP = 5;  // seconds between tasks
  var startBox = $('.mk-start', root), runBox = $('.mk-run', root), revBox = $('.mk-review', root);
  var prog = $('.mk-prog', root), steps = $('.mk-steps', root), card = $('.mk-card', root), timer = $('.pr-timer', root);
  var phaseEl = $('.pr-phase', root), clockEl = $('.pr-clock', root), barEl = $('.pr-bar i', root), meter = $('.pr-meter i', root), msg = $('.mk-msg', root);
  var NAMES = { choose: L('Part 1 · choose an option (no speaking)', '第 1 部分 · 选一个方案（不说话）'), prep: L('Preparation time', '准备时间'), speak: L('Speaking time · recording', '说话时间 · 正在录音'), gap: L('Next task coming up', '下一个任务马上开始') };
  var stream = null, an = null, actx = null, rec = null, chunks = [], raf = 0, tick = null;
  var plan = [], ti = 0, si = 0, endAt = 0, len = 0, results = [], live = false;

  function loadJ(k, d) { try { return JSON.parse(get(k) || '') || d; } catch (e) { return d; } }
  function fmt(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function beep(f, ms, n) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)(); var t0 = actx.currentTime;
      for (var k = 0; k < (n || 1); k++) { var o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = f; o.connect(g); g.connect(actx.destination); var s = t0 + k * (ms / 1000 + .08); g.gain.setValueAtTime(.0001, s); g.gain.exponentialRampToValueAtTime(.25, s + .01); g.gain.exponentialRampToValueAtTime(.0001, s + ms / 1000); o.start(s); o.stop(s + ms / 1000 + .02); }
    } catch (e) { }
  }
  function pickMime() {
    if (!window.MediaRecorder) return '';
    var c = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    for (var i = 0; i < c.length; i++) { try { if (MediaRecorder.isTypeSupported(c[i])) return c[i]; } catch (e) { } }
    return '';
  }

  /* pick one prompt per task, unused-in-earlier-mocks first */
  function choose() {
    var used = loadJ('celpip.mockused', {});
    return T.map(function (t) {
      var u = used[t.n] || [], free = [];
      for (var i = 0; i < t.prompts.length; i++) if (u.indexOf(i) < 0) free.push(i);
      if (!free.length) { free = t.prompts.map(function (_, i) { return i; }); used[t.n] = []; }
      return free[Math.floor(Math.random() * free.length)];
    });
  }

  /* past mocks */
  function history() {
    var H = loadJ('celpip.mock', []), box = $('.mk-hist');
    var past = $('.mk-past', root);
    if (past) past.innerHTML = H.length ? L('You have saved ' + H.length + ' mock(s) in this browser. The newest is at the top of "Your mock history" below.', '你在本浏览器已保存 ' + H.length + ' 次模考，记录见下方「历次模考记录」。') : '';
    if (!box) return;
    if (!H.length) { box.innerHTML = '<p>' + L('No mock saved yet.', '还没有保存过模考。') + '</p>'; return; }
    var head = '<tr><th>' + L('Date', '日期') + '</th>' + T.map(function (t) { return '<th>T' + t.n + '</th>'; }).join('') + '<th>' + L('Total', '合计') + '</th></tr>';
    var rows = H.slice().reverse().map(function (m) {
      var tot = 0, cells = T.map(function (t) { var r = m.s[t.n]; if (!r) return '<td>–</td>'; var s = r.reduce(function (a, b) { return a + b; }, 0); tot += s; return '<td>' + s + '</td>'; }).join('');
      return '<tr><td>' + m.d + '</td>' + cells + '<td><b>' + tot + '</b>/64</td></tr>';
    }).join('');
    box.innerHTML = '<div class="tbl"><table class="mk-htab"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* run */
  function start() {
    plan = choose(); results = []; ti = 0; live = true;
    startBox.hidden = true; revBox.hidden = true; runBox.hidden = false; msg.innerHTML = '';
    steps.innerHTML = T.map(function (t) { return '<i data-n="' + t.n + '">' + t.n + '</i>'; }).join('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      msg.innerHTML = '<div class="note">' + L('This browser cannot record. The timers still run; say every answer out loud.', '这个浏览器不能录音。计时照常进行，每题请大声说出来。') + '</div>'; return task();
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
      stream = s;
      try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); var src = actx.createMediaStreamSource(s); an = actx.createAnalyser(); an.fftSize = 512; src.connect(an); } catch (e) { an = null; }
      task();
    }).catch(function () {
      msg.innerHTML = '<div class="note">' + L('Microphone blocked, so nothing will be recorded. The timers still run.', '麦克风被拦住了，不会录音，计时照常进行。') + '</div>'; task();
    });
  }
  function task() {
    if (!live) return;
    if (ti >= T.length) return finish();
    var t = T[ti], p = t.prompts[plan[ti]];
    results[ti] = { n: t.n, i: plan[ti], blob: null };
    prog.innerHTML = L('Task ' + t.n + ' of 8 · ' + t.en, '第 ' + t.n + ' 个任务 / 共 8 个 · ' + t.zh);
    $$('i', steps).forEach(function (x, j) { x.className = j < ti ? 'done' : j === ti ? 'now' : ''; });
    card.innerHTML = (p.scene ? '<div class="scene" aria-hidden="true">' + p.scene + '</div>' : '') + '<div class="t">' + p.q + '</div>' + (p.zh ? '<div class="pr-gloss zh tr">' + p.zh + '</div>' : '');
    si = -1; stage();
  }
  function stage() {
    if (!live) return;
    var st = T[ti].stages; si++;
    if (si >= st.length) { ti++; return ti >= T.length ? finish() : gap(); }
    var s = st[si];
    phaseEl.innerHTML = NAMES[s.k]; timer.className = 'pr-timer on' + (s.rec ? ' speak' : '');
    len = s.s * 1000 * scale; endAt = Date.now() + len;
    if (s.rec) { beep(880, 160, 2); recStart(); } else beep(520, 140, 1);
    clearInterval(tick); tick = setInterval(function () { upd(function () { if (s.rec) recStop(stage); else stage(); }); }, 200);
  }
  function gap() {
    phaseEl.innerHTML = NAMES.gap; timer.className = 'pr-timer on';
    card.innerHTML = '<div class="t"><b>' + L('Next: Task ' + T[ti].n + ' · ' + T[ti].en, '下一个：任务 ' + T[ti].n + ' · ' + T[ti].zh) + '</b></div>';
    len = GAP * 1000 * scale; endAt = Date.now() + len;
    clearInterval(tick); tick = setInterval(function () { upd(task); }, 200);
  }
  function upd(cb) {
    var left = (endAt - Date.now()) / 1000 / scale, tot = len / 1000 / scale;
    clockEl.textContent = fmt(left); barEl.style.width = Math.min(100, 100 - left / tot * 100) + '%';
    if (Date.now() >= endAt) { clearInterval(tick); cb(); }
  }
  function recStart() {
    chunks = []; rec = null; if (!stream) return;
    try { var m = pickMime(); rec = m ? new MediaRecorder(stream, { mimeType: m }) : new MediaRecorder(stream); } catch (e) { rec = null; return; }
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.start(250);
    cancelAnimationFrame(raf);
    if (an && meter) { var buf = new Uint8Array(an.fftSize); (function loop() { an.getByteTimeDomainData(buf); var mx = 0; for (var i = 0; i < buf.length; i++) mx = Math.max(mx, Math.abs(buf[i] - 128)); meter.style.width = Math.min(100, mx / 80 * 100) + '%'; raf = requestAnimationFrame(loop); })(); }
  }
  function recStop(cb) {
    cancelAnimationFrame(raf); if (meter) meter.style.width = '0';
    var r = results[ti];
    var keep = function () { if (chunks.length && r) r.blob = new Blob(chunks, { type: (rec && rec.mimeType) || 'audio/webm' }); cb(); };
    if (!rec || rec.state === 'inactive') return keep();
    rec.onstop = keep; try { rec.stop(); } catch (e) { keep(); }
  }
  function endNow() {
    if (!live) return; clearInterval(tick);
    var s = T[ti] && T[ti].stages[si];
    if (s && s.rec) recStop(finish); else finish();
  }
  function finish() {
    if (!live) return; live = false; clearInterval(tick); beep(440, 220, 1);
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } an = null;
    var used = loadJ('celpip.mockused', {});
    results.forEach(function (r) { if (!r) return; used[r.n] = (used[r.n] || []).filter(function (x) { return x !== r.i; }).concat([r.i]); });
    put('celpip.mockused', JSON.stringify(used));
    runBox.hidden = true; review();
  }

  /* review */
  function review() {
    var ol = $('.mk-list', root); ol.textContent = '';
    results.forEach(function (r, j) {
      if (!r) return;
      var t = T[j], p = t.prompts[r.i], li = node('li', 'mk-item'); li.setAttribute('data-n', t.n);
      li.innerHTML = '<h4>' + L('Task ' + t.n + ' · ' + t.en, '任务 ' + t.n + ' · ' + t.zh) + ' <a class="mk-go" href="speaking-' + t.n + '.html">' + L('practice page', '练习页') + ' →</a></h4>' +
        '<div class="pr-card">' + (p.scene ? '<div class="scene" aria-hidden="true">' + p.scene + '</div>' : '') + '<div class="t">' + p.q + '</div>' + (p.zh ? '<div class="pr-gloss zh tr">' + p.zh + '</div>' : '') + '</div>';
      if (r.blob) {
        var url = URL.createObjectURL(r.blob), au = node('audio'); au.controls = true; au.src = url; li.appendChild(au);
        var a = node('a', 'mk-dl'); a.href = url; a.download = 'celpip-mock-task' + t.n + '.' + (/mp4/.test(r.blob.type) ? 'm4a' : /ogg/.test(r.blob.type) ? 'ogg' : 'webm'); a.innerHTML = L('Save to my device', '存到我的设备');
        var pp = node('p'); pp.appendChild(a); li.appendChild(pp);
      } else { var nn = node('p', 'mk-none'); nn.innerHTML = L('No recording for this task.', '这个任务没有录音。'); li.appendChild(nn); }
      var det = node('details', 'mk-ref'); det.innerHTML = '<summary>' + L('Reference answer for this prompt', '这道题的参考答案') + ' · ' + p.w + ' words</summary>';
      var ans = node('div', 'pr-ans t'); p.a.forEach(function (x) { ans.appendChild(node('p', '', x)); }); det.appendChild(ans);
      var ul = node('ul', 'why'); p.z.forEach(function (x) { var li = node('li', 'bi'); li.appendChild(node('span', 'zh', x[0])); li.appendChild(node('span', 'en', x[1])); ul.appendChild(li); }); det.appendChild(ul);
      li.appendChild(det);
      var g = node('div', 'mk-rate');
      D.crit.forEach(function (c, k) {
        var row = node('div', 'mk-row'); row.innerHTML = '<span class="mk-c">' + L(c[0], c[1]) + '</span>';
        [['✗', 0], ['～', 1], ['✓', 2]].forEach(function (o) {
          var b = node('button', 'mk-b', o[0]); b.type = 'button'; b.setAttribute('aria-pressed', 'false'); b.setAttribute('data-k', k); b.setAttribute('data-v', o[1]);
          b.setAttribute('aria-label', c[0] + ': ' + ['weak', 'okay', 'good'][o[1]]);
          b.addEventListener('click', function () { $$('.mk-b[data-k="' + k + '"]', li).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); summary(); });
          row.appendChild(b);
        });
        g.appendChild(row);
      });
      li.appendChild(g); ol.appendChild(li);
    });
    $('.mk-saved', root).textContent = ''; revBox.hidden = false; summary();
    revBox.scrollIntoView && revBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function scores() {
    var out = {};
    $$('.mk-item', root).forEach(function (li) {
      var n = li.getAttribute('data-n'), arr = [], all = true;
      for (var k = 0; k < D.crit.length; k++) { var b = $('.mk-b[data-k="' + k + '"][aria-pressed="true"]', li); if (b) arr.push(+b.getAttribute('data-v')); else all = false; }
      out[n] = all ? arr : null;
    });
    return out;
  }
  function summary() {
    var s = scores(), rated = Object.keys(s).filter(function (n) { return s[n]; }), box = $('.mk-sum', root);
    if (!rated.length) { box.innerHTML = '<p class="note">' + L('Rate the tasks above; your weakest tasks will show here.', '给上面的任务打分后，这里会列出你最弱的任务。') + '</p>'; return; }
    var sum = function (n) { return s[n].reduce(function (a, b) { return a + b; }, 0); };
    var weak = rated.slice().sort(function (a, b) { return sum(a) - sum(b); }).slice(0, 3);
    var dim = D.crit.map(function (c, k) { var t = 0; rated.forEach(function (n) { t += s[n][k]; }); return [c, t / rated.length]; }).sort(function (a, b) { return a[1] - b[1]; })[0];
    box.innerHTML = '<div class="note"><p><b>' + L('Weakest tasks: re-record these first', '最弱的任务：先把这几个重录') + '</b></p><p class="cta">' +
      weak.map(function (n) { var t = T[n - 1]; return '<a class="btn" href="speaking-' + n + '.html#practice">' + L('Task ' + n + ' · ' + t.en + ' (' + sum(n) + '/8)', '任务 ' + n + ' · ' + t.zh + '（' + sum(n) + '/8）') + '</a>'; }).join('') +
      '</p><p>' + L('Weakest dimension across the tasks you rated: <b>' + dim[0][0] + '</b>.', '已评任务里整体最弱的维度：<b>' + dim[0][1] + '</b>。') + ' ' + L('Rated ' + rated.length + ' of ' + results.filter(Boolean).length + ' tasks.', '已评 ' + rated.length + ' / ' + results.filter(Boolean).length + ' 个任务。') + '</p></div>';
  }
  function save() {
    var s = scores(), clean = {}; Object.keys(s).forEach(function (n) { if (s[n]) clean[n] = s[n]; });
    if (!Object.keys(clean).length) { $('.mk-saved', root).innerHTML = L('Rate at least one task first.', '请先至少给一个任务打分。'); return; }
    var H = loadJ('celpip.mock', []), d = new Date(), ds = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    H.push({ d: ds, s: clean, p: results.filter(Boolean).map(function (r) { return [r.n, r.i]; }) }); put('celpip.mock', JSON.stringify(H.slice(-30)));
    $('.mk-saved', root).innerHTML = L('Saved. See "Your mock history" below.', '已保存，见下方「历次模考记录」。'); history();
  }
  $('[data-mk=start]', root).addEventListener('click', start);
  $('[data-mk=end]', root).addEventListener('click', endNow);
  $('[data-mk=save]', root).addEventListener('click', save);
  $('[data-mk=again]', root).addEventListener('click', function () { revBox.hidden = true; start(); });
  window.addEventListener('beforeunload', function (e) { if (live) { e.preventDefault(); e.returnValue = ''; } });
  history();
})();
