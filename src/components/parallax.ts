// Parallax: each layer marked `data-parallax` moves at its own speed as the page scrolls and
// leans slightly towards the pointer. With "reduce motion" it is damped, not removed.
const layers = [...document.querySelectorAll<HTMLElement>("[data-parallax]")];
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
const pointer = { x: 0, y: 0 };
let queued = false;

function update() {
  queued = false;
  const strength = reduce.matches ? 0.3 : 1;
  for (const layer of layers) {
    const host = layer.parentElement;
    if (!host) continue;
    const rect = host.getBoundingClientRect();
    // Far off screen: nothing to draw.
    if (rect.bottom < -300 || rect.top > innerHeight + 300) continue;
    const speed = Number(layer.dataset.parallax);
    const offset = rect.top + rect.height / 2 - innerHeight / 2;
    const y = -offset * speed * strength + pointer.y * speed * 40 * strength;
    const x = pointer.x * speed * 40 * strength;
    layer.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }
}

// One update per frame, however many scroll or pointer events arrive.
const schedule = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(update);
};

window.addEventListener("scroll", schedule, { passive: true });
window.addEventListener("resize", schedule);
window.addEventListener(
  "pointermove",
  (event) => {
    pointer.x = event.clientX / innerWidth - 0.5;
    pointer.y = event.clientY / innerHeight - 0.5;
    schedule();
  },
  { passive: true },
);
reduce.addEventListener("change", schedule);
update();
