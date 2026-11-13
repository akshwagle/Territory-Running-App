import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';

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
    await bars.setStyle({ style: SystemBarsStyle.Light });
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
