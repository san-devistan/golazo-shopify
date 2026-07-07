/* GOLAZO lightweight wishlist: toggles a liked state + persists to localStorage.
   No backend required — purely client-side "like" with a filled-heart state. */
(function () {
  var KEY = 'golazo:wishlist';
  var ITEM_KEY = 'golazo:wishlist:items';
  var SEL = '.product-card__wishlist, .golazo-wishlist';
  var isRenderingDrawer = false;

  function read() {
    try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); }
    catch (e) { return new Set(); }
  }
  function write(set) {
    try { localStorage.setItem(KEY, JSON.stringify(Array.from(set))); }
    catch (e) {}
  }
  function readItems() {
    try {
      var raw = JSON.parse(localStorage.getItem(ITEM_KEY) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch (e) {
      return {};
    }
  }
  function writeItems(items) {
    try { localStorage.setItem(ITEM_KEY, JSON.stringify(items)); }
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
  function itemFor(btn) {
    var id = idFor(btn);
    if (!id) return null;
    return {
      id: id,
      title: btn.getAttribute('data-product-title') || '',
      url: btn.getAttribute('data-product-url') || '',
      image: btn.getAttribute('data-product-image') || '',
      price: btn.getAttribute('data-product-price') || ''
    };
  }
  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (char) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char];
    });
  }
  function updateTriggerCount(count) {
    document.querySelectorAll('[data-wishlist-drawer-trigger]').forEach(function (btn) {
      var drawer = document.getElementById('wishlist-drawer');
      btn.setAttribute('aria-expanded', drawer && drawer.hasAttribute('open') ? 'true' : 'false');
      btn.setAttribute('data-wishlist-count', String(count));
    });
  }
  function renderDrawer() {
    var drawer = document.querySelector('[data-wishlist-drawer]');
    if (!drawer) return;
    var list = drawer.querySelector('[data-wishlist-list]');
    var empty = drawer.querySelector('[data-wishlist-empty]');
    var count = drawer.querySelector('[data-wishlist-count]');
    if (!list || !empty) return;

    isRenderingDrawer = true;
    try {
      var liked = Array.from(read());
      var items = readItems();
      var savedText = drawer.getAttribute('data-saved-product-text') || 'Saved product';
      var html = liked.map(function (id) {
        var item = items[id] || { id: id, title: savedText, url: '', image: '', price: '' };
        var title = item.title || savedText;
        var media = item.image
          ? '<img src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(title) + '" loading="lazy">'
          : '<span class="golazo-wishlist-drawer__media-placeholder"></span>';
        var price = item.price ? '<p class="golazo-wishlist-drawer__price">' + escapeHtml(item.price) + '</p>' : '';
        var details = '<span class="golazo-wishlist-drawer__media">' + media + '</span><span class="golazo-wishlist-drawer__details"><p class="golazo-wishlist-drawer__title">' + escapeHtml(title) + '</p>' + price + '</span>';
        if (item.url) {
          return '<li><a class="golazo-wishlist-drawer__item" href="' + escapeHtml(item.url) + '">' + details + '</a></li>';
        }
        return '<li><div class="golazo-wishlist-drawer__item">' + details + '</div></li>';
      }).join('');

      list.innerHTML = html;
      empty.hidden = liked.length > 0;
      list.hidden = liked.length === 0;
      if (count) {
        count.textContent = String(liked.length);
        count.classList.toggle('visually-hidden', liked.length === 0);
      }
      updateTriggerCount(liked.length);
    } finally {
      isRenderingDrawer = false;
    }
  }
  function openDrawer() {
    renderDrawer();
    var drawer = document.getElementById('wishlist-drawer');
    if (drawer && typeof drawer.open === 'function') drawer.open();
  }
  function mark(root) {
    var liked = read();
    (root || document).querySelectorAll(SEL).forEach(function (btn) {
      var id = idFor(btn);
      if (!id) return;
      applyState(btn, liked.has(id));
    });
    updateTriggerCount(liked.size);
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest(SEL);
    if (!btn) return;
    if (btn.hasAttribute('data-wishlist-drawer-trigger')) {
      e.preventDefault();
      e.stopPropagation();
      openDrawer();
      return;
    }
    var id = idFor(btn);
    if (!id) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    var liked = read();
    var items = readItems();
    if (liked.has(id)) { liked.delete(id); }
    else {
      liked.add(id);
      var item = itemFor(btn);
      if (item) items[id] = item;
    }
    write(liked);
    writeItems(items);
    applyState(btn, liked.has(id));
    renderDrawer();
  });

  function init() {
    mark(document);
    renderDrawer();
  }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);

  // Re-mark cards added later (infinite scroll, section re-render).
  try {
    var mo = new MutationObserver(function (muts) {
      if (isRenderingDrawer) return;
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
