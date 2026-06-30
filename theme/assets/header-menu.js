import { Component } from '@theme/component';
import { debounce, onDocumentLoaded, setHeaderMenuStyle } from '@theme/utilities';
import { MegaMenuHoverEvent } from '@theme/events';

const HOVER_COMMIT_DELAY_MS = 150;
const HOVER_CLOSE_DELAY_MS = 120;

/**
 * A custom element that manages a header menu.
 *
 * @typedef {Object} State
 * @property {HTMLElement | null} activeItem - The currently active menu item.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} overflowMenu - The overflow menu.
 * @property {HTMLElement[]} [submenu] - The submenu in each respective menu item.
 *
 * @extends {Component<Refs>}
 */
class HeaderMenu extends Component {
  requiredRefs = ['overflowMenu'];

  /**
   * @type {MutationObserver | null}
   */
  #submenuMutationObserver = null;

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #hoverDispatchTimer;

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #hoverCloseTimer;

  connectedCallback() {
    super.connectedCallback();

    onDocumentLoaded(this.#preloadImages);
    window.addEventListener('resize', this.#resizeListener);
    this.overflowMenu?.addEventListener('pointerleave', this.#overflowSubmenuListener);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('resize', this.#resizeListener);
    this.overflowMenu?.removeEventListener('pointerleave', this.#overflowSubmenuListener);
    this.#cleanupMutationObserver();
    clearTimeout(this.#hoverDispatchTimer);
    this.#hoverDispatchTimer = undefined;
    clearTimeout(this.#hoverCloseTimer);
    this.#hoverCloseTimer = undefined;
  }

  /**
   * Debounced resize event listener to recalculate menu style
   */
  #resizeListener = debounce(() => {
    setHeaderMenuStyle();
  }, 100);

  #overflowSubmenuListener = () => {
    this.#deactivate();
  };

  /**
   * @type {State}
   */
  #state = {
    activeItem: null,
  };

  /**
   * Get the overflow menu
   */
  get overflowMenu() {
    return /** @type {HTMLElement | null} */ (this.refs.overflowMenu?.shadowRoot?.querySelector('[part="overflow"]'));
  }

  /**
   * Whether the overflow list is hovered
   * @returns {boolean}
   */
  get overflowListHovered() {
    return this.refs.overflowMenu?.shadowRoot?.querySelector('[part="overflow-list"]')?.matches(':hover') ?? false;
  }

  get headerComponent() {
    return /** @type {HTMLElement | null} */ (this.closest('header-component'));
  }

  /**
   * Activate the selected menu item immediately
   * @param {PointerEvent | FocusEvent} event
   */
  activate = (event) => {
    if (!(event.target instanceof Element) || !this.headerComponent) return;

    clearTimeout(this.#hoverCloseTimer);
    this.#hoverCloseTimer = undefined;

    let item = findMenuItem(event.target);

    if (!item || item == this.#state.activeItem) return;

    const isDefaultSlot = event.target.slot === '';

    this.dataset.overflowExpanded = (!isDefaultSlot).toString();

    const previouslyActiveItem = this.#state.activeItem;

    if (previouslyActiveItem) {
      previouslyActiveItem.ariaExpanded = 'false';
    }

    this.#state.activeItem = item;
    this.ariaExpanded = 'true';
    item.ariaExpanded = 'true';

    let submenu = findSubmenu(item);
    const hasSubmenu = Boolean(submenu);

    if (!hasSubmenu && !isDefaultSlot) {
      submenu = this.overflowMenu;
    }

    if (submenu) {
      clearTimeout(this.#hoverDispatchTimer);
      this.#hoverDispatchTimer = undefined;
      const committedItem = item;
      if (event instanceof FocusEvent) {
        this.dispatchEvent(new MegaMenuHoverEvent());
      } else {
        this.#hoverDispatchTimer = setTimeout(() => {
          this.#hoverDispatchTimer = undefined;
          if (this.#state.activeItem === committedItem) {
            this.dispatchEvent(new MegaMenuHoverEvent());
          }
        }, HOVER_COMMIT_DELAY_MS);
      }

      // Mark submenu as active for content-visibility optimization
      submenu.dataset.active = '';

      // Cleanup any existing mutation observer from previous menu activations
      this.#cleanupMutationObserver();

      // Monitor DOM mutations to catch deferred content injection (from section hydration)
      this.#submenuMutationObserver = new MutationObserver(() => {
        requestAnimationFrame(() => {
          // Double requestAnimationFrame to ensure the height is properly calculated and not defaulting to the contain-intrinsic-size
          requestAnimationFrame(() => {
            if (submenu.offsetHeight > 0) {
              this.headerComponent?.style.setProperty('--submenu-height', `${submenu.offsetHeight}px`);
              this.#cleanupMutationObserver();
            }
          });
        });
      });
      this.#submenuMutationObserver.observe(submenu, { childList: true, subtree: true });

      // Auto-disconnect after 500ms to prevent memory leaks
      setTimeout(() => {
        this.#cleanupMutationObserver();
      }, 500);
    }

    let finalHeight = submenu?.offsetHeight || 0;

    // For overflow menu, the height needs to be either content of the submenu or the total height of the menu list links
    if (!isDefaultSlot) {
      const overflowListHeight = this.#getOverflowListLinksHeight();
      if (hasSubmenu) {
        /* Note: When the submenu is inside the overflow menu, its offsetHeight is not valid due to the lack of padding
         * we could add the padding variables to the submenu.offsetHeight, but measuring the overflowMenu.offsetHeight is just easier */
        const overflowHeight = this.overflowMenu?.offsetHeight || 0;
        finalHeight = Math.max(overflowHeight, overflowListHeight);
      } else {
        finalHeight = overflowListHeight;
      }
    }

    if (!submenu) {
      // If there is no content to open, don't try to open it
      finalHeight = 0;
    }

    const headerVisibleHeight = this.#getHeaderVisibleHeight();

    this.headerComponent.style.setProperty('--submenu-height', `${finalHeight}px`);
    this.#setFullOpenHeaderHeight(finalHeight, headerVisibleHeight);
    this.style.setProperty('--submenu-opacity', '1');
  };

  /**
   * Deactivate the active item after a delay
   * @param {PointerEvent | FocusEvent} event
   */
  deactivate(event) {
    if (!(event.target instanceof Element)) return;

    const activeItem = this.#state.activeItem;
    const activeListItem = activeItem?.parentElement;
    const menu = findSubmenu(activeItem);
    const relatedTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    const isMovingWithinActiveItem = Boolean(relatedTarget && activeListItem?.contains(relatedTarget));
    const isMovingWithinMenu = Boolean(event.type === 'blur' && menu?.contains(document.activeElement));
    const isMovingToSubmenu = Boolean(relatedTarget && menu?.contains(relatedTarget));
    const isMovingToOverflowMenu =
      relatedTarget instanceof Element && relatedTarget.parentElement?.matches('[slot="overflow"]');

    if (isMovingWithinActiveItem || isMovingWithinMenu || isMovingToOverflowMenu || isMovingToSubmenu) {
      return;
    }

    if (event.type === 'pointerleave') {
      clearTimeout(this.#hoverCloseTimer);
      this.#hoverCloseTimer = setTimeout(() => {
        this.#hoverCloseTimer = undefined;
        this.#deactivate(activeItem);
      }, HOVER_CLOSE_DELAY_MS);
      return;
    }

    this.#deactivate();
  }

  /**
   * Deactivate the active item immediately
   * @param {HTMLElement | null} [item]
   */
  #deactivate = (item = this.#state.activeItem) => {
    if (!item || item != this.#state.activeItem) return;

    // Don't deactivate if the overflow menu or overflow list is still being hovered
    if (this.overflowListHovered || this.overflowMenu?.matches(':hover')) return;

    clearTimeout(this.#hoverDispatchTimer);
    this.#hoverDispatchTimer = undefined;
    clearTimeout(this.#hoverCloseTimer);
    this.#hoverCloseTimer = undefined;

    this.headerComponent?.style.setProperty('--submenu-height', '0px');
    this.#setFullOpenHeaderHeight(0, 0);
    this.style.setProperty('--submenu-opacity', '0');
    this.dataset.overflowExpanded = 'false';

    const submenu = findSubmenu(item);

    this.#state.activeItem = null;
    this.ariaExpanded = 'false';
    item.ariaExpanded = 'false';

    // Remove active state from submenu after animation completes
    if (submenu) {
      delete submenu.dataset.active;
    }
  };

  #getOverflowListLinksHeight() {
    const slottedMenuLinks = this.overflowMenu?.querySelector('slot')?.assignedElements();
    if (!slottedMenuLinks) return this.overflowMenu?.offsetHeight || 0;

    /**
     * @param {(submenu: HTMLElement) => void} cb
     */
    const mapSubmenus = (cb) => {
      slottedMenuLinks.forEach((link) => {
        const submenu = /** @type {HTMLElement | null} */ (link.querySelector('[ref="submenu[]"]'));
        if (submenu) {
          cb(submenu);
        }
      });
    };

    mapSubmenus((submenu) => {
      submenu.style.setProperty('display', 'none');
    });
    const height = this.overflowMenu?.offsetHeight || 0;
    mapSubmenus((submenu) => {
      submenu.style.removeProperty('display');
    });
    return height;
  }

  /**
   * Read the visible header height before submenu height writes invalidate layout.
   * @returns {number}
   */
  #getHeaderVisibleHeight() {
    if (!this.headerComponent) return 0;

    const isOverlapSituation = this.headerComponent.hasAttribute('data-submenu-overlap-bottom-row');

    return isOverlapSituation && this.headerComponent.offsetHeight > 0
      ? /** @type {HTMLElement | null} */ (this.headerComponent.querySelector('.header__row--top'))?.offsetHeight ?? 0
      : this.headerComponent.offsetHeight;
  }

  /**
   * Calculate and set the full open header height. If the submenu is not open, the full open header height is 0.
   * @param {number} submenuHeight
   * @param {number} headerVisibleHeight
   */
  #setFullOpenHeaderHeight(submenuHeight, headerVisibleHeight) {
    if (!this.headerComponent) return;

    const nothingToOpen = submenuHeight === 0;
    const fullOpenHeaderHeight = nothingToOpen ? 0 : submenuHeight + headerVisibleHeight;

    this.headerComponent?.style.setProperty('--full-open-header-height', `${fullOpenHeaderHeight}px`);
  }

  /**
   * Preload images that are set to load lazily.
   */
  #preloadImages = () => {
    const images = this.querySelectorAll('img[loading="lazy"]');
    images?.forEach((image) => image.removeAttribute('loading'));
  };

  #cleanupMutationObserver() {
    this.#submenuMutationObserver?.disconnect();
    this.#submenuMutationObserver = null;
  }
}

if (!customElements.get('header-menu')) {
  customElements.define('header-menu', HeaderMenu);
}

/**
 * Find the closest menu item.
 * @param {Element | null | undefined} element
 * @returns {HTMLElement | null}
 */
function findMenuItem(element) {
  if (!(element instanceof Element)) return null;

  if (element?.matches('[slot="more"')) {
    // Select the first overflowing menu item when hovering over the "More" item
    return findMenuItem(element.parentElement?.querySelector('[slot="overflow"]'));
  }

  return element?.querySelector('[ref="menuitem"]');
}

/**
 * Find the closest submenu.
 * @param {Element | null | undefined} element
 * @returns {HTMLElement | null}
 */
function findSubmenu(element) {
  const submenu = element?.parentElement?.querySelector('[ref="submenu[]"]');
  return submenu instanceof HTMLElement ? submenu : null;
}
