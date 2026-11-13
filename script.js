/**
 * PINKIES PLAY WELL — interaction layer for the mobile-first design prototype.
 * No availability, transactions, or booking requests are sent to a server.
 * To launch: replace the deterministic sample date-status function with a backend API,
 * connect the checkout to a payment provider, and replace preview prices/content.
 */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const formatGBP = amount => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
  const dateLabel = date => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  const monthLabel = date => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(date);
  const dateKey = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');

  const catalogue = {
    'kids-pink': { name: 'Play Well Tee', description: 'Kids · Pink', image: 'assets/tee-kids-pink.webp', price: 18, sizes: ['3–4', '5–6', '7–8', '9–10', '11–12'] },
    'kids-blue': { name: 'Pinkies Logo Tee', description: 'Kids · Blue', image: 'assets/tee-kids-blue.webp', price: 18, sizes: ['3–4', '5–6', '7–8', '9–10', '11–12'] },
    heart: { name: 'Heart Logo Tee', description: 'Adults · White', image: 'assets/tee-adult-heart.webp', price: 20, sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'] },
    stripe: { name: 'Striped Detail Tee', description: 'Adults · White', image: 'assets/tee-adult-stripe.webp', price: 20, sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'] },
    black: { name: 'The Black Tee', description: 'Adults · Black', image: 'assets/tee-adult-black.webp', price: 20, sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'] }
  };
  const inflatables = {
    'little-pinky': 'The Little Pinky', slide: 'The Slide', adventure: 'Large Adventure', castle: 'Large Castle'
  };

  const today = new Date(); today.setHours(0, 0, 0, 0);
  let displayedMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  let selectedDate = null;
  let selectedInflatable = 'little-pinky';
  let selectedProduct = null;
  let selectedSize = '';
  let quantity = 1;
  const cart = [];
  const favourites = new Set();
  let activeLayer = null;
  let lastFocus = null;
  let toastTimeout;

  const ui = {
    menuToggle: $('#menuToggle'), mobileNav: $('#mobileNav'), searchToggle: $('#searchToggle'),
    searchBar: $('#searchBar'), searchInput: $('#searchInput'), cartToggle: $('#cartToggle'),
    monthLabel: $('#monthLabel'), calendarGrid: $('#calendarGrid'), prevMonth: $('#prevMonth'),
    nextMonth: $('#nextMonth'), chosenDate: $('#chosenDateText'), bookingAction: $('#bookingAction'),
    bookingSummary: $('#bookingSummary'), overlay: $('#overlay'), cartDrawer: $('#cartDrawer'),
    cartItems: $('#cartItems'), cartCount: $('#cartCount'), drawerCount: $('#drawerCount'),
    subtotal: $('#subtotal'), sizeModal: $('#sizeModal'), sizeGrid: $('#sizeGrid'),
    modalProduct: $('#modalProduct'), qtyValue: $('#qtyValue'), addPrice: $('#addPrice'),
    bookingModal: $('#bookingModal'), toast: $('#toast')
  };

  function showToast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add('show');
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => ui.toast.classList.remove('show'), 3200);
  }

  // Illustrative deterministic status: never represent this as real availability.
  function availabilityFor(date) {
    const seed = date.getFullYear() * 31 + (date.getMonth() + 1) * 83 + date.getDate() * 47;
    const code = ((seed * 13 + Math.floor(seed / 7) * 17) % 100 + 100) % 100;
    if (code < 23) return 'booked';
    if (code < 56) return 'limited';
    return 'available';
  }

  function renderCalendar() {
    ui.monthLabel.textContent = monthLabel(displayedMonth);
    const firstWeekday = (displayedMonth.getDay() + 6) % 7; // Monday first
    const days = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 0).getDate();
    const frag = document.createDocumentFragment();

    for (let i = 0; i < firstWeekday; i++) {
      const blank = document.createElement('span');
      blank.className = 'day-cell is-outside'; blank.setAttribute('aria-hidden', 'true');
      frag.append(blank);
    }
    for (let day = 1; day <= days; day++) {
      const date = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), day);
      const status = availabilityFor(date);
      const isPast = date < today;
      const isSelected = selectedDate && dateKey(selectedDate) === dateKey(date);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `day-cell is-${isPast ? 'past' : status}${isSelected ? ' is-selected' : ''}${dateKey(date) === dateKey(today) ? ' is-today' : ''}`;
      button.dataset.date = dateKey(date);
      button.innerHTML = `<span>${day}</span>`;
      button.setAttribute('aria-label', `${dateLabel(date)} — ${isPast ? 'past date' : status === 'booked' ? 'booked (demo)' : status + ' (demo)'}`);
      button.setAttribute('aria-pressed', String(Boolean(isSelected)));
      button.disabled = isPast || status === 'booked';
      frag.append(button);
    }
    ui.calendarGrid.replaceChildren(frag);
    ui.prevMonth.disabled = displayedMonth.getFullYear() === today.getFullYear() && displayedMonth.getMonth() === today.getMonth();
    ui.chosenDate.textContent = selectedDate ? `${dateLabel(selectedDate)} · Demo availability` : 'Choose an available date';
    ui.bookingAction.firstChild.textContent = selectedDate ? 'Continue with this date ' : 'Select a date ';
  }

  ui.prevMonth.addEventListener('click', () => { displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1); renderCalendar(); });
  ui.nextMonth.addEventListener('click', () => { displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1); renderCalendar(); });
  ui.calendarGrid.addEventListener('click', event => {
    const button = event.target.closest('button[data-date]');
    if (!button || button.disabled) return;
    const [year, month, day] = button.dataset.date.split('-').map(Number);
    selectedDate = new Date(year, month - 1, day);
    renderCalendar();
  });

  function focusableIn(element) {
    return $$('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])', element).filter(el => el.getClientRects().length > 0);
  }
  function openLayer(element) {
    if (activeLayer) closeLayer(false);
    lastFocus = document.activeElement;
    ui.overlay.hidden = false;
    element.classList.add('open');
    element.setAttribute('aria-hidden', 'false');
    document.body.classList.add('lock-scroll');
    activeLayer = element;
    const targets = focusableIn(element);
    if (targets.length) targets[0].focus();
  }
  function closeLayer(restoreFocus = true) {
    if (!activeLayer) return;
    activeLayer.classList.remove('open');
    activeLayer.setAttribute('aria-hidden', 'true');
    activeLayer = null;
    ui.overlay.hidden = true;
    document.body.classList.remove('lock-scroll');
    if (restoreFocus && lastFocus && lastFocus.isConnected) lastFocus.focus();
  }
  ui.overlay.addEventListener('click', () => closeLayer());
  $$('[data-close]').forEach(element => element.addEventListener('click', () => closeLayer()));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (activeLayer) closeLayer();
      if (!ui.mobileNav.hidden) toggleMenu(false);
      if (!ui.searchBar.hidden) toggleSearch(false);
    }
    if (event.key === 'Tab' && activeLayer) {
      const targets = focusableIn(activeLayer);
      if (!targets.length) return;
      const first = targets[0], last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  function toggleMenu(show) {
    ui.mobileNav.hidden = !show;
    ui.menuToggle.setAttribute('aria-expanded', String(show));
  }
  ui.menuToggle.addEventListener('click', () => toggleMenu(ui.mobileNav.hidden));
  $$('#mobileNav a').forEach(anchor => anchor.addEventListener('click', () => toggleMenu(false)));
  function toggleSearch(show) {
    ui.searchBar.hidden = !show;
    if (show) ui.searchInput.focus();
    else ui.searchInput.value = '';
  }
  ui.searchToggle.addEventListener('click', () => toggleSearch(ui.searchBar.hidden));
  ui.searchBar.addEventListener('submit', event => {
    event.preventDefault();
    const query = ui.searchInput.value.trim().toLocaleLowerCase('en-GB');
    if (!query) return;
    const possible = [...$$('.attraction-card'), ...$$('.product-card')];
    const found = possible.find(card => card.textContent.toLocaleLowerCase('en-GB').includes(query));
    if (!found) { showToast('No matching items in this preview.'); return; }
    if (found.classList.contains('product-card')) setShopFilter('all');
    toggleSearch(false);
    found.scrollIntoView({ behavior: 'smooth', block: 'center' });
    found.animate([{ outline: '2px solid transparent' }, { outline: '2px solid #ff2d8b' }, { outline: '2px solid transparent' }], { duration: 1400 });
  });

  function selectInflatable(id, scroll = true) {
    if (!(id in inflatables)) return;
    selectedInflatable = id;
    $$('.attraction-card').forEach(card => {
      const active = $('[data-inflatable]', card).dataset.inflatable === id;
      card.classList.toggle('is-active', active);
      $('[data-inflatable]', card).setAttribute('aria-pressed', String(active));
    });
    if (scroll) {
      setBookingOpen(true);
      $('#booking').scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast(`${inflatables[id]} selected — now choose your date`);
    }
  }
  $$('#attractionGrid [data-inflatable]').forEach(button => button.addEventListener('click', () => selectInflatable(button.dataset.inflatable)));
  // On phones the calendar collapses into a drop-down so the balloons can play around the closed card.
  const bookingPanel = $('#booking'), bookingDropdown = $('#bookingDropdown');
  function setBookingOpen(open) {
    bookingPanel.classList.toggle('is-open', open);
    bookingDropdown.setAttribute('aria-expanded', String(open));
  }
  bookingDropdown.addEventListener('click', () => setBookingOpen(!bookingPanel.classList.contains('is-open')));
  $$('a[href="#booking"]').forEach(link => link.addEventListener('click', () => setBookingOpen(true)));
  ui.bookingAction.addEventListener('click', () => {
    if (!selectedDate) {
      showToast('Please select an available date on the calendar.');
      ui.calendarGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    ui.bookingSummary.replaceChildren();
    const product = document.createElement('strong'); product.textContent = inflatables[selectedInflatable];
    const date = document.createElement('div'); date.textContent = dateLabel(selectedDate);
    const demo = document.createElement('small'); demo.textContent = 'Availability preview only — not a confirmed booking';
    ui.bookingSummary.append(product, date, demo);
    openLayer(ui.bookingModal);
  });

  // Product card filters and favorites.
  function setShopFilter(filter) {
    $$('.filter-btn').forEach(button => {
      const active = button.dataset.filter === filter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $$('.product-card').forEach(card => { card.hidden = filter !== 'all' && card.dataset.category !== filter; });
  }
  $$('.filter-btn').forEach(button => button.addEventListener('click', () => setShopFilter(button.dataset.filter)));
  $$('[data-wish]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.wish;
    if (favourites.has(id)) favourites.delete(id);
    else favourites.add(id);
    button.setAttribute('aria-pressed', String(favourites.has(id)));
    showToast(favourites.has(id) ? 'Saved to your favourites' : 'Removed from favourites');
  }));

  function setQuantity(value) {
    quantity = Math.min(20, Math.max(1, value));
    ui.qtyValue.textContent = quantity;
    if (selectedProduct) ui.addPrice.textContent = formatGBP(catalogue[selectedProduct].price * quantity);
    $('#qtyMinus').disabled = quantity <= 1;
    $('#qtyPlus').disabled = quantity >= 20;
  }
  $('#qtyMinus').addEventListener('click', () => setQuantity(quantity - 1));
  $('#qtyPlus').addEventListener('click', () => setQuantity(quantity + 1));

  function selectSize(value) {
    selectedSize = value;
    $$('.size-option').forEach(btn => {
      const selected = btn.dataset.size === value;
      btn.classList.toggle('selected', selected);
      btn.setAttribute('aria-pressed', String(selected));
    });
  }
  function openSizeSelector(id) {
    if (!catalogue[id]) return;
    selectedProduct = id;
    selectedSize = '';
    setQuantity(1);
    const product = catalogue[id];
    ui.modalProduct.replaceChildren();
    const img = document.createElement('img'); img.src = product.image; img.alt = product.name;
    const details = document.createElement('div');
    const heading = document.createElement('h3'); heading.textContent = product.name;
    const info = document.createElement('p'); info.textContent = product.description;
    const price = document.createElement('strong'); price.textContent = formatGBP(product.price);
    details.append(heading, info, price); ui.modalProduct.append(img, details);
    ui.sizeGrid.replaceChildren();
    for (const size of product.sizes) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'size-option';
      button.textContent = size; button.dataset.size = size;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => selectSize(size));
      ui.sizeGrid.append(button);
    }
    $('#sizeTitle').textContent = 'Choose your size';
    openLayer(ui.sizeModal);
  }
  $$('[data-add]').forEach(button => button.addEventListener('click', () => openSizeSelector(button.dataset.add)));
  $('#confirmAdd').addEventListener('click', () => {
    if (!selectedProduct) return;
    if (!selectedSize) {
      showToast('Choose a size first.');
      const firstSize = $('.size-option', ui.sizeGrid); if (firstSize) firstSize.focus();
      return;
    }
    const existing = cart.find(item => item.id === selectedProduct && item.size === selectedSize);
    if (existing) existing.quantity += quantity;
    else cart.push({ id: selectedProduct, size: selectedSize, quantity });
    updateCart();
    closeLayer(false);
    showToast('Added to your bag');
    openLayer(ui.cartDrawer);
  });

  function updateCart() {
    const count = cart.reduce((total, item) => total + item.quantity, 0);
    const total = cart.reduce((sum, item) => sum + catalogue[item.id].price * item.quantity, 0);
    ui.cartCount.hidden = count === 0;
    ui.cartCount.textContent = count > 99 ? '99+' : String(count);
    ui.drawerCount.textContent = `(${count})`;
    ui.subtotal.textContent = formatGBP(total);
    ui.cartItems.replaceChildren();
    if (!count) {
      ui.cartItems.innerHTML = '<div class="empty-bag"><svg><use href="#i-bag"/></svg><p>Your bag is empty.</p><a href="#tshirts" class="button button-primary" data-close>Shop T-Shirts</a></div>';
      $('[data-close]', ui.cartItems).addEventListener('click', () => closeLayer());
      return;
    }
    for (const [index, item] of cart.entries()) {
      const product = catalogue[item.id];
      const row = document.createElement('div'); row.className = 'cart-row';
      const img = document.createElement('img'); img.src = product.image; img.alt = product.name;
      const middle = document.createElement('div');
      const heading = document.createElement('h3'); heading.textContent = product.name;
      const meta = document.createElement('p'); meta.textContent = `${product.description} · Size ${item.size} · Qty ${item.quantity}`;
      const cost = document.createElement('strong'); cost.textContent = formatGBP(product.price * item.quantity);
      middle.append(heading, meta, cost);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'cart-remove'; remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${product.name} size ${item.size} from bag`);
      remove.addEventListener('click', () => { cart.splice(index, 1); updateCart(); });
      row.append(img, middle, remove); ui.cartItems.append(row);
    }
  }
  ui.cartToggle.addEventListener('click', () => { updateCart(); openLayer(ui.cartDrawer); });

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); return true; } catch { /* use fallback */ }
    }
    const textArea = document.createElement('textarea');
    textArea.value = text; textArea.style.position = 'fixed'; textArea.style.left = '-9999px';
    document.body.append(textArea); textArea.select();
    try { return document.execCommand('copy'); }
    catch { return false; }
    finally { textArea.remove(); }
  }

  $('#exportCart').addEventListener('click', async () => {
    if (!cart.length) { showToast('Your bag is empty.'); return; }
    const rows = cart.map(item => `${catalogue[item.id].name} · Size ${item.size} × ${item.quantity} — ${formatGBP(catalogue[item.id].price * item.quantity)}`);
    const subtotal = cart.reduce((sum, item) => sum + catalogue[item.id].price * item.quantity, 0);
    const succeeded = await copyText(['Pinkies Play Well — bag preview', ...rows, `Subtotal: ${formatGBP(subtotal)}`, 'Prices illustrative; no order placed.'].join('\n'));
    showToast(succeeded ? 'Bag summary copied' : 'Could not copy the bag summary');
  });
  $('#enquiryForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity() || !selectedDate) return;
    const text = [
      'Pinkies Play Well — booking enquiry (preview)',
      `Inflatable: ${inflatables[selectedInflatable]}`,
      `Preferred date: ${dateLabel(selectedDate)}`,
      `Name: ${$('#customerName').value.trim()}`,
      `Email: ${$('#customerEmail').value.trim()}`,
      `Notes: ${$('#customerNotes').value.trim() || 'None'}`,
      'No booking has been submitted or confirmed.'
    ].join('\n');
    const success = await copyText(text);
    showToast(success ? 'Enquiry text copied — not submitted' : 'Unable to copy; no enquiry was submitted');
    if (success) closeLayer();
  });
  $('#copyrightYear').textContent = String(today.getFullYear());
  selectInflatable(selectedInflatable, false);
  renderCalendar();
  updateCart();
})();
