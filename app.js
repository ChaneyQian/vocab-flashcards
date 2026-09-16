(() => {
  const TOPICS = window.VOCAB_DATA || [];
  const DEFAULT_ROSTER = (window.STUDENT_DATA || []).map(s => ({ name: s.name, score: s.score, excluded: false }));
  const LS_KEY = 'vocab-flash-v1';

  // ---------- state ----------
  const defaults = () => ({
    cutoff: 30,
    topics: TOPICS.map(t => t.name),
    dir: 'en',
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
      show(w) {
        current = w;
        el.classList.remove('flipped');
        if (!w) { el.classList.add('empty'); return; }
        el.classList.remove('empty');
        const dir = state.dir === 'mix' ? (Math.random() < 0.5 ? 'en' : 'zh') : state.dir;
        const front = dir === 'en' ? w.en : w.zh, back = dir === 'en' ? w.zh : w.en;
        // change content after the flip-back animation has hidden the back face
        const set = () => {
          el.querySelectorAll('.tag').forEach(t => t.textContent = w.topic);
          el.querySelector('.front .side').textContent = dir === 'en' ? 'English' : '中文';
          el.querySelector('.back .side').textContent = dir === 'en' ? '中文' : 'English';
          el.querySelector('.front .word').textContent = front;
          el.querySelector('.back .word').textContent = back;
        };
        set();
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
        cardB.show(nextWord());
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
    const w = cardB.word;
    if (!lastPicked || !w) return;
    state.log.push({ t: Date.now(), name: lastPicked, en: w.en, zh: w.zh, ok });
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

  // ---------- buttons / keys ----------
  $('flipA').onclick = () => cardA.flip();
  $('nextA').onclick = () => cardA.show(nextWord());
  $('flipB').onclick = () => cardB.flip();
  $('nextB').onclick = () => { cardB.show(nextWord()); $('okBtn').disabled = $('badBtn').disabled = !lastPicked; };
  $('pickBtn').onclick = () => { doPick(); $('okBtn').disabled = $('badBtn').disabled = false; };
  $('okBtn').onclick = () => record(true);
  $('badBtn').onclick = () => record(false);

  document.addEventListener('keydown', e => {
    const t = e.target;
    if (mode === 'settings' || (t && t.matches && t.matches('input,textarea,select'))) return;
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
  renderTopics(); buildDeck(); renderLog(); renderProb();
  $('okBtn').disabled = $('badBtn').disabled = true;
  cardA.show(nextWord());
})();
