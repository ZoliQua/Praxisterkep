// Entry of the static settlement pages' story (built on its own by
// vite.config.ts as `staticstory`). It is only the doorman: it keeps the
// story's room on the page so nothing jumps when it arrives, and loads the
// canvas code, its stylesheet and the hand font (components/story/
// staticStory.ts) only when a story is about to scroll into view.
import { storyHeight } from './components/story/player';

const CONTROLS = 49; // the control bar under the canvas, in CSS pixels

function reserve(host: HTMLElement): void {
  if (host.querySelector('.cutstory__frame')) return;
  const frame = document.createElement('div');
  frame.className = 'cutstory__frame';
  // the room the canvas and its controls will take, before the stylesheet is here
  frame.style.height = `${Math.round(storyHeight(host.getBoundingClientRect().width)) + CONTROLS}px`;
  host.prepend(frame);
}

function start(): void {
  const hosts = [...document.querySelectorAll<HTMLElement>('[data-story]')];
  if (!hosts.length) return;
  hosts.forEach(reserve);
  let loading = false;
  const load = () => {
    if (loading) return;
    loading = true;
    void import('./components/story/staticStory').then((m) => m.mountAll()).catch(() => {});
  };
  if (typeof IntersectionObserver === 'undefined') { load(); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); load(); }
  }, { rootMargin: '600px 0px' });
  hosts.forEach((h) => io.observe(h));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
