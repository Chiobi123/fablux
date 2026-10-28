(function () {
    const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    const CART_KEY = 'fablux_cart_v1';
    const WISHLIST_KEY = 'fablux_wishlist_v1';

    const parsePrice = value => Number(String(value || '').replace(/[^0-9.]/g, '')) || 0;
    const formatPrice = value => `₦${Number(value || 0).toLocaleString('en-NG')}`;

    function read(key) {
        try { return JSON.parse(localStorage.getItem(key)) || []; }
        catch (_) { return []; }
    }
    function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

    function getCart() { return read(CART_KEY); }
    function getWishlist() { return read(WISHLIST_KEY); }

    function productFromCard(card) {
        if (!card) return null;
        return {
            id: String(card.dataset.productId || ''),
            name: card.dataset.productName || card.querySelector('h3')?.textContent.trim() || 'Product',
            price: parsePrice(card.dataset.productPrice || card.querySelector('.product-price span')?.textContent),
            category: card.dataset.productCategory || card.querySelector('.product-info p')?.textContent.trim() || '',
            image: card.dataset.productImage || card.querySelector('img')?.getAttribute('src') || '',
            productCategory: card.dataset.category || 'all'
        };
    }

    function cartCount() {
        return getCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    }

    function updateCartIndicators() {
        const count = cartCount();
        document.querySelectorAll('.order-btn').forEach(btn => {
            btn.setAttribute('aria-label', `Open cart, ${count} item${count === 1 ? '' : 's'}`);
            let badge = btn.querySelector('.cart-count-badge');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'cart-count-badge';
                btn.appendChild(badge);
            }
            badge.textContent = count;
            badge.style.display = count ? 'inline-flex' : 'none';
        });
    }

    function toast(message) {
        let el = document.getElementById('fabluxToast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'fabluxToast';
            el.className = 'fablux-toast';
            document.body.appendChild(el);
        }
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(el._timer);
        el._timer = setTimeout(() => el.classList.remove('show'), 2600);
    }

    function addToCart(product, quantity = 1) {
        if (!product || !product.id) return;
        const cart = getCart();
        const existing = cart.find(item => item.id === String(product.id));
        if (existing) existing.quantity += quantity;
        else cart.push({ ...product, quantity });
        write(CART_KEY, cart);
        updateCartIndicators();
        renderCart();
        toast(`✓ ${product.name} added to cart`);
    }

    function removeFromCart(id) {
        write(CART_KEY, getCart().filter(item => item.id !== String(id)));
        updateCartIndicators();
        renderCart();
    }

    function changeQuantity(id, amount) {
        const cart = getCart();
        const item = cart.find(product => product.id === String(id));
        if (!item) return;
        item.quantity += amount;
        if (item.quantity <= 0) removeFromCart(id);
        else { write(CART_KEY, cart); updateCartIndicators(); renderCart(); }
    }

    function createCartDrawer() {
        if (document.getElementById('fabluxCartDrawer')) return;
        const drawer = document.createElement('aside');
        drawer.id = 'fabluxCartDrawer';
        drawer.className = 'fablux-cart-drawer';
        drawer.innerHTML = `
            <div class="fablux-cart-backdrop"></div>
            <div class="fablux-cart-panel" role="dialog" aria-modal="true" aria-labelledby="fabluxCartTitle">
                <div class="fablux-cart-header"><div><span>YOUR SELECTION</span><h2 id="fabluxCartTitle">Shopping Cart</h2></div><button class="fablux-cart-close" aria-label="Close cart">&times;</button></div>
                <div class="fablux-cart-items"></div>
                <div class="fablux-cart-footer"><div class="fablux-cart-total"><span>Total</span><strong>₦0</strong></div><button class="fablux-checkout" type="button">Proceed to Order</button><button class="fablux-clear" type="button">Clear Cart</button></div>
            </div>`;
        document.body.appendChild(drawer);
        drawer.querySelector('.fablux-cart-close').addEventListener('click', closeCart);
        drawer.querySelector('.fablux-cart-backdrop').addEventListener('click', closeCart);
        drawer.querySelector('.fablux-clear').addEventListener('click', () => {
            if (!getCart().length) return;
            write(CART_KEY, []); updateCartIndicators(); renderCart(); toast('Cart cleared');
        });
        drawer.querySelector('.fablux-checkout').addEventListener('click', () => {
            if (!getCart().length) { toast('Your cart is empty'); return; }
            window.location.href = 'checkout.html';
        });
    }

    function renderCart() {
        createCartDrawer();
        const drawer = document.getElementById('fabluxCartDrawer');
        const list = drawer.querySelector('.fablux-cart-items');
        const cart = getCart();
        if (!cart.length) {
            list.innerHTML = '<div class="fablux-cart-empty"><i class="fa-solid fa-bag-shopping"></i><p>Your cart is empty.</p><span>Add something you love from the collection.</span></div>';
        } else {
            list.innerHTML = cart.map(item => `
                <div class="fablux-cart-item" data-id="${esc(item.id)}">
                    <img src="${esc(item.image)}" alt="${esc(item.name)}">
                    <div class="fablux-cart-item-info"><h3>${esc(item.name)}</h3><p>${formatPrice(item.price)}</p><div class="fablux-qty"><button data-action="minus">−</button><span>${esc(item.quantity)}</span><button data-action="plus">+</button></div></div>
                    <button class="fablux-remove" data-action="remove" aria-label="Remove ${esc(item.name)}">&times;</button>
                </div>`).join('');
        }
        list.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
            const id = button.closest('.fablux-cart-item').dataset.id;
            const action = button.dataset.action;
            if (action === 'plus') changeQuantity(id, 1);
            if (action === 'minus') changeQuantity(id, -1);
            if (action === 'remove') removeFromCart(id);
        }));
        const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        drawer.querySelector('.fablux-cart-total strong').textContent = formatPrice(total);
    }

    function openCart() { renderCart(); document.getElementById('fabluxCartDrawer').classList.add('open'); document.body.classList.add('cart-open'); }
    function closeCart() { document.getElementById('fabluxCartDrawer')?.classList.remove('open'); document.body.classList.remove('cart-open'); }

    function toggleWishlist(product) {
        if (!product || !product.id) return;
        const list = getWishlist();
        const index = list.findIndex(item => item.id === String(product.id));
        if (index >= 0) { list.splice(index, 1); toast(`${product.name} removed from wishlist`); }
        else { list.push(product); toast(`♡ ${product.name} saved to wishlist`); }
        write(WISHLIST_KEY, list);
        updateWishlistButtons();
    }

    function updateWishlistButtons() {
        const ids = new Set(getWishlist().map(item => item.id));
        document.querySelectorAll('[data-wishlist-id]').forEach(button => {
            const active = ids.has(String(button.dataset.wishlistId));
            button.classList.toggle('active', active);
            const icon = button.querySelector('i');
            if (icon) icon.className = active ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
        });
    }

    function bindStoreUI() {
        updateCartIndicators();
        document.querySelectorAll('.order-btn').forEach(btn => btn.addEventListener('click', e => { e.preventDefault(); openCart(); }));
        document.querySelectorAll('.cart-btn').forEach(btn => btn.addEventListener('click', e => {
            e.preventDefault();
            addToCart(productFromCard(btn.closest('.product-card')));
        }));
        document.querySelectorAll('.newsletter-form').forEach(form => form.addEventListener('submit', e => {
            e.preventDefault();
            if (!form.reportValidity()) return;
            const input = form.querySelector('input[type="email"]');
            if (input) input.value = '';
            toast('✓ You are subscribed to FabluX.U.Design updates');
        }));
        document.querySelectorAll('.contact-form').forEach(form => form.addEventListener('submit', e => {
            e.preventDefault();
            if (!form.reportValidity()) return;
            form.reset();
            toast('✓ Message prepared successfully. We will respond as soon as the contact backend is connected.');
        }));
        updateWishlistButtons();
    }

    window.FabluXStore = { addToCart, toggleWishlist, openCart, closeCart, productFromCard, toast, updateWishlistButtons, getCart, formatPrice };
    document.addEventListener('DOMContentLoaded', bindStoreUI);
})();
