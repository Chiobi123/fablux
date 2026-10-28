/* Product detail page.
   window.FabluXDetail.update(row) is called by backend-bridge.js's
   syncCatalog() so the page always shows the live price, picture and
   stock from the database rather than the static markup. */
(function () {
  'use strict';

  var live = null;      // last row pushed by the store
  var bound = null;     // product object handed to the cart

  function stockLine(row) {
    var el = document.querySelector('[data-stock-line]');
    if (!el || !row) return;
    var available = Math.max(0, Number(row.stock || 0) - Number(row.reserved_stock || 0));
    if (available <= 0) {
      el.textContent = 'Sold out — not taking orders right now.';
      el.style.color = '#e5534b';
    } else if (available <= 3) {
      el.textContent = 'Only ' + available + ' left — ready to ship in 2–4 business days.';
      el.style.color = '#ff9800';
    } else {
      el.textContent = available + ' available — ready to ship in 2–4 business days.';
      el.style.color = '';
    }
    return available;
  }

  function renderDetails(row) {
    var desc = document.querySelector('[data-product-description]');
    if (desc) {
      var text = String(row.description || '').trim();
      desc.textContent = text;
      desc.hidden = !text;
    }
    var materialRow = document.querySelector('[data-product-material-row]');
    var material = document.querySelector('[data-product-material]');
    if (materialRow && material) {
      var m = String(row.material || '').trim();
      material.textContent = m;
      materialRow.hidden = !m;
    }
    var features = document.querySelector('[data-product-features]');
    if (features) {
      var items = Array.isArray(row.features)
        ? row.features.filter(function (x) { return typeof x === 'string' && x.trim(); }).slice(0, 8)
        : [];
      features.textContent = '';
      items.forEach(function (x) {
        var d = document.createElement('div');
        d.textContent = x.trim();
        features.appendChild(d);
      });
      features.hidden = !items.length;
    }
  }

  function apply(row) {
    var title = document.querySelector('.product-summary h1');
    var price = document.querySelector('.product-summary .price');
    var image = document.querySelector('.gallery-main img');
    var addBtn = document.querySelector('.product-actions .btn:not(.btn-secondary)');
    if (!title || !price) return;
    if (row.name) title.textContent = row.name;
    price.textContent = '₦' + (Number(row.price) || 0).toLocaleString('en-NG');
    if (image && row.image) { image.src = row.image; image.alt = row.name || ''; }
    renderDetails(row);
    document.title = 'FabluX.U.Design | ' + (row.name || 'Product');

    var available = stockLine(row);
    if (addBtn) {
      if (available !== undefined && available <= 0) {
        addBtn.setAttribute('aria-disabled', 'true');
        addBtn.classList.add('is-disabled');
        addBtn.textContent = 'Sold out';
      } else {
        addBtn.removeAttribute('aria-disabled');
        addBtn.classList.remove('is-disabled');
        addBtn.textContent = 'Add to Cart';
      }
    }

    bound = {
      id: String(row.id),
      name: row.name || title.textContent.trim(),
      price: Number(row.price) || 0,
      category: row.category || 'FabluX Signature',
      image: row.image || (image ? image.getAttribute('src') || '' : '')
    };
    var wish = document.querySelector('.product-actions .btn-secondary');
    if (wish) wish.setAttribute('data-wishlist-id', bound.id);
    if (window.FabluXStore && window.FabluXStore.updateWishlistButtons) {
      window.FabluXStore.updateWishlistButtons();
    }
  }

  window.FabluXDetail = {
    update: function (row) {
      if (!row) return;
      live = row;
      if (document.readyState === 'loading') return; // applied once the DOM is ready
      apply(row);
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    var addButton = document.querySelector('.product-actions .btn:not(.btn-secondary)');
    var wishlistButton = document.querySelector('.product-actions .btn-secondary');
    var title = document.querySelector('.product-summary h1');
    var price = document.querySelector('.product-summary .price');
    var image = document.querySelector('.gallery-main img');
    if (!addButton || !title || !price) return;

    var id = new URLSearchParams(window.location.search).get('id') || '4';
    var catalogProduct = (window.FAB_PRODUCTS || []).find(p => String(p.id) === String(id));

    if (live) {
      apply(live);                       // the store already pushed the row
    } else if (catalogProduct) {
      apply(catalogProduct);             // static catalogue fallback
      var note = document.querySelector('[data-stock-line]');
      if (note && !note.textContent) {
        note.textContent = 'Ready to ship in 2–4 business days.';
      }
    }

    bound = bound || {
      id,
      name: title.textContent.trim(),
      price: Number(price.textContent.replace(/[^0-9.]/g, '')) || 0,
      category: (catalogProduct && catalogProduct.category) || 'FabluX Signature',
      image: (image && image.getAttribute('src')) || ''
    };

    if (!bound.price) {
      addButton.setAttribute('aria-disabled', 'true');
      addButton.classList.add('is-disabled');
      addButton.textContent = 'Unavailable';
    }

    addButton.addEventListener('click', function (e) {
      e.preventDefault();
      if (!bound.price) {
        window.FabluXStore?.toast('Live price is still loading — please refresh.');
        return;
      }
      if (addButton.classList.contains('is-disabled')) {
        window.FabluXStore?.toast('This piece is sold out');
        return;
      }
      window.FabluXStore?.addToCart(bound);
    });
    wishlistButton?.setAttribute('data-wishlist-id', bound.id);
    wishlistButton?.addEventListener('click', function (e) {
      e.preventDefault();
      window.FabluXStore?.toggleWishlist(bound);
    });
    window.FabluXStore?.updateWishlistButtons();
  });
})();
