(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function create(map, opts = {}) {
    const stops = Array.isArray(opts.stops) ? opts.stops : [];
    let playing = false;
    let leg = 0;
    let frame = 0;
    let timer = 0;
    let lastYear = null;

    const now = () => (window.performance && performance.now ? performance.now() : Date.now());
    const distanceKm = (a, b) => {
      const rad = Math.PI / 180;
      const lat1 = a[1] * rad;
      const lat2 = b[1] * rad;
      const dLat = (b[1] - a[1]) * rad;
      const dLng = (b[0] - a[0]) * rad;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
    };

    function cancel() {
      if (frame) cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      frame = 0;
      timer = 0;
    }

    function stop() {
      const was = playing;
      playing = false;
      cancel();
      if (map && typeof map.stop === 'function') map.stop();
      if (was && typeof opts.onStop === 'function') opts.onStop(); // Tab: let the page reset its Play button
    }

    function finish() {
      if (!playing) return;
      playing = false;
      cancel();
      if (typeof opts.onEnd === 'function') opts.onEnd();
    }

    function animateYear(from, to, start, duration) {
      if (typeof opts.onYear !== 'function' || !Number.isFinite(+to)) return;
      const origin = Number.isFinite(+from) ? +from : +to;
      const delta = +to - origin;
      const update = (time) => {
        if (!playing) return;
        const progress = Math.min(1, Math.max(0, (time - start) / duration));
        const value = Math.round(origin + delta * progress);
        if (value !== lastYear) {
          lastYear = value;
          opts.onYear(value);
        }
        if (progress < 1) frame = requestAnimationFrame(update);
      };
      frame = requestAnimationFrame(update);
    }

    function orbit(stopAt) {
      if (!playing) return;
      const hold = Math.max(0, Number(stopAt.hold) || 0);
      if (reducedMotion.matches || hold === 0) {
        nextLeg();
        return;
      }
      const bearing = Number.isFinite(+stopAt.bearing) ? +stopAt.bearing : map.getBearing();
      map.easeTo({ bearing: bearing + 25, duration: hold, easing: (t) => t, essential: true });
      timer = setTimeout(() => {
        timer = 0;
        nextLeg();
      }, hold);
    }

    function nextLeg() {
      if (!playing) return;
      if (leg >= stops.length) {
        finish();
        return;
      }

      const previous = leg ? stops[leg - 1] : null;
      const destination = stops[leg++];
      if (typeof opts.onCaption === 'function') opts.onCaption(destination.name);
      const start = previous && Number.isFinite(+previous.year) ? +previous.year : (Number.isFinite(+destination.year) ? +destination.year : NaN);
      const end = Number.isFinite(+destination.year) ? +destination.year : start;
      const fromCenter = previous && previous.center ? previous.center : map.getCenter().toArray();
      const meters = distanceKm(fromCenter, destination.center);
      const duration = Math.max(2500, Math.min(6000, 2500 + meters * 36));
      const startTime = now();

      const camera = {
        center: destination.center,
        zoom: destination.zoom,
        pitch: destination.pitch,
        bearing: destination.bearing,
        curve: 1.2,
        duration,
        essential: true
      };
      if (reducedMotion.matches) {
        map.jumpTo(camera);
        if (typeof opts.onYear === 'function' && Number.isFinite(+end) && Math.round(+end) !== lastYear) {
          lastYear = Math.round(+end);
          opts.onYear(lastYear);
        }
        orbit(destination);
      } else {
        animateYear(start, end, startTime, duration);
        map.flyTo(camera);
        timer = setTimeout(() => {
          timer = 0;
          if (!playing) return;
          orbit(destination);
        }, duration);
      }
    }

    function onGesture() { if (playing) stop(); } // Tab: only when playing; map.stop() on every touch was cancelling the user's own pinch/drag
    const canvas = map && typeof map.getCanvasContainer === 'function' ? map.getCanvasContainer() : null;
    if (canvas) ['mousedown', 'touchstart', 'wheel'].forEach((eventName) => canvas.addEventListener(eventName, onGesture, { passive: true }));

    return {
      play() {
        if (playing || !stops.length) return;
        playing = true;
        leg = 0;
        lastYear = null;
        nextLeg();
      },
      stop,
      isPlaying() { return playing; }
    };
  }

  window.MirrorTour = { create };
})();
