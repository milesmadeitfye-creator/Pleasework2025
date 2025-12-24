export function openSpotify(trackId: string) {
  const scheme = `spotify://track/${trackId}`;
  const universal = `https://open.spotify.com/track/${trackId}`;

  const a = document.createElement('a');
  a.href = scheme;
  a.style.display = 'none';
  a.setAttribute('rel', 'noopener');
  a.setAttribute('target', '_self');
  document.body.appendChild(a);

  const t = setTimeout(() => {
    window.location.href = universal;
  }, 800);

  const onVis = () => {
    if (document.hidden) {
      clearTimeout(t);
      cleanup();
    }
  };
  const cleanup = () => {
    document.removeEventListener('visibilitychange', onVis);
    a.remove();
  };

  document.addEventListener('visibilitychange', onVis, { passive: true });

  a.click();
  setTimeout(cleanup, 2000);
}
