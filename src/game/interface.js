(() => {
  const map = window.mapgl, runtime = window.driftCarRuntime;
  if (!map || !runtime) return;
  const wasHidden = window.driftInterface?.getState().hidden || false;
  window.driftInterface?.destroy();
  const canvas = map.getCanvas(), container = map.getContainer();
  canvas.setAttribute('data-drift-scene', '');
  container.setAttribute('data-drift-scene-container', '');
  let hidden = false, previousFocus, wasActive = false, savedViewport;
  const originalInvalidate = map._impl.invalidateSize;
  map._impl.invalidateSize = function(...args) {if (hidden) this.state.viewport = {top:0,right:0,bottom:0,left:0};return originalInvalidate.apply(this,args);};
  const style = document.createElement('style');
  style.textContent = `
    html.drift-clean-view body * {visibility:hidden!important;pointer-events:none!important}
    html.drift-clean-view [data-drift-scene] {visibility:visible!important;pointer-events:auto!important}
    html.drift-clean-view [data-drift-scene-container] {position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important}
    #drift-welcome {box-sizing:border-box;width:min(560px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;padding:30px;border:1px solid #ffffff25;border-radius:20px;background:#141a23;color:#f5f7fa;box-shadow:0 24px 80px #0008;font:15px/1.5 'Segoe UI',sans-serif;overscroll-behavior:contain}
    #drift-welcome::backdrop {background:#060b1499;backdrop-filter:blur(4px)}
    #drift-welcome h1 {margin:8px 0 10px;font-size:28px;line-height:1.2;font-weight:650;letter-spacing:-.5px}
    #drift-welcome p {margin:0 0 20px;color:#c2ccd7}
    #drift-welcome .drift-eyebrow {margin:0;font-size:12px;font-weight:650;letter-spacing:1.5px;color:#75eaa3}
    #drift-welcome .drift-controls {display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:20px 0}
    #drift-welcome .drift-control {padding:12px;border:1px solid #ffffff15;border-radius:10px;background:#ffffff05}
    #drift-welcome kbd {font:600 13px/1.4 'Segoe UI',sans-serif;display:inline-block;padding:3px 8px;margin-bottom:5px;border:1px solid #ffffff30;border-bottom-width:2px;border-radius:5px;background:#ffffff09;color:#fff}
    #drift-welcome .drift-control span {display:block;color:#c2ccd7;font-size:13px}
    #drift-welcome .drift-footnote {font-size:13px;margin-bottom:18px}
    #drift-welcome label {display:flex;align-items:center;gap:9px;margin:18px 0;color:#c2ccd7;font-size:13px}
    #drift-welcome input {accent-color:#75eaa3;width:17px;height:17px}
    #drift-welcome button {width:100%;min-height:46px;border:0;border-radius:10px;background:#75eaa3;color:#102319;font:650 15px 'Segoe UI',sans-serif;cursor:pointer;transition:background .15s,transform .15s}
    #drift-welcome button:hover {background:#9af2bd}
    #drift-welcome button:active {transform:scale(.96)}
    #drift-welcome :focus-visible {outline:3px solid #a6caff;outline-offset:4px}
    @media(max-width:420px) {#drift-welcome{padding:22px}#drift-welcome h1{font-size:25px}#drift-welcome .drift-controls{gap:8px}}
    @media(prefers-reduced-motion:reduce) {#drift-welcome button{transition:none}}
  `;
  document.head.append(style);
  const dialog = document.createElement('dialog');
  dialog.id = 'drift-welcome';
  dialog.setAttribute('aria-labelledby', 'drift-welcome-title');
  dialog.setAttribute('aria-describedby', 'drift-welcome-intro');
  dialog.innerHTML = `
    <p class="drift-eyebrow">2GIS DRIFT</p>
    <h1 id="drift-welcome-title">Привет! Город ждёт.</h1>
    <p id="drift-welcome-intro">Садись за руль и выбирай свой маршрут. Исследуй знакомые улицы, разгоняйся и пробуй дрифт.</p>
    <div class="drift-controls">
      <div class="drift-control"><kbd>W A S D</kbd><span>Газ, тормоз и повороты</span></div>
      <div class="drift-control"><kbd>Пробел</kbd><span>Ручник для дрифта</span></div>
      <div class="drift-control"><kbd>Мышь</kbd><span>Обзор вокруг машины</span></div>
      <div class="drift-control"><kbd>F</kbd><span>Освободить или захватить курсор</span></div>
      <div class="drift-control"><kbd>R</kbd><span>Вернуть машину на колёса</span></div>
      <div class="drift-control"><kbd>H</kbd><span>Скрыть весь интерфейс и вернуть его</span></div>
    </div>
    <p class="drift-footnote"><strong>B</strong> — выбрать место на карте. <strong>Esc</strong> — выйти из управления. Цвет кузова и настройки камеры доступны в панели игры.</p>
    <label><input id="drift-welcome-repeat" type="checkbox" checked>Показывать приветствие при запуске</label>
    <button type="button" autofocus>Начать поездку</button>
  `;
  document.body.append(dialog);
  const checkbox = dialog.querySelector('input'), start = dialog.querySelector('button');
  try {checkbox.checked = localStorage.getItem('2gis-drift-welcome') !== 'hidden';} catch {}
  function resize() {requestAnimationFrame(() => {map.invalidateSize(); map.triggerRerender();});}
  function closeWelcome(drive = false) {
    if (!dialog.open) return;
    try {localStorage.setItem('2gis-drift-welcome', checkbox.checked ? 'show' : 'hidden');} catch {}
    dialog.close();
    if (previousFocus?.isConnected) previousFocus.focus({preventScroll: true});
    if (drive || wasActive) {
      document.activeElement?.blur(); runtime.setActive(true);
      if (drive && document.pointerLockElement !== canvas) runtime.toggleCursor();
    }
  }
  function setHidden(value) {
    if (value && dialog.open) closeWelcome(false);
    const next = !!value;
    if (next && !hidden) savedViewport = {...map._impl.state.viewport};
    if (!next && hidden && savedViewport) map._impl.state.viewport = savedViewport;
    hidden = next;
    if (hidden) document.activeElement?.blur();
    document.documentElement.classList.toggle('drift-clean-view', hidden);
    resize();
  }
  function showWelcome() {
    setHidden(false);
    previousFocus = document.activeElement; wasActive = runtime.getState().active;
    if (document.pointerLockElement) document.exitPointerLock();
    runtime.setActive(false);
    if (!dialog.open) dialog.showModal();
    start.focus();
  }
  start.addEventListener('click', () => closeWelcome(true));
  dialog.addEventListener('cancel', event => {event.preventDefault(); closeWelcome(false);});
  dialog.addEventListener('pointerdown', event => event.stopPropagation());
  const keydown = event => {
    if (event.code !== 'KeyH' || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.target.closest?.('textarea,[contenteditable="true"],input:not([type="checkbox"]):not([type="color"]):not([type="range"])')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!event.repeat) setHidden(!hidden);
  };
  window.addEventListener('keydown', keydown, true);
  const help = document.createElement('button');
  help.type = 'button'; help.textContent = 'Как играть';
  help.style.cssText = 'margin:6px 0;padding:6px 10px;cursor:pointer';
  help.addEventListener('click', showWelcome);
  document.querySelector('#drift-car-settings')?.append(help);
  window.driftInterface = {showWelcome, setHidden, getState: () => ({hidden, welcomeOpen: dialog.open}), destroy() {
    if (dialog.open) dialog.close();
    if (hidden && savedViewport) map._impl.state.viewport = savedViewport;
    hidden = false; map._impl.invalidateSize = originalInvalidate;
    document.documentElement.classList.remove('drift-clean-view');
    canvas.removeAttribute('data-drift-scene'); container.removeAttribute('data-drift-scene-container');
    window.removeEventListener('keydown', keydown, true);
    help.remove(); dialog.remove(); style.remove(); resize();
  }};
  if (wasHidden) setHidden(true);
  else if (checkbox.checked) showWelcome();
})();
