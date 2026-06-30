import { Component } from '@theme/component';
import { StandardEvents, CartLinesUpdateEvent } from '@shopify/events';
import { DrawerOpenEvent, DrawerCloseEvent } from '@theme/theme-drawer';
import { formatMoney } from '@theme/money-formatting';

/**
 * Header actions component that manages cart notifications, cart preview,
 * and the cart-drawer trigger's `aria-expanded` state.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} liveRegion - The live region for cart announcements.
 *
 * @extends {Component<Refs>}
 */
class HeaderActions extends Component {
  requiredRefs = ['liveRegion'];

  #cartPreviewWrapper = null;

  #pendingCartPreviewFetch = null;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(StandardEvents.cartLinesUpdate, this.#onCartUpdate);
    document.addEventListener(DrawerOpenEvent.eventName, this.#onDrawerStateChange);
    document.addEventListener(DrawerCloseEvent.eventName, this.#onDrawerStateChange);
    this.#cartPreviewWrapper = this.querySelector('[data-cart-preview-wrapper]');
    this.#cartPreviewWrapper?.addEventListener('mouseenter', this.#refreshCartPreview);
    this.#cartPreviewWrapper?.addEventListener('focusin', this.#refreshCartPreview);
    this.#syncCartTriggerAriaExpanded();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(StandardEvents.cartLinesUpdate, this.#onCartUpdate);
    document.removeEventListener(DrawerOpenEvent.eventName, this.#onDrawerStateChange);
    document.removeEventListener(DrawerCloseEvent.eventName, this.#onDrawerStateChange);
    this.#cartPreviewWrapper?.removeEventListener('mouseenter', this.#refreshCartPreview);
    this.#cartPreviewWrapper?.removeEventListener('focusin', this.#refreshCartPreview);
    this.#cartPreviewWrapper = null;
  }

  #syncCartTriggerAriaExpanded = () => {
    const cartDrawer = document.getElementById('cart-drawer');
    if (!cartDrawer) return;
    const trigger = this.querySelector('[aria-controls="cart-drawer"]');
    if (!trigger) return;
    trigger.setAttribute('aria-expanded', cartDrawer.hasAttribute('open') ? 'true' : 'false');
  };

  /**
   * Syncs `aria-expanded` on the cart-drawer trigger when the drawer opens or closes.
   * @param {Event} event
   */
  #onDrawerStateChange = (event) => {
    const target = /** @type {HTMLElement | null} */ (event.target);
    if (target?.id !== 'cart-drawer') return;
    this.#syncCartTriggerAriaExpanded();
  };

  /**
   * Handles cart update events and announces the new count to screen readers.
   * @param {CartLinesUpdateEvent} event
   */
  #onCartUpdate = (event) => {
    event.promise
      ?.then(({ cart, detail }) => {
        const cartCount = cart?.totalQuantity ?? detail?.itemCount;

        if (cartCount !== undefined) {
          this.refs.liveRegion.textContent = `${Theme.translations.cart_count}: ${cartCount}`;
        }
        this.#refreshCartPreview();
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') console.warn('[header-actions] Event promise rejected:', error);
      });
  };

  #refreshCartPreview = () => {
    if (!this.querySelector('[data-cart-preview]')) return;
    if (document.getElementById('cart-drawer')?.hasAttribute('open')) return;

    this.#fetchCart()
      .then((cart) => this.#renderCartPreview(cart))
      .catch((error) => {
        if (error?.name !== 'AbortError') console.warn('[header-actions] Cart preview refresh failed:', error);
      });
  };

  #fetchCart() {
    if (this.#pendingCartPreviewFetch) return this.#pendingCartPreviewFetch;

    this.#pendingCartPreviewFetch = fetch(`${Theme.routes.cart_url}.json`, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to fetch cart: ${response.status} ${response.statusText}`);
        return response.json();
      })
      .finally(() => {
        this.#pendingCartPreviewFetch = null;
      });

    return this.#pendingCartPreviewFetch;
  }

  #renderCartPreview(cart) {
    const preview = this.querySelector('[data-cart-preview]');
    const content = this.querySelector('[data-cart-preview-content]');
    if (!(preview instanceof HTMLElement) || !(content instanceof HTMLElement)) return;

    const items = Array.isArray(cart?.items) ? cart.items.slice(0, 3) : [];
    content.replaceChildren();

    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'header-cart-preview__empty';
      empty.textContent = preview.dataset.emptyText || '';
      content.append(empty);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'header-cart-preview__items list-unstyled';

    for (const item of items) {
      list.append(this.#createCartPreviewItem(item, cart, preview));
    }

    const total = document.createElement('div');
    total.className = 'header-cart-preview__total';

    const totalLabel = document.createElement('span');
    totalLabel.textContent = preview.dataset.totalText || '';

    const totalValue = document.createElement('span');
    totalValue.textContent = this.#formatCartPreviewMoney(cart?.total_price, cart, preview, 'total');

    total.append(totalLabel, totalValue);
    content.append(list, total);
  }

  #createCartPreviewItem(item, cart, preview) {
    const row = document.createElement('li');
    row.className = 'header-cart-preview__item';

    const media = document.createElement('div');
    media.className = 'header-cart-preview__media';

    if (typeof item?.image === 'string' && item.image) {
      const image = document.createElement('img');
      image.className = 'header-cart-preview__image';
      image.src = item.image;
      image.alt = '';
      image.loading = 'lazy';
      media.append(image);
    } else {
      const placeholder = document.createElement('span');
      placeholder.className = 'header-cart-preview__media-placeholder';
      media.append(placeholder);
    }

    const details = document.createElement('div');
    details.className = 'header-cart-preview__details';

    const titleRow = document.createElement('div');
    titleRow.className = 'header-cart-preview__title-row';

    const title = document.createElement('p');
    title.className = 'header-cart-preview__title';
    title.textContent = this.#cartPreviewItemTitle(item);

    const price = document.createElement('p');
    price.className = 'header-cart-preview__price';
    price.textContent = this.#formatCartPreviewMoney(item?.final_line_price ?? item?.line_price, cart, preview, 'items');

    titleRow.append(title, price);
    details.append(titleRow);

    const options = this.#cartPreviewOptions(item);
    if (options.length > 0) {
      const optionsList = document.createElement('dl');
      optionsList.className = 'header-cart-preview__options';

      for (const option of options) {
        const optionRow = document.createElement('div');
        optionRow.className = 'header-cart-preview__option';

        const optionName = document.createElement('dt');
        optionName.textContent = `${option.name}:`;

        const optionValue = document.createElement('dd');
        optionValue.textContent = option.value;

        optionRow.append(optionName, optionValue);
        optionsList.append(optionRow);
      }

      details.append(optionsList);
    }

    const quantity = document.createElement('p');
    quantity.className = 'header-cart-preview__quantity';
    quantity.textContent = `${preview.dataset.quantityText || ''}: ${Number(item?.quantity) || 0}`;
    details.append(quantity);

    row.append(media, details);
    return row;
  }

  #cartPreviewItemTitle(item) {
    if (typeof item?.product_title === 'string' && item.product_title) return item.product_title;
    if (typeof item?.product?.title === 'string' && item.product.title) return item.product.title;
    if (typeof item?.title === 'string') return item.title;
    return '';
  }

  #cartPreviewOptions(item) {
    if (!Array.isArray(item?.options_with_values)) return [];

    return item.options_with_values
      .filter((option) => option?.name && option?.value && option.value !== 'Default Title')
      .map((option) => ({
        name: String(option.name),
        value: String(option.value),
      }));
  }

  #formatCartPreviewMoney(value, cart, preview, formatContext) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '';

    const usesCurrencyCode =
      formatContext === 'total'
        ? preview.dataset.useCurrencyCodeTotal === 'true'
        : preview.dataset.useCurrencyCodeItems === 'true';
    const format = usesCurrencyCode ? preview.dataset.moneyWithCurrencyFormat : preview.dataset.moneyFormat;
    const currency = typeof cart?.currency === 'string' ? cart.currency : preview.dataset.currency || '';

    return formatMoney(amount, format || '{{amount}}', currency);
  }
}

if (!customElements.get('header-actions')) {
  customElements.define('header-actions', HeaderActions);
}
