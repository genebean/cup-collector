document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.createElement('div');
  overlay.className = 'img-lightbox';
  overlay.hidden = true;
  const img = document.createElement('img');
  overlay.appendChild(img);
  document.body.appendChild(overlay);

  const close = () => { overlay.hidden = true; img.src = ''; };
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  document.querySelectorAll('.phone-screenshot').forEach((el) => {
    el.classList.add('img-zoomable');
    el.addEventListener('click', () => {
      img.src = el.src;
      img.alt = el.alt;
      overlay.hidden = false;
    });
  });
});
