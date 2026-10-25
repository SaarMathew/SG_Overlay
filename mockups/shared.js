// Mockup helper: scale the 1920x1080 stage down when the window is smaller (no effect in OBS at 1080p)
(() => {
  const stage = document.getElementById('stage');
  const fit = () => {
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = s < 0.999 ? `scale(${s})` : '';
  };
  addEventListener('resize', fit);
  fit();
})();
