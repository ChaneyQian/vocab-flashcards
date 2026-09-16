(() => {
  const TOPICS = window.VOCAB_DATA || [];
  const DEFAULT_ROSTER = (window.STUDENT_DATA || []).map(s => ({ name: s.name, score: s.score, excluded: false }));
  const LS_KEY = 'vocab-flash-v1';

  // ---------- state ----------
  const defaults = () => ({
    cutoff: 30,
    topics: TOPICS.map(t => t.name),
    dir: 'en',
    perCard: 1,
    noRepeat: true,
    roster: DEFAULT_ROSTER.map(s => ({ ...s })),
    drawn: [],
    log: []
  });
  let state = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (saved && Array.isArray(saved.roster)) state = { ...defaults(), ...saved };
  } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } };

  const $ = id => document.getElementById(id);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const scoreOf = s => (typeof s.score === 'number' ? s.score : 0);

  // ---------- deck ----------
  let deck = [], deckPos = 0;
  function buildDeck() {
    deck = [];
    TOPICS.forEach(t => { if (state.topics.includes(t.name)) t.words.forEach(w => deck.push({ ...w, topic: t.name })); });
    shuffle(deck); deckPos = 0;
    $('poolInfo').textContent = deck.length ? `词库 ${deck.length} 词` : '未选择主题';
  }
  function nextWord() {
    if (!deck.length) return null;
    if (deckPos >= deck.length) { shuffle(deck); deckPos = 0; }
    return deck[deckPos++];
  }
  // a group of `perCard` words shown together on one card
  function nextWords() {
    const n = Math.min(state.perCard, deck.length), out = [];
    for (let i = 0; i < n; i++) { const w = nextWord(); if (w) out.push(w); }
    return out.length ? out : null;
  }

  // ---------- card component ----------
  function makeCard(container) {
    container.innerHTML = `
      <div class="card empty">
        <div class="face front"><span class="tag"></span><span class="side"></span><div class="word">点击「下一张」开始</div><div class="hint">点击卡片 / 空格 翻转</div></div>
        <div class="face back"><span class="tag"></span><span class="side"></span><div class="word"></div><div class="hint">→ 下一张</div></div>
      </div>`;
    const el = container.querySelector('.card');
    let current = null;
    el.addEventListener('click', () => api.flip());
    const api = {
      get word() { return current; },
      // ws: array of words shown together on this card (or null)
      show(ws) {
        current = ws && ws.length ? ws : null;
        el.classList.remove('flipped');
        if (!current) { el.classList.add('empty'); return; }
        el.classList.remove('empty');
        const dir = state.dir === 'mix' ? (Math.random() < 0.5 ? 'en' : 'zh') : state.dir;
        const topics = [...new Set(current.map(w => w.topic))].join(' · ');
        el.querySelectorAll('.tag').forEach(t => t.textContent = topics);
        el.querySelector('.front .side').textContent = dir === 'en' ? 'English' : '中文';
        el.querySelector('.back .side').textContent = dir === 'en' ? '中文' : 'English';
        const fill = (node, key) => {
          node.className = 'word' + (current.length > 1 ? ` multi n${current.length}` : '');
          node.innerHTML = '';
          current.forEach(w => { const s = document.createElement('span'); s.textContent = w[key]; node.appendChild(s); });
        };
        fill(el.querySelector('.front .word'), dir === 'en' ? 'en' : 'zh');
        fill(el.querySelector('.back .word'), dir === 'en' ? 'zh' : 'en');
      },
      flip() { if (current) el.classList.toggle('flipped'); }
    };
    return api;
  }
  const cardA = makeCard($('cardA'));
  const cardB = makeCard($('cardB'));

  // ---------- topics / direction ----------
  function renderTopics() {
    const box = $('topics'); box.innerHTML = '';
    TOPICS.forEach(t => {
      const b = document.createElement('button');
      b.className = 'chip' + (state.topics.includes(t.name) ? ' on' : '');
      b.innerHTML = `${t.name}<small>${t.words.length}</small>`;
      b.onclick = () => {
        state.topics = state.topics.includes(t.name) ? state.topics.filter(n => n !== t.name) : [...state.topics, t.name];
        save(); renderTopics(); buildDeck();
      };
      box.appendChild(b);
    });
    const all = document.createElement('button');
    all.className = 'chip util';
    const allOn = state.topics.length === TOPICS.length;
    all.textContent = allOn ? '清空' : '全选';
    all.onclick = () => { state.topics = allOn ? [] : TOPICS.map(t => t.name); save(); renderTopics(); buildDeck(); };
    box.appendChild(all);
  }
  $('dir').querySelectorAll('button').forEach(b => {
    b.classList.toggle('active', b.dataset.dir === state.dir);
    b.onclick = () => {
      state.dir = b.dataset.dir; save();
      $('dir').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    };
  });

  // ---------- modes ----------
  let mode = 'cards';
  $('modes').querySelectorAll('button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  function setMode(m) {
    mode = m;
    $('modes').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
    document.querySelectorAll('.mode').forEach(s => s.classList.toggle('active', s.id === 'mode-' + m));
    $('toolbar').style.display = m === 'settings' ? 'none' : '';
    if (m === 'pick') renderProb();
    if (m === 'settings') renderRoster();
  }

  // ---------- admin mode ----------
  // SHA-256 of the admin password; the flag lives in sessionStorage (cleared when the tab closes)
  const ADMIN_HASH = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
  const ADMIN_KEY = 'vocab-flash-admin';
  let admin = false;
  try { admin = sessionStorage.getItem(ADMIN_KEY) === '1'; } catch (e) { /* ignore */ }
  async function sha256(str) {
    if (!window.crypto || !crypto.subtle) return null;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function applyAdmin() {
    document.body.classList.toggle('admin', admin);
    $('adminBtn').textContent = admin ? '退出 Admin' : 'Admin';
    try { sessionStorage.setItem(ADMIN_KEY, admin ? '1' : '0'); } catch (e) { /* ignore */ }
    if (!admin && mode === 'settings') setMode('cards');
  }
  function openAdminModal() {
    $('adminErr').textContent = ''; $('adminPw').value = '';
    $('adminModal').hidden = false; setTimeout(() => $('adminPw').focus(), 0);
  }
  function closeAdminModal() { $('adminModal').hidden = true; }
  $('adminBtn').onclick = () => { if (admin) { admin = false; applyAdmin(); } else openAdminModal(); };
  $('adminCancel').onclick = closeAdminModal;
  $('adminModal').addEventListener('click', e => { if (e.target === $('adminModal')) closeAdminModal(); });
  $('adminForm').onsubmit = async e => {
    e.preventDefault();
    const h = await sha256($('adminPw').value);
    if (h === null) { $('adminErr').textContent = '此环境不支持密码校验（需 https 或 localhost）'; return; }
    if (h === ADMIN_HASH) { admin = true; applyAdmin(); closeAdminModal(); }
    else { $('adminErr').textContent = '密码错误'; $('adminPw').select(); }
  };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('adminModal').hidden) closeAdminModal(); });

  // ---------- weighting ----------
  function eligible() {
    return state.roster.filter(s => s.name && !s.excluded && scoreOf(s) < state.cutoff);
  }
  // rank-based weight: number of eligible students whose score is >= mine
  // lowest score -> weight N, highest -> weight 1, ties share a weight
  function weights(list) {
    return list.map(s => list.filter(o => scoreOf(o) >= scoreOf(s)).length);
  }
  function pickStudent() {
    let pool = eligible();
    if (!pool.length) return null;
    if (state.noRepeat) {
      const left = pool.filter(s => !state.drawn.includes(s.name));
      if (!left.length) { state.drawn = []; } else pool = left;
    }
    const w = weights(pool), total = w.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r < 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  let rolling = false, lastPicked = null;
  function doPick() {
    if (rolling) return;
    const chosen = pickStudent();
    const nameEl = $('pickName');
    if (!chosen) { nameEl.textContent = '没有可抽的学生'; return; }
    const names = eligible().map(s => s.name);
    rolling = true; nameEl.classList.add('rolling'); nameEl.classList.remove('landed');
    let i = 0; const steps = 16;
    const tick = () => {
      if (i < steps) {
        nameEl.textContent = names[Math.floor(Math.random() * names.length)];
        i++; setTimeout(tick, 50 + i * i * 1.6);
      } else {
        nameEl.textContent = chosen.name;
        nameEl.classList.remove('rolling'); nameEl.classList.add('landed');
        rolling = false; lastPicked = chosen.name;
        if (state.noRepeat && !state.drawn.includes(chosen.name)) state.drawn.push(chosen.name);
        save(); renderProb();
        cardB.show(nextWords());
      }
    };
    tick();
  }

  function renderProb() {
    const el = eligible(), w = weights(el), total = w.reduce((a, b) => a + b, 0) || 1;
    const rows = state.roster.filter(s => s.name).map(s => {
      const idx = el.indexOf(s);
      return { s, weight: idx >= 0 ? w[idx] : 0, p: idx >= 0 ? w[idx] / total : 0 };
    }).sort((a, b) => scoreOf(a.s) - scoreOf(b.s));
    const maxP = Math.max(...rows.map(r => r.p), 0.0001);
    let html = '<tr><th>学生</th><th>分数</th><th>权重</th><th>概率</th></tr>';
    rows.forEach(r => {
      const out = r.weight === 0;
      const drawn = state.noRepeat && state.drawn.includes(r.s.name);
      const cls = [out ? 'out' : '', drawn ? 'drawn' : '', r.s.name === lastPicked ? 'hot' : ''].join(' ');
      const why = r.s.excluded ? '手动排除' : scoreOf(r.s) >= state.cutoff ? `≥${state.cutoff}` : '';
      const sc = typeof r.s.score === 'number' ? r.s.score : '—';
      html += `<tr class="${cls}"><td>${r.s.name}</td><td class="num">${sc}</td><td class="num">${out ? why : r.weight}</td>` +
        `<td class="num">${out ? '' : `<span class="bar" style="width:${Math.round(r.p / maxP * 48)}px"></span>${(r.p * 100).toFixed(1)}%`}</td></tr>`;
    });
    $('probTable').innerHTML = html;
    $('roundInfo').textContent = `${state.noRepeat ? state.drawn.filter(n => el.some(s => s.name === n)).length : '-'} / ${el.length}`;
    $('cutoffEcho').textContent = state.cutoff;
    $('noRepeat').checked = state.noRepeat;
  }
  $('noRepeat').onchange = e => { state.noRepeat = e.target.checked; if (!state.noRepeat) state.drawn = []; save(); renderProb(); };

  // ---------- log ----------
  function record(ok) {
    const ws = cardB.word;
    if (!lastPicked || !ws) return;
    state.log.push({ t: Date.now(), name: lastPicked, en: ws.map(w => w.en).join(' / '), zh: ws.map(w => w.zh).join(' / '), ok });
    if (state.log.length > 500) state.log.shift();
    save(); renderLog();
    $('okBtn').disabled = $('badBtn').disabled = true;
  }
  function renderLog() {
    const ok = state.log.filter(l => l.ok).length;
    $('logStats').textContent = state.log.length ? `（${state.log.length} 次，答对 ${ok}）` : '';
    $('log').innerHTML = state.log.slice().reverse().map(l =>
      `<li><span class="${l.ok ? 'r-ok' : 'r-bad'}">${l.ok ? '✓' : '✗'}</span> ${l.name} · ${l.en} — ${l.zh}</li>`).join('');
  }
  $('copyLog').onclick = () => {
    const txt = state.log.map(l => `${new Date(l.t).toLocaleString()}\t${l.name}\t${l.en}\t${l.zh}\t${l.ok ? '对' : '错'}`).join('\n');
    navigator.clipboard && navigator.clipboard.writeText(txt).then(() => { $('copyLog').textContent = '已复制'; setTimeout(() => $('copyLog').textContent = '复制', 1200); });
  };
  $('clearLog').onclick = () => { if (confirm('清空本次记录？')) { state.log = []; state.drawn = []; save(); renderLog(); renderProb(); } };

  // ---------- roster settings ----------
  function renderRoster() {
    const t = $('roster');
    let html = '<tr><th>#</th><th>姓名</th><th>分数</th><th>手动排除</th><th>状态</th><th></th></tr>';
    state.roster.forEach((s, i) => {
      const out = s.excluded || scoreOf(s) >= state.cutoff;
      const status = s.excluded ? '手动排除' : scoreOf(s) >= state.cutoff ? `≥${state.cutoff}，不参与` : (typeof s.score !== 'number' ? '无分数，按 0' : '参与');
      html += `<tr class="${out ? 'out' : ''}"><td>${i + 1}</td>` +
        `<td><input type="text" data-i="${i}" data-k="name" value="${s.name.replace(/"/g, '&quot;')}"></td>` +
        `<td><input type="number" data-i="${i}" data-k="score" value="${typeof s.score === 'number' ? s.score : ''}" style="width:80px"></td>` +
        `<td><input type="checkbox" data-i="${i}" data-k="excluded" ${s.excluded ? 'checked' : ''}></td>` +
        `<td class="status">${status}</td><td><button class="del" data-del="${i}" title="删除">✕</button></td></tr>`;
    });
    t.innerHTML = html;
    $('cutoff').value = state.cutoff;
    t.querySelectorAll('input').forEach(inp => inp.onchange = () => {
      const s = state.roster[+inp.dataset.i], k = inp.dataset.k;
      if (k === 'name') s.name = inp.value.trim();
      else if (k === 'score') s.score = inp.value === '' ? null : Number(inp.value);
      else s.excluded = inp.checked;
      save(); renderRoster();
    });
    t.querySelectorAll('.del').forEach(b => b.onclick = () => { state.roster.splice(+b.dataset.del, 1); save(); renderRoster(); });
  }
  $('cutoff').onchange = e => { state.cutoff = Number(e.target.value) || 0; save(); renderRoster(); };
  $('addRow').onclick = () => { state.roster.push({ name: '', score: null, excluded: false }); save(); renderRoster(); };
  $('resetRoster').onclick = () => {
    if (confirm('恢复为成绩表中的默认名单和分数？')) { state.roster = DEFAULT_ROSTER.map(s => ({ ...s })); state.cutoff = 30; state.drawn = []; save(); renderRoster(); }
  };

  // ---------- roster import ----------
  const isNum = v => typeof v === 'number' ? isFinite(v) : /^-?\d+(\.\d+)?$/.test(String(v).trim());
  const isText = v => v !== null && v !== undefined && String(v).trim() !== '' && !isNum(v);

  // minimal CSV/TSV parser (quotes supported); delimiter auto-detected
  function parseDelimited(text) {
    const first = text.split(/\r?\n/).find(l => l.trim()) || '';
    const delim = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  }

  // a header row is a first row containing no numbers at all
  const headerOf = rows => (rows[0] && rows[0].some(isText) && !rows[0].some(isNum)) ? rows[0] : null;
  const SCORE_KEYS = /quiz|score|mark|test|grade|point|分|成绩|得分/i;

  // name column = most distinct text values; score column = a numeric column to its right,
  // preferring a header that looks like a score, otherwise the one with the most numbers
  function detectColumns(rows) {
    const width = Math.max(...rows.map(r => r.length));
    const header = headerOf(rows), body = header ? rows.slice(1) : rows;
    const col = c => body.map(r => r[c]);
    const numCount = Array.from({ length: width }, (_, c) => col(c).filter(isNum).length);
    const keyed = Array.from({ length: width }, (_, c) => !!(header && SCORE_KEYS.test(String(header[c]))));
    let best = null;
    for (let c = 0; c < width; c++) {
      const distinct = new Set(col(c).filter(isText).map(v => String(v).trim())).size;
      if (distinct < 2) continue;
      let sc = -1;
      for (let d = c + 1; d < width; d++) {
        if (!numCount[d]) continue;
        if (sc < 0 || (keyed[d] && !keyed[sc]) || (keyed[d] === keyed[sc] && numCount[d] > numCount[sc])) sc = d;
      }
      if (sc < 0) continue;
      // ties: prefer the text column closest to the numbers (usually the English name next to the score)
      if (!best || distinct > best.distinct || (distinct === best.distinct && c > best.name)) best = { name: c, score: sc, distinct };
    }
    return best;
  }

  let imported = null, importRows = null, importCols = null, importWb = null;
  const colLabel = (header, c) => header && String(header[c]).trim() ? `${String(header[c]).trim()}（第 ${c + 1} 列）` : `第 ${c + 1} 列`;

  function fillColSelect(sel, width, header, chosen) {
    sel.innerHTML = '';
    for (let c = 0; c < width; c++) { const o = document.createElement('option'); o.value = c; o.textContent = colLabel(header, c); sel.appendChild(o); }
    sel.value = chosen;
  }
  function renderImportPreview() {
    const rows = importRows, cols = importCols, header = headerOf(rows), body = header ? rows.slice(1) : rows;
    imported = body.filter(r => isText(r[cols.name])).map(r => ({
      name: String(r[cols.name]).replace(/​|‌/g, '').trim(),
      score: isNum(r[cols.score]) ? Number(r[cols.score]) : null
    }));
    const noScore = imported.filter(s => s.score === null).length;
    $('importInfo').textContent = `共 ${imported.length} 人` + (noScore ? `（${noScore} 人无分数，按 0 计）` : '') + '，确认列选择后再导入';
    $('importTable').innerHTML = '<tr><th>#</th><th>姓名</th><th>分数</th></tr>' + imported.map((s, i) =>
      `<tr><td>${i + 1}</td><td>${s.name}</td><td class="num ${s.score === null ? 'skip' : ''}">${s.score === null ? '—' : s.score}</td></tr>`).join('');
    $('importPreview').hidden = false;
  }
  function parseImportRows(rows) {
    importRows = rows;
    const cols = detectColumns(rows);
    if (!cols) { $('importInfo').textContent = '没找到「姓名列 + 右侧数字列」的组合'; $('importPreview').hidden = true; imported = null; return; }
    importCols = cols;
    const width = Math.max(...rows.map(r => r.length)), header = headerOf(rows);
    fillColSelect($('importNameCol'), width, header, cols.name);
    fillColSelect($('importScoreCol'), width, header, cols.score);
    renderImportPreview();
  }
  $('importNameCol').onchange = e => { importCols.name = +e.target.value; renderImportPreview(); };
  $('importScoreCol').onchange = e => { importCols.score = +e.target.value; renderImportPreview(); };

  function loadSheetJS() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = res; s.onerror = () => rej(new Error('无法加载 xlsx 解析库（需联网）')); document.head.appendChild(s);
    });
  }
  const sheetRows = (wb, name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' })
    .filter(r => r.some(c => String(c).trim() !== ''));
  async function parseFile(file) {
    importWb = null; $('importSheetWrap').hidden = true;
    if (/\.xlsx?$/i.test(file.name)) {
      await loadSheetJS();
      importWb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      if (importWb.SheetNames.length > 1) {
        const sel = $('importSheet'); sel.innerHTML = '';
        importWb.SheetNames.forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); });
        $('importSheetWrap').hidden = false;
      }
      return sheetRows(importWb, importWb.SheetNames[0]);
    }
    return parseDelimited(await file.text());
  }
  $('importSheet').onchange = e => { if (importWb) parseImportRows(sheetRows(importWb, e.target.value)); };
  $('importFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    $('importInfo').textContent = '解析中…';
    try { parseImportRows(await parseFile(f)); } catch (err) { $('importInfo').textContent = err.message; }
  };
  $('importParse').onclick = () => {
    const t = $('importText').value;
    if (t.trim()) { importWb = null; $('importSheetWrap').hidden = true; parseImportRows(parseDelimited(t)); }
    else if ($('importFile').files[0]) $('importFile').onchange({ target: $('importFile') });
    else $('importInfo').textContent = '请先选择文件或粘贴内容';
  };
  function applyImport(replace) {
    if (!imported || !imported.length) return;
    if (replace) state.roster = imported.map(s => ({ ...s, excluded: false }));
    else imported.forEach(s => {
      const hit = state.roster.find(r => r.name.toLowerCase() === s.name.toLowerCase());
      if (hit) hit.score = s.score; else state.roster.push({ ...s, excluded: false });
    });
    state.drawn = []; save(); renderRoster();
    $('importInfo').textContent = replace ? `已替换为 ${imported.length} 人` : `已合并，当前 ${state.roster.length} 人`;
    $('importPreview').hidden = true; imported = null; $('importText').value = ''; $('importFile').value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $('importReplace').onclick = () => { if (confirm(`用导入的 ${imported.length} 人替换当前名单？`)) applyImport(true); };
  $('importMerge').onclick = () => applyImport(false);

  // ---------- buttons / keys ----------
  $('flipA').onclick = () => cardA.flip();
  $('nextA').onclick = () => cardA.show(nextWords());
  $('flipB').onclick = () => cardB.flip();
  $('nextB').onclick = () => { cardB.show(nextWords()); $('okBtn').disabled = $('badBtn').disabled = !lastPicked; };
  // slider: words per card
  const perCardEl = $('perCard');
  perCardEl.value = state.perCard; $('perCardVal').textContent = state.perCard;
  perCardEl.oninput = () => { state.perCard = Number(perCardEl.value); $('perCardVal').textContent = state.perCard; save(); };
  perCardEl.onchange = () => { perCardEl.blur(); (mode === 'cards' ? cardA : cardB).show(nextWords()); };
  $('pickBtn').onclick = () => { doPick(); $('okBtn').disabled = $('badBtn').disabled = false; };
  $('okBtn').onclick = () => record(true);
  $('badBtn').onclick = () => record(false);

  document.addEventListener('keydown', e => {
    const t = e.target;
    if (!$('adminModal').hidden || mode === 'settings' || (t && t.matches && t.matches('input,textarea,select'))) return;
    // a focused button would also fire click on space/enter keyup; drop focus first
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
    const k = e.key;
    if (k === ' ' || k === 'Enter') { e.preventDefault(); (mode === 'cards' ? cardA : cardB).flip(); }
    else if (k === 'ArrowRight' || k.toLowerCase() === 'n') { e.preventDefault(); (mode === 'cards' ? $('nextA') : $('nextB')).click(); }
    else if (mode === 'pick' && k.toLowerCase() === 'p') { e.preventDefault(); $('pickBtn').click(); }
    else if (mode === 'pick' && k === '1') { $('okBtn').click(); }
    else if (mode === 'pick' && k === '2') { $('badBtn').click(); }
  });

  // ---------- init ----------
  applyAdmin(); renderTopics(); buildDeck(); renderLog(); renderProb();
  $('okBtn').disabled = $('badBtn').disabled = true;
  cardA.show(nextWords());
})();
