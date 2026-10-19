// Not a page: what the static settlement pages load to offer a PDF. It only
// shows the button and waits for a click; the dialog, pdfmake and the fonts
// come after that, so a page nobody exports costs a few hundred bytes.
const button = document.querySelector<HTMLButtonElement>('[data-pdf-export]');
if (button && document.getElementById('pdf-data')) {
  button.hidden = false;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const { openPdfDialog } = await import('./pdf/dialog');
      openPdfDialog({ level: 'settlement', lang: document.documentElement.lang === 'en' ? 'en' : 'hu' });
    } finally {
      button.disabled = false;
    }
  });
}
