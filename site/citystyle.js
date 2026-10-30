// Mirror World v3 — city look presets + time-of-day toggle (written by Tab; Freebuff was out of daily hours for v3).
(function () {
  'use strict';
  const FACADES = {
    // Hyderabad walls: whitewash, cream, sandstone and the pastel pinks / mints / yellows / blues of real houses
    facades: ['#f3eee6', '#efe3cf', '#e6d3b3', '#f2d3c8', '#d9e8d8', '#f3e5b0', '#d6e2ee', '#ead0b8'],
    glass: ['#5a8299', '#6d93a3', '#4d6f88', '#86a6b0'],
    roofs: ['#bdb7ad', '#aaa59d', '#c9c1b2', '#b49c8c'],
    windowDay: '#3b4b5a',
    windowLit: '#ffc26a'
  };
  const TIMES = {
    day:   { sun: [-0.62, 0.42, 0.66], sunColor: '#fff0d6', sunI: 0.78, ambient: '#c3cfdc', ambI: 0.62, fog: '#b9c7d2', night: 0, shadow: 0.42 },
    dusk:  { sun: [-0.85, 0.2, 0.32], sunColor: '#ffad66', sunI: 0.72, ambient: '#7d86a8', ambI: 0.5, fog: '#c98c6e', night: 0.5, shadow: 0.38 },
    night: { sun: [-0.3, 0.45, 0.85], sunColor: '#6f86c0', sunI: 0.16, ambient: '#2c3958', ambI: 0.42, fog: '#0f1a2c', night: 1, shadow: 0 }
  };
  const SKY = {
    day:   { 'sky-color': '#5d9fd6', 'horizon-color': '#dfe9ef', 'fog-color': '#b9c7d2', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.45, 'atmosphere-blend': 0.75 },
    dusk:  { 'sky-color': '#2d3a66', 'horizon-color': '#ff9a5a', 'fog-color': '#c98c6e', 'sky-horizon-blend': 0.55, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.4, 'atmosphere-blend': 0.7 },
    night: { 'sky-color': '#050a18', 'horizon-color': '#1d2c4d', 'fog-color': '#0f1a2c', 'sky-horizon-blend': 0.5, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.35, 'atmosphere-blend': 0.5 }
  };
  function createTimeToggle(container, onChange, initial) {
    const wrap = document.createElement('div');
    wrap.className = 'tod-toggle'; wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', 'Time of day');
    const items = [['day', '☀️', 'Day'], ['dusk', '🌇', 'Dusk'], ['night', '🌙', 'Night']];
    const btns = {};
    items.forEach(([k, icon, label]) => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.time = k;
      b.innerHTML = '<span aria-hidden="true">' + icon + '</span><span class="tod-word">' + label + '</span>'; b.setAttribute('aria-label', label); b.title = label;
      b.addEventListener('click', (e) => { e.stopPropagation(); set(k); onChange && onChange(k); });
      wrap.appendChild(b); btns[k] = b;
    });
    function set(k) { Object.entries(btns).forEach(([n, b]) => { const on = n === k; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); }
    set(initial || 'day');
    container.appendChild(wrap);
    return { set, el: wrap };
  }
  window.MirrorStyle = { FACADES, TIMES, SKY, createTimeToggle };
})();
