/* CELPIP LS Crash Prep. Everything stays in this browser: language choice, ticks, and your voice recordings. Nothing is uploaded. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function L(en, zh) { return '<span class="inl"><span class="en">' + en + '</span><span class="zh">' + zh + '</span></span>'; }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { } return null; }

  /* ---------- language ---------- */
  $$('[data-set-lang]').forEach(function (b) {
    b.addEventListener('click', function () { document.documentElement.setAttribute('data-lang', b.getAttribute('data-set-lang')); store('celpip.lang', b.getAttribute('data-set-lang')); });
  });

  /* ---------- click-to-load YouTube (no cookies until you press play) ---------- */
  $$('.yt button[data-yt]').forEach(function (b) {
    b.addEventListener('click', function () {
      var f = document.createElement('iframe');
      ytLoad(b.parentNode, b.getAttribute('data-yt'), b.getAttribute('data-start'), b.getAttribute('data-title'));
    });
  });
  function ytLoad(box, id, start, title) {
    var f = document.createElement('iframe');
    f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1' + (start ? '&start=' + parseInt(start, 10) : '');
    f.allow = 'autoplay; encrypted-media; picture-in-picture'; f.allowFullscreen = true; f.title = title || 'CELPIP video';
    box.innerHTML = ''; box.appendChild(f); box.setAttribute('data-id', id);
  }

  /* ---------- real-test-style listening: check, show evidence, replay the evidence sentence, keep a mistakes list ---------- */
  function lqLoad() { try { return JSON.parse(store('celpip.lq') || '{}'); } catch (e) { return {}; } }
  function lqSave(o) { store('celpip.lq', JSON.stringify(o)); }
  function lqScore() {
    var o = lqLoad();
    $$('.lq-score').forEach(function (p) {
      var items = $$('.lqi'), done = 0, ok = 0;
      items.forEach(function (li) { var v = o[li.getAttribute('data-q')]; if (v !== undefined) { done++; if (v === 1) ok++; } });
      p.innerHTML = L(ok + ' of ' + done + ' answered correctly (' + items.length + ' questions on this page)', '已答 ' + done + ' 题，答对 ' + ok + ' 题（本页共 ' + items.length + ' 题）');
    });
  }
  $$('.lqi').forEach(function (li) {
    var qid = li.getAttribute('data-q'), a = li.getAttribute('data-a'), res = $('.lq-res', li);
    $('.lq-check', li).addEventListener('click', function () {
      var pick = $('input:checked', li);
      if (!pick) { $('.lq-check', li).innerHTML = L('Choose an answer first', '先选一个答案'); return; }
      var right = pick.value === a, o = lqLoad(); o[qid] = right ? 1 : 0; lqSave(o);
      li.classList.remove('ok', 'bad'); li.classList.add(right ? 'ok' : 'bad');
      $('.lq-verdict', li).innerHTML = right ? L('Correct.', '答对了。') : L('Not quite.', '答错了。');
      res.hidden = false; lqScore();
    });
    $('.lq-jump', li).addEventListener('click', function () {
      var clip = li.closest('.clip'), box = $('.yt', clip), btn = $('button[data-yt]', box);
      var id = btn ? btn.getAttribute('data-yt') : box.getAttribute('data-id');
      ytLoad(box, id, Math.max(0, parseInt(this.getAttribute('data-t'), 10) - 4), clip.querySelector('h3').textContent);
      box.scrollIntoView({ block: 'center' });
    });
  });
  lqScore();
  var idxEl = $('#lq-index');
  if (idxEl) {
    var idx = JSON.parse(idxEl.textContent), lo = lqLoad(), wrong = Object.keys(lo).filter(function (k) { return lo[k] === 0 && idx[k]; });
    var done = Object.keys(lo).filter(function (k) { return idx[k]; }), ok = done.length - wrong.length;
    $('.lq-total').innerHTML = L(ok + ' of ' + done.length + ' answered correctly across all parts (' + Object.keys(idx).length + ' questions)', '六个部分合计：已答 ' + done.length + ' 题，答对 ' + ok + ' 题（共 ' + Object.keys(idx).length + ' 题）');
    $('.lq-mistakes').innerHTML = wrong.map(function (k) { var d = idx[k]; return '<li><a href="listening-' + d.p + '.html#clip-' + d.c + '">Part ' + d.p + ': ' + d.q.replace(/[<&]/g, '') + '</a></li>'; }).join('');
    $('.lq-none').hidden = wrong.length > 0;
  }

  function openTarget() { var id = location.hash.slice(1); if (!id || /^p\d+$/.test(id)) return; var el = document.getElementById(id); if (!el) return; var d = el.closest('details'); if (d && !d.open) { d.open = true; el.scrollIntoView(); } }
  openTarget(); window.addEventListener('hashchange', openTarget);

  /* ---------- ticks in the crash plans ---------- */
  $$('input[data-tick]').forEach(function (c) {
    c.checked = store('celpip.tick.' + c.getAttribute('data-tick')) === '1';
    c.addEventListener('change', function () { store('celpip.tick.' + c.getAttribute('data-tick'), c.checked ? '1' : '0'); });
  });

  /* ---------- speaking practice: prep timer -> speaking timer -> record -> play back -> self-check ---------- */
  var root = $('.practice'); if (!root) return;
  var stages = JSON.parse(root.getAttribute('data-stages'));
  var task = root.getAttribute('data-task');
  var prompts = JSON.parse($('#prompts-data').textContent);
  var scale = parseFloat((location.search.match(/[?&]ts=([0-9.]+)/) || [])[1]) || 1;   // test hook only (gate runs timers at 1/20 speed)
  var card = $('.pr-card', root), timer = $('.pr-timer', root), phaseEl = $('.pr-phase', root), clockEl = $('.pr-clock', root), barEl = $('.pr-bar i', root);
  var btnStart = $('[data-act=start]', root), btnNext = $('[data-act=next]', root), btnSkip = $('[data-act=skip]', root), btnStop = $('[data-act=stop]', root);
  var done = $('.pr-done', root), audio = $('audio', done), msg = $('.pr-msg', root), meter = $('.pr-meter i', root);
  var idx = -1, running = false, tick = null, stream = null, rec = null, chunks = [], url = null, actx = null, an = null, meterRaf = 0, stageNo = 0, stageEnd = 0, stageLen = 0, skipFlag = false;

  var guide = $('.pr-guide', root), olEl = $('.pr-outline', root), phEl = $('.pr-phr', root), refBox = $('.pr-ref', root), refBtn = $('[data-act=ref]', root), whichEl = $('.pr-which', root), whichDone = $('.pr-which-done', root);
  function node(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function pairLi(en, zh) { var li = node('li'); li.appendChild(node('span', 't', en)); li.appendChild(document.createTextNode(' ')); li.appendChild(node('span', 'zh', zh)); return li; }
  function setRef(open) {
    refBox.hidden = !open; refBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    refBtn.innerHTML = open ? L('Hide the worked examples', '收起分级示范') : L('Show the worked examples (Level 5–6 / 7–8 / 9+)', '看这道题的分级示范（5–6／7–8／9+）');
  }
  var DIMS = { C: ['Content / Coherence', '内容与连贯'], V: ['Vocabulary', '词汇'], L: ['Listenability', '好懂程度'], T: ['Task Fulfillment', '完成任务'] };
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function lvSpans(p, k) {
    var r = []; (p.up || []).forEach(function (u, i) {
      if (k === 'l5' && u[0] === 7) r.push([u[1], 'hl-lo', i]);
      if (k === 'a' && u[0] === 7) r.push([u[2], 'hl-up', i]);
      if (k === 'a' && u[0] === 9) r.push([u[1], 'hl-lo', i]);
      if (k === 'l9' && u[0] === 9) r.push([u[2], 'hl-up', i]);
    }); return r;
  }
  function markInto(el, text, spans) {   /* wrap each upgrade phrase in <mark class="hl ..."> (overlapping phrases share a segment) */
    var cover = []; for (var c = 0; c < text.length; c++) cover.push('');
    spans.forEach(function (s) { var at = text.indexOf(s[0]); if (at < 0) return; for (var j = at; j < at + s[0].length; j++) cover[j] += (cover[j] ? ',' : '') + s[2] + ':' + s[1]; });
    var i = 0;
    while (i < text.length) {
      var j = i; while (j < text.length && cover[j] === cover[i]) j++;
      var seg = text.slice(i, j);
      if (cover[i]) {
        var parts = cover[i].split(','), cls = {}, keys = [];
        parts.forEach(function (x) { var q = x.split(':'); keys.push(q[0]); cls[q[1]] = 1; });
        var m = node('mark', 'hl ' + Object.keys(cls).join(' '), seg); m.setAttribute('data-u', keys.join(',')); m.tabIndex = 0; m.setAttribute('role', 'button'); el.appendChild(m);
      } else el.appendChild(document.createTextNode(seg));
      i = j;
    }
  }
  function upHtml(u) {
    return '<span class="dim">' + L(DIMS[u[3]][0], DIMS[u[3]][1]) + '</span> <span class="t"><s>' + esc(u[1]) + '</s> → <b>' + esc(u[2]) + '</b></span><br><span class="bi why"><span class="zh">' + esc(u[4]) + '</span><span class="en">' + esc(u[5]) + '</span></span>';
  }
  function setLv(k) {
    var lv = $('.pr-lv', refBox); if (!lv) return; lv.setAttribute('data-show', k);
    $$('[data-lvtab]', refBox).forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-lvtab') === k ? 'true' : 'false'); });
  }
  function showWhy(keys, fromList) {
    var p = prompts[idx], box = $('.lv-why', refBox); if (!box || !p || !p.up) return;
    var ks = keys.split(','); box.innerHTML = '';
    ks.forEach(function (k) {
      var u = p.up[+k]; if (!u) return;
      var d = node('div', 'lvw'); d.innerHTML = '<b>' + L(u[0] === 7 ? 'Level 5–6 → 7–8' : 'Level 7–8 → 9+', u[0] === 7 ? '5–6 级 → 7–8 级' : '7–8 级 → 9 级以上') + '</b> ' + upHtml(u); box.appendChild(d);
    });
    box.hidden = false;
    $$('mark.hl', refBox).forEach(function (m) { var mk = (m.getAttribute('data-u') || '').split(','); m.classList.toggle('pair', mk.some(function (x) { return ks.indexOf(x) >= 0; })); });
    if (fromList) {
      var u0 = p.up[+ks[0]], col = u0 && u0[0] === 7 ? 'a' : 'l9'; setLv(col);
      var t = $('.lvcol[data-lv=' + col + '] mark.pair', refBox); if (t && t.scrollIntoView) t.scrollIntoView({ block: 'center' });
    }
  }
  if (refBox) {
    $$('[data-lvtab]', refBox).forEach(function (b) { b.addEventListener('click', function () { setLv(b.getAttribute('data-lvtab')); }); });
    refBox.addEventListener('click', function (ev) { var m = ev.target.closest && ev.target.closest('mark.hl'); if (m) showWhy(m.getAttribute('data-u'), false); });
    refBox.addEventListener('keydown', function (ev) { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('mark.hl, .uplist li')) { ev.preventDefault(); ev.target.click(); } });
  }
  function show(i) {
    idx = i; var p = prompts[i];
    card.innerHTML = (p.scene ? '<div class="scene" aria-hidden="true">' + p.scene + '</div>' : '') + '<div class="t">' + p.q + '</div>' + (p.zh ? '<div class="pr-gloss zh tr">' + p.zh + '</div>' : '');
    whichEl.innerHTML = L('Prompt ' + (i + 1) + ' of ' + prompts.length, '第 ' + (i + 1) + ' 题 / 共 ' + prompts.length + ' 题');
    $$('.plist button', document).forEach(function (b, j) { b.setAttribute('aria-pressed', j === i ? 'true' : 'false'); });
    if (guide && p.o) {
      olEl.textContent = ''; p.o.forEach(function (x) { olEl.appendChild(pairLi(x[0], x[1])); });
      phEl.textContent = ''; p.ph.forEach(function (x) { phEl.appendChild(pairLi(x[0], x[1])); });
      var tpl = []; try { tpl = JSON.parse(refBox.getAttribute('data-tpl') || '[]'); } catch (e) { }
      var cols = { a: [p.a, $('.pr-ans', refBox)] };
      if (p.l5 && $('.pr-lv', refBox)) { cols.l5 = [p.l5, $('.lvcol[data-lv=l5] .lv-txt', refBox)]; cols.l9 = [p.l9, $('.lvcol[data-lv=l9] .lv-txt', refBox)]; }
      Object.keys(cols).forEach(function (k) {
        var paras = cols[k][0], box = cols[k][1], spans = lvSpans(p, k); box.textContent = '';
        paras.forEach(function (t, n) {
          var para = node('p'), last = paras.length - 1;
          var step = !tpl.length ? null : n === 0 ? tpl[0] : n === last ? tpl[tpl.length - 1] : tpl[Math.min(n, tpl.length - 2)];
          if (step) { var lab = node('span', 'step'); lab.innerHTML = L(step[0], step[1]); para.appendChild(lab); para.appendChild(document.createTextNode(' ')); }
          markInto(para, t, spans); box.appendChild(para);
        });
      });
      var wc = { l5: p.w5, a: p.w, l9: p.w9 };
      $$('.lvcol', refBox).forEach(function (c) { var w = wc[c.getAttribute('data-lv')]; $('.lv-wc', c).innerHTML = w ? '· ' + L(w + ' words', w + ' 词') : ''; });
      $('.pr-wc', refBox).innerHTML = p.l5 ? L('Words: Level 5–6 ' + p.w5 + ' · 7–8 ' + p.w + ' · 9+ ' + p.w9 + ' (all fit in ' + task_secs() + ' s)', '字数：5–6 级 ' + p.w5 + ' · 7–8 级 ' + p.w + ' · 9 级以上 ' + p.w9 + '（都能在 ' + task_secs() + ' 秒内说完）') : p.w + ' words · ' + task_secs() + ' s';
      var why = $('.lv-why', refBox); if (why) { why.hidden = true; why.innerHTML = ''; }
      var ul = $('.pr-up', refBox);
      if (ul) {
        ul.textContent = '';
        [[7, 'Level 5–6 → 7–8', '从 5–6 级到 7–8 级'], [9, 'Level 7–8 → 9+', '从 7–8 级到 9 级以上']].forEach(function (g) {
          var h = node('h4'); h.innerHTML = L(g[1], g[2]); ul.appendChild(h);
          var ol = node('ol', 'uplist');
          (p.up || []).forEach(function (u, k) { if (u[0] !== g[0]) return; var li = node('li'); li.setAttribute('data-u', k); li.tabIndex = 0; li.innerHTML = upHtml(u); li.addEventListener('click', function () { showWhy(String(k), true); }); ol.appendChild(li); });
          ul.appendChild(ol);
        });
      }
      var nt = $('.pr-notes', refBox); nt.textContent = ''; p.z.forEach(function (t) { var li = node('li', 'bi'); li.appendChild(node('span', 'zh', t[0])); li.appendChild(node('span', 'en', t[1])); nt.appendChild(li); });
      setRef(!refBox.hidden);
    }
    try { if (location.hash !== '#p' + (i + 1) && (location.hash === '' || /^#p\d+$/.test(location.hash))) history.replaceState(null, '', '#p' + (i + 1)); } catch (e) { }
    var cur = $$('.plist button')[i]; if (cur && cur.scrollIntoView && cur.parentNode.parentNode.scrollWidth > cur.parentNode.parentNode.clientWidth) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
    done.hidden = true; msg.innerHTML = '';
  }
  function task_secs() { var sp = stages.filter(function (s) { return s.rec; })[0]; return sp ? sp.s : 60; }
  if (refBtn) refBtn.addEventListener('click', function () { setRef(refBox.hidden); });
  function pick(i) { if (running) return; show(i); }
  $$('.plist button').forEach(function (b, j) { b.addEventListener('click', function () { pick(j); }); });
  var bPrev = $('[data-act=prev]', root), bNextP = $('[data-act=nextp]', root);
  if (bPrev) bPrev.addEventListener('click', function () { if (!running) pick((idx - 1 + prompts.length) % prompts.length); });
  if (bNextP) bNextP.addEventListener('click', function () { if (!running) pick((idx + 1) % prompts.length); });
  document.addEventListener('keydown', function (ev) { if (running || /INPUT|TEXTAREA|SELECT/.test((ev.target || {}).tagName || '') || document.querySelector('.fd-overlay:not([hidden])')) return; if (ev.key === 'ArrowLeft' && bPrev) bPrev.click(); if (ev.key === 'ArrowRight' && bNextP) bNextP.click(); });
  btnNext.addEventListener('click', function () { if (running) return; var j = idx; if (prompts.length > 1) { while (j === idx) j = Math.floor(Math.random() * prompts.length); } pick(j); });

  function beep(freq, ms, n) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var t0 = actx.currentTime;
      for (var k = 0; k < (n || 1); k++) {
        var o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = freq; o.connect(g); g.connect(actx.destination);
        var s = t0 + k * (ms / 1000 + 0.08); g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.25, s + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, s + ms / 1000);
        o.start(s); o.stop(s + ms / 1000 + 0.02);
      }
    } catch (e) { }
  }
  function fmt(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  var NAMES = {
    choose: L('Part 1 · choose an option (no speaking)', '第 1 部分 · 选一个方案（不说话）'),
    prep: L('Preparation time', '准备时间'), speak: L('Speaking time · recording', '说话时间 · 正在录音')
  };

  function pickMime() {
    if (!window.MediaRecorder) return '';
    var c = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];   // mp4 first: plays back everywhere, incl. iPhone Safari
    for (var i = 0; i < c.length; i++) { try { if (MediaRecorder.isTypeSupported(c[i])) return c[i]; } catch (e) { } }
    return '';
  }
  function setMsg(h) { msg.innerHTML = h; }
  function needMic() { return stages.some(function (s) { return s.rec; }); }

  function begin() {
    if (running) return; if (idx < 0) show(0);
    done.hidden = true; setMsg('');
    if (!needMic()) return run();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      setMsg('<div class="note">' + L('This browser cannot record. The timers still work; say your answer out loud.', '这个浏览器不能录音。计时器照常使用，请开口大声说出你的回答。') + '</div>'); stream = null; return run();
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
      stream = s;
      try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); var src = actx.createMediaStreamSource(s); an = actx.createAnalyser(); an.fftSize = 512; src.connect(an); } catch (e) { an = null; }
      run();
    }).catch(function () {
      setMsg('<div class="note">' + L('Microphone blocked, so nothing will be recorded. Allow the microphone in the browser address bar, or continue with timers only.', '麦克风被拦住了，所以不会录音。请在浏览器地址栏允许麦克风，或只用计时器继续。') + '</div>'); stream = null; run();
    });
  }

  function run() {
    running = true; stageNo = -1; btnStart.disabled = true; btnNext.disabled = true; $$('.plist button').forEach(function (b) { b.disabled = true; });
    nextStage();
  }
  function nextStage() {
    stageNo++;
    if (stageNo >= stages.length) return finish();
    var st = stages[stageNo]; skipFlag = false;
    phaseEl.innerHTML = NAMES[st.k]; timer.className = 'pr-timer on' + (st.rec ? ' speak' : '');
    stageLen = st.s * 1000 * scale; stageEnd = Date.now() + stageLen;
    btnSkip.hidden = !(st.k === 'prep' || st.k === 'choose'); btnStop.hidden = !st.rec;
    if (st.rec) { beep(880, 160, 2); startRec(); } else beep(520, 140, 1);
    clearInterval(tick); tick = setInterval(update, 200); update();
  }
  function update() {
    var left = (stageEnd - Date.now()) / 1000 / scale, tot = stageLen / 1000 / scale;
    clockEl.textContent = fmt(left); barEl.style.width = Math.min(100, 100 - (left / tot) * 100) + '%';
    if (Date.now() >= stageEnd) { clearInterval(tick); endStage(); }
  }
  function endStage() { if (stages[stageNo].rec) stopRec(function () { nextStage(); }); else nextStage(); }
  btnSkip.addEventListener('click', function () { if (!running) return; clearInterval(tick); nextStage(); });
  btnStop.addEventListener('click', function () { if (!running || !stages[stageNo].rec) return; clearInterval(tick); stopRec(function () { nextStage(); }); });
  $('[data-act=reset]', root).addEventListener('click', function () { clearInterval(tick); if (rec && rec.state !== 'inactive') { rec.onstop = null; try { rec.stop(); } catch (e) { } } cleanupStream(); running = false; timer.className = 'pr-timer'; btnStart.disabled = false; btnNext.disabled = false; $$('.plist button').forEach(function (b) { b.disabled = false; }); setMsg(''); });

  function startRec() {
    chunks = []; rec = null; if (!stream) return;
    try { var m = pickMime(); rec = m ? new MediaRecorder(stream, { mimeType: m }) : new MediaRecorder(stream); } catch (e) { rec = null; return; }
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.start(250); drawMeter();
  }
  function drawMeter() {
    cancelAnimationFrame(meterRaf); if (!an || !meter) return;
    var buf = new Uint8Array(an.fftSize);
    (function loop() { an.getByteTimeDomainData(buf); var mx = 0; for (var i = 0; i < buf.length; i++) mx = Math.max(mx, Math.abs(buf[i] - 128)); meter.style.width = Math.min(100, mx / 80 * 100) + '%'; meterRaf = requestAnimationFrame(loop); })();
  }
  function stopRec(cb) {
    cancelAnimationFrame(meterRaf); if (meter) meter.style.width = '0';
    if (!rec || rec.state === 'inactive') return cb();
    rec.onstop = function () { cb(); }; try { rec.stop(); } catch (e) { cb(); }
  }
  function cleanupStream() { if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } an = null; }
  function finish() {
    running = false; timer.className = 'pr-timer'; btnSkip.hidden = true; btnStop.hidden = true; btnStart.disabled = false; btnNext.disabled = false; $$('.plist button').forEach(function (b) { b.disabled = false; });
    cleanupStream(); beep(440, 220, 1);
    var n = (parseInt(store('celpip.n.' + task), 10) || 0) + 1; store('celpip.n.' + task, String(n));
    if (url) { URL.revokeObjectURL(url); url = null; }
    var has = chunks.length > 0, dl = $('.pr-dl', done), none = $('.pr-none', done);
    if (has) { var blob = new Blob(chunks, { type: (rec && rec.mimeType) || 'audio/webm' }); url = URL.createObjectURL(blob); audio.src = url; audio.hidden = false; none.hidden = true; dl.hidden = false; dl.href = url; dl.download = 'celpip-task' + task + '-p' + (idx + 1) + '-practice.' + (/mp4/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm'); }
    else { audio.removeAttribute('src'); audio.hidden = true; none.hidden = false; dl.hidden = true; }
    $$('.check input', done).forEach(function (c) { c.checked = false; });
    $('.pr-count', done).textContent = String(n);
    if (whichDone) whichDone.innerHTML = L('You just recorded prompt ' + (idx + 1) + '. Now compare with the reference answer for this prompt.', '你刚录的是第 ' + (idx + 1) + ' 题。现在对照这道题自己的参考答案。');
    if (refBtn) refBtn.classList.add('primary');
    done.hidden = false; done.scrollIntoView && done.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  btnStart.addEventListener('click', begin);
  $('[data-act=again]', done).addEventListener('click', function () { done.hidden = true; begin(); });
  $('[data-act=other]', done).addEventListener('click', function () { done.hidden = true; btnNext.click(); });
  var hm = /^#p(\d+)$/.exec(location.hash), start = hm ? Math.min(prompts.length, Math.max(1, +hm[1])) - 1 : 0;
  show(start);
})();
