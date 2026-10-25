document.addEventListener('DOMContentLoaded', function () {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const productCards = document.querySelectorAll('.shop-product-card');
    if (!productCards.length) return;

    let activeFilter = 'all';

    function applyFilters() {
        productCards.forEach(card => {
            const category = card.dataset.category || 'all';
            const visible = activeFilter === 'all' || category === activeFilter;
            card.style.display = visible ? 'block' : 'none';
        });
    }

    filterButtons.forEach(button => button.addEventListener('click', function () {
        filterButtons.forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');
        activeFilter = this.dataset.filter || 'all';
        applyFilters();
    }));
});
