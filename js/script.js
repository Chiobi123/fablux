document.addEventListener("DOMContentLoaded", function () {
    const slides = document.querySelectorAll(".slide");
    const header = document.querySelector("header");
    const topBtn = document.getElementById("topBtn");
    const menuBtn = document.querySelector(".menu-toggle");
    const navLinks = document.querySelector(".nav-links");
    const hiddenElements = document.querySelectorAll(
        ".featured,.categories,.arrivals,.about,.why-us,.testimonials,.newsletter,footer,.product-detail,.contact-section,.shop-products"
    );
    const filterBtns = document.querySelectorAll(".filter-btn");
    const productCards = document.querySelectorAll(".product-card");

    let currentSlide = 0;

    // Slider rotation
    function showNextSlide() {
        if (!slides.length) return;
        slides[currentSlide].classList.remove("active");
        currentSlide = (currentSlide + 1) % slides.length;
        slides[currentSlide].classList.add("active");
    }

    if (slides.length) {
        slides[currentSlide].classList.add("active");
        setInterval(showNextSlide, 5000);
        slides.forEach(slide => {
            slide.style.animation = "heroZoom 10s ease-in-out infinite alternate";
        });
    }

    // Header scroll effect
    function updateHeader() {
        if (!header) return;
        if (window.scrollY > 50) {
            header.style.background = "rgba(0,0,0,.85)";
            header.style.backdropFilter = "blur(18px)";
            header.style.transition = ".4s";
        } else {
            header.style.background = "rgba(0,0,0,.35)";
            header.style.backdropFilter = "blur(15px)";
        }
    }

    updateHeader();

    window.addEventListener("scroll", function () {
        updateHeader();
        if (topBtn) {
            topBtn.style.display = window.scrollY > 400 ? "flex" : "none";
        }
    });

    // Back to top button
    if (topBtn) {
        topBtn.addEventListener("click", function () {
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }

    // Scroll reveal animation
    const observer = new IntersectionObserver(
        entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("show");
                }
            });
        },
        {
            threshold: 0.15,
        }
    );

    hiddenElements.forEach(el => {
        el.classList.add("hidden");
        observer.observe(el);
    });

    // Fast loader: remove as soon as the DOM is ready instead of forcing a 1.2s wait.
    const loader = document.getElementById("loader");
    if (loader) {
        const hideLoader = () => {
            if (!loader.isConnected) return;
            loader.classList.add("loader-ready");
            requestAnimationFrame(() => loader.remove());
        };
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", hideLoader, { once: true });
        } else {
            hideLoader();
        }
        // Safety fallback if a script/resource behaves unexpectedly.
        setTimeout(hideLoader, 500);
    }

    // Mobile menu toggle
    if (menuBtn && navLinks) {
        menuBtn.addEventListener("click", function () {
            navLinks.classList.toggle("active");
        });
    }

    // Product gallery thumbnail
    const mainImage = document.querySelector(".gallery-main img");
    const thumbImages = document.querySelectorAll(".gallery-thumbs img");

    thumbImages.forEach(thumb => {
        thumb.addEventListener("click", function () {
            thumbImages.forEach(item => item.classList.remove("active"));
            thumb.classList.add("active");
            if (mainImage) {
                mainImage.src = thumb.dataset.large || thumb.src;
            }
        });
    });

    // Shop filter functionality
    filterBtns.forEach(btn => {
        btn.addEventListener("click", function () {
            filterBtns.forEach(b => b.classList.remove("active"));
            this.classList.add("active");

            const filterValue = this.getAttribute("data-filter");

            productCards.forEach(card => {
                if (filterValue === "all" || card.getAttribute("data-category") === filterValue) {
                    card.style.display = "block";
                    setTimeout(() => {
                        card.style.opacity = "1";
                        card.style.transform = "scale(1)";
                    }, 50);
                } else {
                    card.style.opacity = "0";
                    card.style.transform = "scale(0.95)";
                    setTimeout(() => {
                        card.style.display = "none";
                    }, 300);
                }
            });
        });
    });

    // Set initial product card styles
    productCards.forEach(card => {
        card.style.transition = "all 0.3s ease";
        card.style.opacity = "1";
        card.style.transform = "scale(1)";
    });

    // Quick View Modal Functionality
    const quickViewBtns = document.querySelectorAll(".quick-view-btn");
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "quickViewModal";
    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close">&times;</button>
            <div class="modal-header">
                <div class="modal-image">
                    <img id="modalImage" src="" alt="Product">
                </div>
                <div class="modal-details">
                    <h2 id="modalProductName"></h2>
                    <p id="modalProductCategory"></p>
                    <div class="rating">
                        <span class="stars" id="modalStars">★★★★★</span>
                        <span id="modalRatingCount">(0)</span>
                    </div>
                    <div class="modal-price" id="modalPrice"></div>
                    <div class="modal-actions">
                        <button class="add-to-cart-btn"><i class="fa-solid fa-cart-shopping"></i> Add to Cart</button>
                        <button class="wishlist-btn"><i class="fa-regular fa-heart"></i> Wishlist</button>
                    </div>
                    <div class="modal-description">
                        <p>Premium quality product with authentic materials. Free shipping on orders over ₦50,000. Easy returns within 14 days.</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    quickViewBtns.forEach(btn => {
        btn.addEventListener("click", function (e) {
            e.preventDefault();
            const productCard = this.closest(".product-card");
            const productName = productCard.getAttribute("data-product-name");
            const productPrice = productCard.getAttribute("data-product-price");
            const productCategory = productCard.getAttribute("data-product-category");
            const productImage = productCard.getAttribute("data-product-image");
            const ratingCount = productCard.querySelector(".rating-count")?.textContent || "(0)";
            const stars = productCard.querySelector(".stars")?.textContent || "★★★★★";

            document.getElementById("modalImage").src = productImage;
            document.getElementById("modalProductName").textContent = productName;
            document.getElementById("modalProductCategory").textContent = productCategory;
            document.getElementById("modalPrice").textContent = productPrice;
            document.getElementById("modalRatingCount").textContent = ratingCount;
            document.getElementById("modalStars").textContent = stars;
            modalProduct = {
                id: productCard.getAttribute("data-product-id"),
                name: productName,
                price: Number(String(productPrice).replace(/[^0-9.]/g, "")) || 0,
                category: productCategory,
                image: productImage
            };
            if (modalWishlistButton) modalWishlistButton.setAttribute("data-wishlist-id", modalProduct.id);
            window.FabluXStore?.updateWishlistButtons();
            modal.classList.add("active");
        });
    });

    const modalClose = document.querySelector(".modal-close");
    if (modalClose) {
        modalClose.addEventListener("click", () => {
            modal.classList.remove("active");
        });
    }

    const modalCartButton = modal.querySelector(".add-to-cart-btn");
    const modalWishlistButton = modal.querySelector(".wishlist-btn");
    let modalProduct = null;

    if (modalCartButton) {
        modalCartButton.addEventListener("click", () => {
            if (modalProduct && window.FabluXStore) window.FabluXStore.addToCart(modalProduct);
        });
    }
    if (modalWishlistButton) {
        modalWishlistButton.addEventListener("click", () => {
            if (modalProduct && window.FabluXStore) window.FabluXStore.toggleWishlist(modalProduct);
        });
    }

    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            modal.classList.remove("active");
        }
    });
});

