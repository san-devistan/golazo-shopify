/* GOLAZO lightweight wishlist: toggles a liked state + persists to localStorage.
   No backend required — purely client-side "like" with a filled-heart state. */
(function () {
  var KEY = 'golazo:wishlist';
  var SEL = '.product-card__wishlist, .golazo-wishlist';

  function read() {
    try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); }
    catch (e) { return new Set(); }
  }
  function write(set) {
    try { localStorage.setItem(KEY, JSON.stringify(Array.from(set))); }
    catch (e) {}
  }
  function idFor(btn) {
    var directId = btn.getAttribute('data-product-id');
    if (directId && directId !== '') return directId;
    var el = btn.closest('[data-product-id]');
    var id = el && el.getAttribute('data-product-id');
    return id && id !== '' ? id : null;
  }
  function applyState(btn, on) {
    btn.classList.toggle('is-liked', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    var label = btn.getAttribute(on ? 'data-wishlist-remove-label' : 'data-wishlist-add-label');
    if (label) btn.setAttribute('aria-label', label);
  }
  function mark(root) {
    var liked = read();
    (root || document).querySelectorAll(SEL).forEach(function (btn) {
      var id = idFor(btn);
      if (!id) return;
      applyState(btn, liked.has(id));
    });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest(SEL);
    if (!btn) return;
    var id = idFor(btn);
    if (!id) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    var liked = read();
    if (liked.has(id)) { liked.delete(id); }
    else { liked.add(id); }
    write(liked);
    applyState(btn, liked.has(id));
  });

  function init() { mark(document); }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);

  // Re-mark cards added later (infinite scroll, section re-render).
  try {
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var nodes = muts[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          if (nodes[j].nodeType === 1) mark(nodes[j]);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  } catch (e) {}
})();
