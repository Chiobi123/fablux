document.addEventListener('DOMContentLoaded', function () {
    const addButton = document.querySelector('.product-actions .btn:not(.btn-secondary)');
    const wishlistButton = document.querySelector('.product-actions .btn-secondary');
    const title = document.querySelector('.product-summary h1');
    const price = document.querySelector('.product-summary .price');
    const image = document.querySelector('.gallery-main img');
    if (!addButton || !title || !price) return;

    const id = new URLSearchParams(window.location.search).get('id') || '4';
    const catalogProduct = (window.FAB_PRODUCTS || []).find(p => String(p.id) === String(id));
    if (catalogProduct) {
        title.textContent = catalogProduct.name;
        price.textContent = `₦${Number(catalogProduct.price).toLocaleString('en-NG')}`;
        if (image) { image.src = catalogProduct.image; image.alt = catalogProduct.name; }
        document.title = `FabluX.U.Design | ${catalogProduct.name}`;
    }

    const product = {
        id,
        name: title.textContent.trim(),
        price: Number(price.textContent.replace(/[^0-9.]/g, '')) || 0,
        category: catalogProduct?.category || 'FabluX Signature',
        image: image?.getAttribute('src') || ''
    };

    addButton.addEventListener('click', function (e) {
        e.preventDefault();
        window.FabluXStore?.addToCart(product);
    });
    wishlistButton?.setAttribute('data-wishlist-id', product.id);
    wishlistButton?.addEventListener('click', function (e) {
        e.preventDefault();
        window.FabluXStore?.toggleWishlist(product);
    });
    window.FabluXStore?.updateWishlistButtons();
});
