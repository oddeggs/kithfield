/*
 * The little the pages do in the browser: tell the Worker the moderator's time zone, pick a queue
 * row to preview, follow the picked decision on the apply button, and show a blurred item only
 * when asked. Everything also works as plain links and forms.
 */
export const clientScript = `
(() => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (zone && !document.cookie.split('; ').some((c) => c === 'tz=' + encodeURIComponent(zone))) {
    document.cookie = 'tz=' + encodeURIComponent(zone) + '; path=/; max-age=31536000; samesite=lax';
    if (!sessionStorage.getItem('tz-set')) { sessionStorage.setItem('tz-set', '1'); location.reload(); return; }
  }

  const rows = [...document.querySelectorAll('[data-row]')];
  const pick = (row) => {
    for (const r of rows) r.classList.toggle('sel', r === row);
    for (const p of document.querySelectorAll('[data-preview]')) p.hidden = p.dataset.preview !== row.dataset.row;
  };
  for (const row of rows) {
    row.addEventListener('click', (e) => { e.preventDefault(); pick(row); });
    row.addEventListener('dblclick', () => { location.href = row.getAttribute('href'); });
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter') location.href = row.getAttribute('href'); });
  }

  const search = document.querySelector('[data-search]');
  const searchBtn = document.querySelector('[data-search-toggle]');
  if (search && searchBtn) searchBtn.addEventListener('click', () => {
    search.classList.toggle('open');
    search.querySelector('input')?.focus();
  });

  const form = document.querySelector('[data-decide]');
  if (form) {
    const apply = form.querySelector('[data-apply]');
    const note = form.querySelector('[data-apply-note]');
    const rule = form.querySelector('select[name=rule]');
    const sync = () => {
      const picked = form.querySelector('input[name=action]:checked');
      if (!picked || !apply || !note) return;
      apply.textContent = picked.dataset.label;
      apply.classList.toggle('brick', Number(picked.dataset.sev) >= 2);
      const ruleFree = picked.dataset.rule === 'free';
      if (rule) rule.disabled = ruleFree;
      note.textContent = picked.dataset.note || (ruleFree ? note.dataset.free : rule?.selectedOptions[0]?.dataset.logged) || '';
    };
    form.addEventListener('change', sync);
    sync();
  }

  for (const btn of document.querySelectorAll('[data-show]')) {
    btn.addEventListener('click', () => {
      document.getElementById(btn.dataset.show)?.classList.remove('blur');
      btn.remove();
    });
  }
})();
`;
