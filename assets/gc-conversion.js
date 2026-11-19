/*
 * Gypset Cargo conversion features (gc-).
 * - Lights on / lights off toggle (collection grids + product gallery)
 * - One-tap add buttons (globes, "add a pair")
 * - Wishlist (saved in the shopper's browser)
 * - Mobile sticky add to cart
 * Markup lives in snippets/gc-*.liquid and sections/gc-*.liquid.
 */
import { CartAddEvent } from '@theme/events';

const LIGHTS_KEY = 'gc-lights';
const WISH_KEY = 'gc-wishlist';

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  },
};

/* ---------- Lights on / off ---------- */

function lightsOn() {
  return document.documentElement.getAttribute('data-gc-lights') === 'on';
}

function setLights(on) {
  if (on) document.documentElement.setAttribute('data-gc-lights', 'on');
  else document.documentElement.removeAttribute('data-gc-lights');
  try {
    localStorage.setItem(LIGHTS_KEY, on ? 'on' : 'off');
  } catch (e) {}
  syncLightButtons();
}

function syncLightButtons() {
  const on = lightsOn();
  document.querySelectorAll('[data-gc-lights-toggle]').forEach((btn) => {
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

/* Product page: lay the lit photo over the first gallery image and float a switch on the gallery. */
function setupProductLit() {
  document.querySelectorAll('[data-gc-pdp-lit]:not([data-gc-ready])').forEach((source) => {
    source.setAttribute('data-gc-ready', '');
    const gallery = document.querySelector('media-gallery');
    if (!gallery) return;

    const firsts = [];
    const slide = gallery.querySelector('slideshow-slide .product-media-container, slideshow-slide');
    if (slide) firsts.push(slide);
    const gridItem = gallery.querySelector('.media-gallery__grid > li');
    if (gridItem) firsts.push(gridItem);

    firsts.forEach((container) => {
      if (container.querySelector('.gc-lit-overlay')) return;
      const img = document.createElement('img');
      img.className = 'gc-lit-overlay';
      img.src = source.dataset.src;
      if (source.dataset.srcset) img.srcset = source.dataset.srcset;
      img.sizes = '(min-width: 750px) 50vw, 100vw';
      img.alt = source.dataset.alt || '';
      img.loading = 'lazy';
      container.classList.add('gc-has-lit');
      container.appendChild(img);
    });

    const toggle = source.querySelector('[data-gc-lights-toggle]');
    if (toggle) {
      toggle.classList.add('gc-lights-toggle--floating');
      gallery.classList.add('gc-has-lit-gallery');
      gallery.appendChild(toggle);
    }
  });
  syncLightButtons();
}

/* ---------- One-tap add to cart ---------- */

function currentVariantId() {
  const input = document.querySelector('product-form-component form [name="id"], form[action*="/cart/add"] [name="id"]');
  return input ? input.value : null;
}

async function addToCart(button) {
  const id = button.dataset.variantId || currentVariantId();
  const quantity = Number(button.dataset.quantity || 1);
  if (!id) return;

  const label = button.querySelector('[data-gc-label]') || button;
  const original = label.textContent;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');

  const items = [{ id: Number(id), quantity }];
  /* Keep the pre-order cart note when adding a pair of a pre-order piece */
  const form = document.querySelector('product-form-component form');
  const preorder = form && form.querySelector('[name="properties[Pre-order]"]');
  if (preorder && !button.dataset.variantId) items[0].properties = { 'Pre-order': preorder.value };

  try {
    const res = await fetch((window.Theme?.routes?.root || '/') + 'cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.description || data.message || 'Could not add to cart');

    label.textContent = button.dataset.addedText || 'Added';
    document.dispatchEvent(
      new CartAddEvent({}, 'gc-add', {
        source: 'gc-conversion',
        itemCount: quantity,
        variantId: String(id),
      })
    );
  } catch (err) {
    console.error(err);
    label.textContent = 'Sorry, try again';
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    setTimeout(() => {
      label.textContent = original;
    }, 2500);
  }
}

/* ---------- Wishlist ---------- */

function wishlist() {
  const list = store.get(WISH_KEY, []);
  return Array.isArray(list) ? list : [];
}

function toggleWish(handle) {
  const list = wishlist();
  const i = list.indexOf(handle);
  if (i === -1) list.unshift(handle);
  else list.splice(i, 1);
  store.set(WISH_KEY, list.slice(0, 50));
  syncWishButtons();
}

function syncWishButtons() {
  const list = wishlist();
  document.querySelectorAll('[data-gc-wish]').forEach((btn) => {
    const saved = list.includes(btn.dataset.handle);
    btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
    btn.setAttribute('aria-label', saved ? 'Remove from wishlist' : 'Save to wishlist');
  });
  document.querySelectorAll('[data-gc-wish-count]').forEach((el) => {
    el.textContent = list.length ? String(list.length) : '';
  });
}

function money(cents) {
  const format = window.Shopify?.currency?.active || 'AUD';
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: format }).format(cents / 100);
  } catch (e) {
    return '$' + (cents / 100).toFixed(2);
  }
}

async function renderWishlistPage() {
  const page = document.querySelector('[data-gc-wishlist-page]');
  if (!page || page.hasAttribute('data-gc-ready')) return;
  page.setAttribute('data-gc-ready', '');
  const grid = page.querySelector('[data-gc-wishlist-grid]');
  const empty = page.querySelector('[data-gc-wishlist-empty]');
  const list = wishlist();

  if (!list.length) {
    empty.hidden = false;
    return;
  }

  const root = window.Theme?.routes?.root || '/';
  const products = await Promise.all(
    list.map((h) =>
      fetch(root + 'products/' + encodeURIComponent(h) + '.js')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    )
  );

  const found = products.filter(Boolean);
  if (!found.length) {
    empty.hidden = false;
    return;
  }

  grid.innerHTML = found
    .map((p) => {
      const img = p.featured_image ? p.featured_image + (p.featured_image.includes('?') ? '&' : '?') + 'width=600' : '';
      return `
        <li class="gc-wishlist__item">
          <a href="${p.url}" class="gc-wishlist__link">
            ${img ? `<img src="${img}" alt="${p.title.replace(/"/g, '&quot;')}" loading="lazy" width="600" height="600">` : ''}
            <span class="gc-wishlist__title">${p.title}</span>
            <span class="gc-wishlist__price">${p.available ? money(p.price) : 'Sold out'}</span>
          </a>
          <button type="button" class="gc-wishlist__remove" data-gc-wish data-handle="${p.handle}" data-gc-remove-on-unsave>Remove</button>
        </li>`;
    })
    .join('');
  syncWishButtons();
}

/* ---------- Mobile sticky add to cart ---------- */

function setupStickyAtc() {
  const bar = document.querySelector('[data-gc-sticky-atc]:not([data-gc-ready])');
  if (!bar) return;
  const realButton = document.querySelector('product-form-component button[name="add"], form[action*="/cart/add"] button[name="add"]');
  if (!realButton) return;
  bar.setAttribute('data-gc-ready', '');
  document.body.appendChild(bar);

  const stickyButton = bar.querySelector('[data-gc-sticky-button]');
  stickyButton.addEventListener('click', () => {
    if (realButton.disabled) {
      realButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    realButton.click();
  });

  /* Mirror the real button's label once (it may say Pre-order or Sold out) */
  const label = stickyButton.querySelector('[data-gc-label]');
  const realText = (realButton.querySelector('.add-to-cart-text') || realButton).textContent.trim().split(/\s{2,}/)[0];
  if (label && realText && realText.length < 30) label.textContent = realText;

  const syncDisabled = () => {
    stickyButton.disabled = realButton.disabled;
  };
  syncDisabled();
  new MutationObserver(syncDisabled).observe(realButton, { attributes: true, childList: true, subtree: true });

  const io = new IntersectionObserver(
    ([entry]) => {
      const below = entry.boundingClientRect.top < 0;
      bar.classList.toggle('is-visible', !entry.isIntersecting && below);
    },
    { threshold: 0 }
  );
  io.observe(realButton);
}

/* ---------- Wiring ---------- */

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const lights = target.closest('[data-gc-lights-toggle]');
  if (lights) {
    event.preventDefault();
    setLights(!lightsOn());
    return;
  }

  const add = target.closest('[data-gc-add]');
  if (add) {
    event.preventDefault();
    addToCart(add);
    return;
  }

  const wish = target.closest('[data-gc-wish]');
  if (wish) {
    event.preventDefault();
    event.stopPropagation();
    toggleWish(wish.dataset.handle);
    if (wish.hasAttribute('data-gc-remove-on-unsave') && wish.getAttribute('aria-pressed') === 'false') {
      wish.closest('li')?.remove();
    }
  }
});

function init() {
  setupProductLit();
  syncLightButtons();
  syncWishButtons();
  setupStickyAtc();
  renderWishlistPage();
}

init();
document.addEventListener('DOMContentLoaded', init);

let pending = null;
new MutationObserver(() => {
  clearTimeout(pending);
  pending = setTimeout(() => {
    setupProductLit();
    syncLightButtons();
    syncWishButtons();
  }, 100);
}).observe(document.documentElement, { childList: true, subtree: true });
