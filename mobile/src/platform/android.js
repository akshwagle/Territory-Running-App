import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';

// Dark bars content (light icons) on the dark theme, dark icons on the light theme.
export async function syncSystemBars(theme, { platform = Capacitor.getPlatform(), bars = SystemBars } = {}) {
  if (platform !== 'android') return;
  try { await bars.setStyle({ style: theme === 'light' ? SystemBarsStyle.Light : SystemBarsStyle.Dark }); } catch { /* Bars keep their last style. */ }
}

// SystemBars handles both system and IME window insets. Do not additionally
// subtract keyboardHeight or enable Keyboard.resizeOnFullScreen.
export async function watchPlatform({ platform = Capacitor.getPlatform(), bars = SystemBars,
  keyboard = Keyboard, document: doc = document, schedule = requestAnimationFrame } = {}) {
  if (platform !== 'android') return () => {};
  const handles = [];
  function revealField() {
    const field = doc.activeElement;
    if (field?.matches('input, textarea, select')) field.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }
  function shown() {
    doc.documentElement.dataset.keyboardOpen = '';
    schedule(revealField);
  }
  function hidden() { delete doc.documentElement.dataset.keyboardOpen; }
  const focus = () => { if ('keyboardOpen' in doc.documentElement.dataset) schedule(revealField); };
  try {
    await syncSystemBars(doc.documentElement.dataset.theme, { platform, bars });
    handles.push(await keyboard.addListener('keyboardDidShow', shown));
    handles.push(await keyboard.addListener('keyboardDidHide', hidden));
    doc.addEventListener('focusin', focus);
    return () => {
      doc.removeEventListener('focusin', focus);
      for (const handle of handles) handle.remove();
      hidden();
    };
  } catch (error) {
    for (const handle of handles) handle.remove();
    hidden();
    throw error;
  }
}
