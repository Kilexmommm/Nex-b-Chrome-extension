export function canCloseDialog(id, state) {
  return !state.saving && !(id === 'recaptureDialog' && state.recaptureBusy)
    && !(id === 'bookmarksDialog' && state.bookmarkBusy)
    && !(id === 'accessDialog' && state.imageBusy)
    && !(id === 'windowsDialog' && state.windowsBusy);
}
export function bindDialogDismiss(dialog, state, onDismiss = () => dialog.close()) {
  const form = dialog.querySelector('form');
  let close = dialog.querySelector('.dialog-close');
  if (!close) {
    close = dialog.ownerDocument.createElement('button');
    close.type = 'button'; close.className = 'dialog-close'; close.textContent = '×';
    close.setAttribute('data-cancel', '');
    close.setAttribute('aria-label', 'Cerrar ' + dialog.querySelector('h2').textContent);
    form.prepend(close);
  }
  const dismiss = () => { if (canCloseDialog(dialog.id, state())) onDismiss(); };
  dialog.querySelectorAll('[data-cancel]').forEach(control => control.onclick = dismiss);
  const outside = event => {
    const rect = dialog.getBoundingClientRect();
    return event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
  };
  let startedOutside = false;
  dialog.addEventListener('pointerdown', event => { startedOutside = outside(event); });
  dialog.addEventListener('click', event => { if (startedOutside && outside(event)) dismiss(); startedOutside = false; });
  dialog.addEventListener('close', () => { startedOutside = false; });
  dialog.ownerDocument.addEventListener('keydown', event => {
    if (dialog.open && event.key === 'Escape' && !canCloseDialog(dialog.id, state())) {
      event.preventDefault(); event.stopPropagation();
    }
  }, true);
  dialog.addEventListener('cancel', event => { if (!canCloseDialog(dialog.id, state())) event.preventDefault(); });
}
