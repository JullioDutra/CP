// MODO CLÁSSICO — Sudoku
// Preencha a grade 9×9 para que cada linha, coluna e bloco 3×3 tenha os números de 1 a 9.
import { h, createTimer, fmtTime, toast, hud } from '../../core/ui.js';
import { DIFFICULTY, sudokuScore, SUDOKU_ERROR_PENALTY as ERROR_PENALTY } from '../../core/sudoku.js';
import { setupSudoku, newSeed } from '../../core/solo-verify.js';
import { startOnline } from '../../core/online-solo.js';

const MAX_ERRORS = 3;
export { sudokuScore };

export default {
  id: 'classico-sudoku',
  category: 'classico',
  name: 'Sudoku',
  icon: '🔢',
  tagline: 'Lógica 9×9 · Fácil, Médio ou Difícil',
  options: { key: 'difficulty', label: 'Dificuldade', choices: Object.entries(DIFFICULTY).map(([k, v]) => [k, v.label]), default: 'medio' },
  rankingKey: (opts) => `classico-sudoku-${opts.difficulty}`,
  rankingVariants: Object.entries(DIFFICULTY).map(([k, v]) => [`classico-sudoku-${k}`, v.label]),
  globalRanking: true,
  globalVariant: (opts) => opts.difficulty || 'medio',
  // pede a semente ao servidor para a partida valer no ranking global
  prepare: (opts) => startOnline('classico-sudoku', { variante: opts.difficulty || 'medio' }),
  rules: [
    'Cada linha, coluna e bloco 3×3 precisa ter os números de 1 a 9, sem repetir.',
    'Toque numa casa e escolha o número (ou use o teclado). Modo "Notas" para rascunho.',
    `Pontos: base da dificuldade − 2 por segundo − ${ERROR_PENALTY} por erro (mínimo 100).`,
    `Com ${MAX_ERRORS} erros a partida termina.`,
  ],
  start(root, api, opts) {
    const online = opts.online?.seed != null ? opts.online : null;
    const difficulty = online?.variante || opts.difficulty || 'medio';
    const { puzzle, solution } = setupSudoku(online ? online.seed : newSeed(), difficulty);
    const board = puzzle.slice();
    const notes = Array.from({ length: 81 }, () => new Set());
    let selected = board.indexOf(0);
    let errors = 0;
    let notesMode = false;
    let ended = false;

    const top = hud([['time', 'Tempo'], ['errors', 'Erros'], ['score', 'Pontos agora']]);
    top.set('errors', `0/${MAX_ERRORS}`);
    const grid = h('div', { class: 'board sudoku', style: '--n:9' });
    const cells = puzzle.map((v, i) =>
      h('button', { class: `scell ${v ? 'given' : ''}`, type: 'button', 'data-i': i, onclick: () => { selected = i; paint(); } })
    );
    grid.append(...cells);

    function paint() {
      const sv = board[selected];
      cells.forEach((c, i) => {
        const r = Math.floor(i / 9), col = i % 9;
        const sr = Math.floor(selected / 9), sc = selected % 9;
        const peer = r === sr || col === sc || (Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(col / 3) === Math.floor(sc / 3));
        c.classList.toggle('selected', i === selected);
        c.classList.toggle('peer', peer && i !== selected);
        c.classList.toggle('same', !!sv && board[i] === sv && i !== selected);
        c.classList.toggle('br', col === 2 || col === 5);
        c.classList.toggle('bb', r === 2 || r === 5);
        if (board[i]) c.textContent = board[i];
        else if (notes[i].size) {
          c.replaceChildren(h('div', { class: 'notes' }, [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => h('span', {}, notes[i].has(n) ? n : ''))));
        } else c.textContent = '';
      });
      pad.querySelectorAll('[data-n]').forEach((b) => {
        const n = Number(b.dataset.n);
        b.disabled = board.filter((v) => v === n).length >= 9;
      });
    }

    function input(n) {
      if (ended || puzzle[selected] || board[selected]) return;
      if (n === 0) { notes[selected].clear(); paint(); return; }
      if (notesMode) {
        notes[selected].has(n) ? notes[selected].delete(n) : notes[selected].add(n);
        paint();
        return;
      }
      if (solution[selected] === n) {
        board[selected] = n;
        cells[selected].classList.add('ok');
        // limpa notas desse número nos vizinhos
        const r = Math.floor(selected / 9), c = selected % 9;
        notes.forEach((s, i) => {
          const ri = Math.floor(i / 9), ci = i % 9;
          if (ri === r || ci === c || (Math.floor(ri / 3) === Math.floor(r / 3) && Math.floor(ci / 3) === Math.floor(c / 3))) s.delete(n);
        });
        paint();
        if (!board.includes(0)) finish(true);
      } else {
        errors++;
        top.set('errors', `${errors}/${MAX_ERRORS}`);
        cells[selected].classList.add('wrong');
        setTimeout(() => cells[selected]?.classList.remove('wrong'), 500);
        toast(root, `Erro! −${ERROR_PENALTY}`, 'bad');
        if (errors >= MAX_ERRORS) finish(false);
      }
    }

    const notesBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => { notesMode = !notesMode; notesBtn.classList.toggle('on', notesMode); notesBtn.textContent = notesMode ? 'Notas: ligado' : 'Notas: desligado'; } }, 'Notas: desligado');
    const pad = h(
      'div',
      { class: 'numpad' },
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => h('button', { class: 'btn num', type: 'button', 'data-n': n, onclick: () => input(n) }, n)),
      h('button', { class: 'btn ghost num', type: 'button', onclick: () => input(0) }, '⌫')
    );

    function onKey(e) {
      if (/^[1-9]$/.test(e.key)) input(Number(e.key));
      else if (e.key === 'Backspace' || e.key === 'Delete') input(0);
      else if (e.key.toLowerCase() === 'n') notesBtn.click();
      else {
        const mv = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
        if (mv) { e.preventDefault(); selected = (selected + mv + 81) % 81; paint(); }
      }
    }
    document.addEventListener('keydown', onKey);

    const timer = createTimer({
      onTick: (_, el) => { top.set('time', fmtTime(el)); top.set('score', sudokuScore(difficulty, el, errors)); },
    });

    function finish(solved) {
      if (ended) return;
      ended = true;
      timer.stop();
      document.removeEventListener('keydown', onKey);
      grid.classList.add('disabled');
      const secs = Math.round(timer.elapsed);
      const score = solved ? sudokuScore(difficulty, secs, errors) : 0;
      api.end({
        score,
        summary: [['Dificuldade', DIFFICULTY[difficulty].label], ['Tempo', fmtTime(secs)], ['Erros', errors], ['Resultado', solved ? 'Resolvido!' : 'Não resolvido']],
        extra: solved ? null : h('p', {}, 'Só partidas resolvidas entram no ranking.'),
        online: online && solved && { ticket: online.ticket, log: { solved, board: board.slice(), errors, seconds: secs } },
      });
    }

    root.append(
      top.el,
      h('div', { class: 'play-area' }, grid, h('div', { class: 'side' }, pad, notesBtn)),
      h('div', { class: 'row-actions' }, h('button', { class: 'btn ghost', onclick: () => finish(false) }, 'Desistir'))
    );
    paint();
    return () => { timer.stop(); document.removeEventListener('keydown', onKey); };
  },
};
