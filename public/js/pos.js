// POS Checkout Screen Logic

let currentSelectedCategory = 'all';
let currentPaymentMethod = 'cash';
let tempOrderCode = '';

// Initialize POS view
async function initPos() {
  await Promise.all([loadPosCategories(), loadPosProducts()]);
  setupPosListeners();
  updateCartUI();
}

// Load Categories for POS pills
async function loadPosCategories() {
  try {
    const cats = await api('/api/categories');
    state.categories = cats;

    const container = document.getElementById('posCategoryPills');
    const totalCount = state.products.length;
    document.getElementById('catTotalCount').textContent = totalCount;

    // Render pills
    const pillsHtml = cats.map(cat => `
      <button 
        onclick="filterPosCategory(${cat.id})" 
        class="cat-pill px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 whitespace-nowrap transition-all" 
        data-id="${cat.id}"
      >
        <span>${cat.icon || '📦'} ${cat.name}</span>
        <span class="text-slate-400 font-normal">(${cat.product_count})</span>
      </button>
    `).join('');

    container.innerHTML = `
      <button onclick="filterPosCategory('all')" class="cat-pill active px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white whitespace-nowrap shadow-sm transition-all" data-id="all">
        ✨ Tất cả (<span id="catTotalCount">${totalCount}</span>)
      </button>
      ${pillsHtml}
    `;
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

// Load Products for POS Grid
async function loadPosProducts() {
  try {
    const products = await api('/api/products');
    state.products = products;
    renderPosProducts(products);

    const totalCountEl = document.getElementById('catTotalCount');
    if (totalCountEl) totalCountEl.textContent = products.length;
  } catch (err) {
    console.error('Failed to load products:', err);
  }
}

// Render Products Grid
function renderPosProducts(productsToRender) {
  const grid = document.getElementById('posProductGrid');
  const emptyState = document.getElementById('posNoProducts');

  if (!productsToRender || productsToRender.length === 0) {
    grid.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  grid.innerHTML = productsToRender.map(p => {
    const isOutOfStock = p.stock <= 0;
    const isLowStock = p.stock > 0 && p.stock <= 10;

    let stockBadge = `<span class="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Còn ${p.stock}</span>`;
    if (isOutOfStock) {
      stockBadge = `<span class="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">Hết hàng</span>`;
    } else if (isLowStock) {
      stockBadge = `<span class="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">Còn ${p.stock}</span>`;
    }

    return `
      <div 
        onclick="${isOutOfStock ? `showToast('Sản phẩm đã hết hàng trong kho!', 'error')` : `handleProductClick(${p.id})`}"
        class="product-card bg-white border ${isOutOfStock ? 'opacity-60 border-slate-200 cursor-not-allowed' : 'border-slate-200/90 hover:border-blue-400 cursor-pointer'} rounded-xl p-3 flex flex-col justify-between shadow-sm relative group select-none"
      >
        <div>
          <!-- Icon / Image display -->
          <div class="h-16 w-full rounded-lg bg-slate-50 flex items-center justify-center text-3xl mb-2 group-hover:scale-105 transition-transform">
            ${p.image || '📦'}
          </div>

          <div class="flex items-center justify-between gap-1 mb-1">
            <span class="text-[10px] font-mono text-slate-400 truncate max-w-[90px]">${p.barcode}</span>
            ${stockBadge}
          </div>

          <h4 class="font-bold text-xs text-slate-800 line-clamp-2 leading-snug group-hover:text-blue-600 transition-colors">
            ${p.name}
          </h4>
        </div>

        <div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
          <span class="text-xs font-black text-blue-600">${formatMoney(p.price)}</span>
          <span class="text-[10px] text-slate-400">/${p.unit || 'cái'}</span>
        </div>
      </div>
    `;
  }).join('');
}

// Filter products by category
function filterPosCategory(catId) {
  currentSelectedCategory = catId;

  // Update pills UI
  document.querySelectorAll('.cat-pill').forEach(btn => {
    if (btn.dataset.id == String(catId)) {
      btn.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
      btn.classList.remove('bg-slate-100', 'text-slate-700', 'hover:bg-slate-200');
    } else {
      btn.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
      btn.classList.add('bg-slate-100', 'text-slate-700', 'hover:bg-slate-200');
    }
  });

  applyPosFilters();
}

// Apply Category & Search filter together
function applyPosFilters() {
  const searchTerm = (document.getElementById('posSearchInput').value || '').trim().toLowerCase();

  const filtered = state.products.filter(p => {
    const matchesCat = currentSelectedCategory === 'all' || p.category_id == currentSelectedCategory;
    const matchesSearch = !searchTerm || 
      p.name.toLowerCase().includes(searchTerm) || 
      p.barcode.toLowerCase().includes(searchTerm);
    return matchesCat && matchesSearch;
  });

  renderPosProducts(filtered);
}

// Setup search & barcode scanner listeners
function setupPosListeners() {
  const searchInput = document.getElementById('posSearchInput');
  const clearBtn = document.getElementById('posClearSearch');

  searchInput.addEventListener('input', () => {
    if (searchInput.value.trim().length > 0) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
    }
    applyPosFilters();
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.classList.add('hidden');
    applyPosFilters();
    searchInput.focus();
  });

  // Handle Enter key for Barcode Scanner
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const term = searchInput.value.trim();
      if (!term) return;

      // Check exact barcode match first
      const exactProduct = state.products.find(p => p.barcode.toLowerCase() === term.toLowerCase());
      if (exactProduct) {
        if (exactProduct.stock <= 0) {
          showToast(`Sản phẩm "${exactProduct.name}" đã hết hàng!`, 'error');
        } else {
          addToCart(exactProduct);
          showToast(`Đã thêm "${exactProduct.name}"`);
        }
        searchInput.value = '';
        clearBtn.classList.add('hidden');
        applyPosFilters();
        return;
      }

      // Check if single matching product
      const matches = state.products.filter(p => 
        p.name.toLowerCase().includes(term.toLowerCase()) || 
        p.barcode.toLowerCase().includes(term.toLowerCase())
      );
      if (matches.length === 1) {
        if (matches[0].stock <= 0) {
          showToast(`Sản phẩm "${matches[0].name}" đã hết hàng!`, 'error');
        } else {
          addToCart(matches[0]);
          showToast(`Đã thêm "${matches[0].name}"`);
        }
        searchInput.value = '';
        clearBtn.classList.add('hidden');
        applyPosFilters();
      }
    }
  });
}

// Handle clicking on product card
function handleProductClick(prodId) {
  const product = state.products.find(p => p.id === prodId);
  if (!product) return;

  addToCart(product);
}

// Add product to cart
function addToCart(product) {
  const existing = state.cart.find(item => item.id === product.id);
  if (existing) {
    if (existing.quantity >= product.stock) {
      showToast(`Số lượng vượt quá tồn kho hiện có (${product.stock})`, 'error');
      return;
    }
    existing.quantity += 1;
  } else {
    state.cart.push({
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      price: product.price,
      cost_price: product.cost_price || 0,
      unit: product.unit || 'cái',
      stock: product.stock,
      image: product.image || '📦',
      quantity: 1
    });
  }

  updateCartUI();
}

// Remove item from cart
function removeFromCart(productId) {
  state.cart = state.cart.filter(item => item.id !== productId);
  updateCartUI();
}

// Update item quantity
function updateCartQty(productId, delta) {
  const item = state.cart.find(i => i.id === productId);
  if (!item) return;

  const newQty = item.quantity + delta;
  if (newQty <= 0) {
    removeFromCart(productId);
    return;
  }

  if (newQty > item.stock) {
    showToast(`Kho chỉ còn ${item.stock} ${item.unit}`, 'error');
    return;
  }

  item.quantity = newQty;
  updateCartUI();
}

// Set exact quantity via input
function setExactCartQty(productId, val) {
  const item = state.cart.find(i => i.id === productId);
  if (!item) return;

  let qty = parseInt(val, 10);
  if (isNaN(qty) || qty <= 0) qty = 1;
  if (qty > item.stock) {
    qty = item.stock;
    showToast(`Kho chỉ còn ${item.stock} ${item.unit}`, 'error');
  }

  item.quantity = qty;
  updateCartUI();
}

// Clear cart
function clearCart() {
  if (state.cart.length === 0) return;
  if (confirm('Bạn có chắc muốn làm trống giỏ hàng này?')) {
    state.cart = [];
    document.getElementById('cartDiscountValue').value = 0;
    updateCartUI();
    showToast('Đã làm trống giỏ hàng');
  }
}

// Update Cart UI & Calculation
function updateCartUI() {
  const itemsContainer = document.getElementById('cartItemsList');
  const emptyState = document.getElementById('cartEmptyState');
  const badgeCount = document.getElementById('cartBadgeCount');
  const btnCheckout = document.getElementById('btnOpenCheckout');

  const totalItemCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  badgeCount.textContent = `${totalItemCount} món`;
  document.getElementById('cartTotalItemsCount').textContent = totalItemCount;

  if (state.cart.length === 0) {
    itemsContainer.innerHTML = '';
    emptyState.classList.remove('hidden');
    btnCheckout.disabled = true;
    updateCartTotals();
    return;
  }

  emptyState.classList.add('hidden');
  btnCheckout.disabled = false;

  itemsContainer.innerHTML = state.cart.map(item => `
    <div class="cart-item bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 flex items-center justify-between gap-2 hover:bg-slate-100/60 transition-colors">
      <!-- Item info -->
      <div class="flex-1 min-w-0">
        <h5 class="text-xs font-bold text-slate-800 truncate">${item.name}</h5>
        <div class="text-[11px] text-slate-500 flex items-center space-x-1.5 mt-0.5">
          <span class="text-blue-600 font-semibold">${formatMoney(item.price)}</span>
          <span>•</span>
          <span class="text-slate-400 font-mono text-[10px]">${item.barcode}</span>
        </div>
      </div>

      <!-- Qty controls -->
      <div class="flex items-center space-x-1 shrink-0 bg-white border border-slate-300 rounded-lg p-0.5 shadow-2xs">
        <button onclick="updateCartQty(${item.id}, -1)" class="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:bg-slate-100 active:bg-slate-200 text-xs">
          <i class="fa-solid fa-minus"></i>
        </button>
        <input 
          type="number" 
          value="${item.quantity}" 
          min="1" 
          max="${item.stock}" 
          class="w-10 text-center text-xs font-bold bg-transparent focus:outline-none"
          onchange="setExactCartQty(${item.id}, this.value)"
        >
        <button onclick="updateCartQty(${item.id}, 1)" class="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:bg-slate-100 active:bg-slate-200 text-xs">
          <i class="fa-solid fa-plus"></i>
        </button>
      </div>

      <!-- Item Total & Delete -->
      <div class="text-right shrink-0 min-w-[70px]">
        <div class="text-xs font-black text-slate-800">${formatMoney(item.price * item.quantity)}</div>
        <button onclick="removeFromCart(${item.id})" class="text-[11px] text-rose-500 hover:text-rose-700 transition-colors mt-0.5 inline-block">
          <i class="fa-regular fa-trash-can"></i>
        </button>
      </div>
    </div>
  `).join('');

  updateCartTotals();
}

// Compute cart totals
function updateCartTotals() {
  const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discountInput = Number(document.getElementById('cartDiscountValue').value) || 0;
  const discountType = document.getElementById('cartDiscountType').value;

  let discountAmount = 0;
  if (discountType === 'percent') {
    discountAmount = Math.round((subtotal * Math.min(100, Math.max(0, discountInput))) / 100);
  } else {
    discountAmount = Math.min(subtotal, Math.max(0, discountInput));
  }

  const finalTotal = Math.max(0, subtotal - discountAmount);

  document.getElementById('cartSubtotal').textContent = formatMoney(subtotal);
  document.getElementById('cartFinalTotal').textContent = formatMoney(finalTotal);

  // Update Mobile Floating Cart
  const floatingBadge = document.getElementById('mobileFloatingBadge');
  const floatingTotal = document.getElementById('mobileFloatingTotal');
  const totalItemCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  if (floatingBadge) floatingBadge.textContent = totalItemCount;
  if (floatingTotal) floatingTotal.textContent = formatMoney(finalTotal);

  return { subtotal, discountAmount, discountType, discountInput, finalTotal };
}

// =============================================================
// CHECKOUT MODAL FLOW
// =============================================================
function openCheckoutModal() {
  if (state.cart.length === 0) return;

  const { finalTotal } = updateCartTotals();
  const customerName = document.getElementById('customerNameInput').value.trim() || 'Khách lẻ';
  const totalItemCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);

  // Generate temporary order code for QR code memo
  const now = new Date();
  const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
  tempOrderCode = `HD-${dateStr}-${String(Math.floor(1000 + Math.random() * 9000))}`;

  document.getElementById('checkoutOrderCodePreview').textContent = `Mã đơn dự kiến: ${tempOrderCode}`;
  document.getElementById('checkoutModalTotal').textContent = formatMoney(finalTotal);
  document.getElementById('checkoutModalItemCount').textContent = totalItemCount;
  document.getElementById('checkoutModalCustomer').textContent = customerName;

  const cashierEl = document.getElementById('checkoutModalCashier');
  if (cashierEl) {
    cashierEl.textContent = state.currentUser ? state.currentUser.name : 'Thu ngân';
  }

  // Setup Cash payment default
  const cashInput = document.getElementById('cashGivenInput');
  cashInput.value = finalTotal.toLocaleString('vi-VN');
  handleCashGivenInput(String(finalTotal));

  // Render quick cash buttons
  renderQuickCashButtons(finalTotal);

  // Setup VietQR
  setupVietQRDisplay(finalTotal, tempOrderCode);

  // Reset to default payment method
  setPaymentMethod('cash');

  document.getElementById('checkoutModal').classList.remove('hidden');
}

function closeCheckoutModal() {
  document.getElementById('checkoutModal').classList.add('hidden');
}

function setPaymentMethod(method) {
  currentPaymentMethod = method;

  const btnCash = document.getElementById('btnMethodCash');
  const btnVietQR = document.getElementById('btnMethodVietQR');
  const secCash = document.getElementById('paySectionCash');
  const secVietQR = document.getElementById('paySectionVietQR');

  if (method === 'cash') {
    btnCash.className = 'py-2.5 rounded-lg text-sm font-bold flex items-center justify-center space-x-2 transition-all bg-white text-emerald-600 shadow-sm';
    btnVietQR.className = 'py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center space-x-2 transition-all text-slate-600 hover:text-slate-900';
    secCash.classList.remove('hidden');
    secVietQR.classList.add('hidden');
  } else {
    btnVietQR.className = 'py-2.5 rounded-lg text-sm font-bold flex items-center justify-center space-x-2 transition-all bg-white text-blue-600 shadow-sm';
    btnCash.className = 'py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center space-x-2 transition-all text-slate-600 hover:text-slate-900';
    secVietQR.classList.remove('hidden');
    secCash.classList.add('hidden');
  }
}

// Generate VietQR Image URL
function setupVietQRDisplay(amount, orderCode) {
  const bankId = state.settings.bank_id || 'MB';
  const accountNo = state.settings.bank_account_no || '0909888999';
  const accountName = state.settings.bank_account_name || 'NGUYEN VAN POS';
  const memo = orderCode;

  // Standard Napas VietQR compact2 image URL
  const qrUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(accountName)}`;

  document.getElementById('vietQrImg').src = qrUrl;
  document.getElementById('vietQrBankDisplay').textContent = bankId;
  document.getElementById('vietQrAccountDisplay').textContent = accountNo;
  document.getElementById('vietQrNameDisplay').textContent = accountName;
  document.getElementById('vietQrMemoDisplay').textContent = memo;
}

// Quick Cash Buttons
function renderQuickCashButtons(total) {
  const container = document.getElementById('quickCashButtons');
  
  // Standard preset denominations
  const presets = [
    { label: 'Đúng tiền', val: total },
    { label: '20.000 ₫', val: 20000 },
    { label: '50.000 ₫', val: 50000 },
    { label: '100.000 ₫', val: 100000 },
    { label: '200.000 ₫', val: 200000 },
    { label: '500.000 ₫', val: 500000 },
    { label: '1.000.000 ₫', val: 1000000 },
    { label: '2.000.000 ₫', val: 2000000 }
  ];

  container.innerHTML = presets.map(p => `
    <button 
      type="button" 
      onclick="setCashGiven(${p.val})" 
      class="py-1.5 px-2 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition-colors"
    >
      ${p.label}
    </button>
  `).join('');
}

function setCashGiven(val) {
  document.getElementById('cashGivenInput').value = val.toLocaleString('vi-VN');
  handleCashGivenInput(String(val));
}

function handleCashGivenInput(rawVal) {
  const cleanNum = Number(String(rawVal).replace(/\D/g, '')) || 0;
  const { finalTotal } = updateCartTotals();
  const change = cleanNum - finalTotal;

  const changeEl = document.getElementById('cashChangeReturn');
  if (change >= 0) {
    changeEl.className = 'text-xl font-black text-emerald-600';
    changeEl.textContent = formatMoney(change);
  } else {
    changeEl.className = 'text-xl font-black text-rose-600';
    changeEl.textContent = `Thiếu ${formatMoney(Math.abs(change))}`;
  }
}

// Complete Order Checkout
async function completeCheckoutOrder() {
  const btnConfirm = document.getElementById('btnConfirmPayment');
  btnConfirm.disabled = true;

  try {
    const { finalTotal, discountAmount, discountType, discountInput } = updateCartTotals();
    const customerName = document.getElementById('customerNameInput').value.trim() || 'Khách lẻ';
    const customerPhone = document.getElementById('customerPhoneInput').value.trim();

    let cashGiven = finalTotal;
    if (currentPaymentMethod === 'cash') {
      const rawCash = document.getElementById('cashGivenInput').value;
      cashGiven = Number(String(rawCash).replace(/\D/g, '')) || finalTotal;
      if (cashGiven < finalTotal) {
        showToast('Số tiền khách đưa không đủ!', 'error');
        btnConfirm.disabled = false;
        return;
      }
    }

    const payload = {
      items: state.cart.map(item => ({
        id: item.id,
        quantity: item.quantity
      })),
      discount: discountInput,
      discount_type: discountType,
      cash_given: cashGiven,
      payment_method: currentPaymentMethod,
      customer_name: customerName,
      customer_phone: customerPhone
    };

    const newOrder = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    closeCheckoutModal();

    // Trigger celebration confetti
    try {
      if (typeof confetti === 'function') {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
    } catch (e) {}

    showToast(`Đã thanh toán thành công đơn hàng ${newOrder.order_code}!`);

    // Auto print receipt if checked
    const shouldPrint = document.getElementById('autoPrintReceiptCheck').checked;
    if (shouldPrint) {
      printReceipt(newOrder);
    }

    // Reset Cart
    state.cart = [];
    document.getElementById('customerNameInput').value = 'Khách lẻ';
    document.getElementById('customerPhoneInput').value = '';
    document.getElementById('cartDiscountValue').value = 0;
    updateCartUI();

    // Reload products to update current stock
    await loadPosProducts();

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnConfirm.disabled = false;
  }
}

// =============================================================
// THERMAL RECEIPT PRINTING (80mm / 58mm)
// =============================================================
function generateReceiptHtml(order) {
  const storeName = state.settings.store_name || 'CỬA HÀNG TẠP HÓA POS';
  const storeAddress = state.settings.store_address || '';
  const storePhone = state.settings.store_phone || '';
  const storeGreeting = state.settings.store_greeting || 'Cảm ơn quý khách và hẹn gặp lại!';

  const itemsHtml = (order.items || []).map((item, idx) => `
    <tr>
      <td colspan="3" style="font-weight: bold; padding-top: 4px;">${idx + 1}. ${item.product_name}</td>
    </tr>
    <tr>
      <td style="padding-left: 12px;">${item.quantity} x ${formatMoney(item.price)}</td>
      <td style="text-align: right; font-weight: bold;">${formatMoney(item.total)}</td>
    </tr>
  `).join('');

  const methodText = order.payment_method === 'vietqr' ? 'Chuyển khoản (VietQR)' : 'Tiền mặt';

  return `
    <div class="receipt-title">${storeName}</div>
    <div class="receipt-header">
      ${storeAddress ? `<div>${storeAddress}</div>` : ''}
      ${storePhone ? `<div>ĐT: ${storePhone}</div>` : ''}
      <div style="margin-top: 4px; font-weight: bold; font-size: 13px;">HÓA ĐƠN BÁN HÀNG</div>
      <div style="font-family: monospace;">Số HĐ: ${order.order_code}</div>
      <div>Ngày: ${formatDateTime(order.created_at)}</div>
      <div>Thu ngân: <strong>${order.cashier_name || 'Thu ngân'}</strong></div>
      <div>Khách hàng: ${order.customer_name || 'Khách lẻ'} ${order.customer_phone ? `(${order.customer_phone})` : ''}</div>
    </div>

    <table class="receipt-table">
      <thead>
        <tr>
          <th>Tên hàng / SL x Đơn giá</th>
          <th style="text-align: right;">Thành tiền</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div class="receipt-divider"></div>

    <table class="receipt-summary">
      <tr>
        <td>Tạm tính:</td>
        <td style="text-align: right;">${formatMoney(order.subtotal)}</td>
      </tr>
      ${order.discount > 0 ? `
      <tr>
        <td>Giảm giá:</td>
        <td style="text-align: right;">-${formatMoney(order.discount)}</td>
      </tr>
      ` : ''}
      <tr class="receipt-total">
        <td>TỔNG CỘNG:</td>
        <td style="text-align: right;">${formatMoney(order.total)}</td>
      </tr>
      <tr>
        <td>Hình thức:</td>
        <td style="text-align: right; font-weight: bold;">${methodText}</td>
      </tr>
      ${order.payment_method === 'cash' ? `
      <tr>
        <td>Tiền khách đưa:</td>
        <td style="text-align: right;">${formatMoney(order.cash_given)}</td>
      </tr>
      <tr>
        <td>Tiền thừa trả lại:</td>
        <td style="text-align: right; font-weight: bold;">${formatMoney(order.change_returned)}</td>
      </tr>
      ` : ''}
    </table>

    <div class="receipt-footer">
      <div>${storeGreeting}</div>
      <div style="margin-top: 4px; font-size: 10px;">Phần mềm POS Pro • Hotline: ${storePhone}</div>
    </div>
  `;
}

// =============================================================
// WEB BLUETOOTH ESC/POS MOBILE THERMAL PRINTING
// =============================================================
let bluetoothDevice = null;
let bluetoothCharacteristic = null;

// Remove accents helper for thermal printer compatibility
function removeVietnameseAccents(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

// Format line with left and right columns (e.g. 32 chars for 58mm, 48 chars for 80mm)
function formatLineColumns(left, right, width = 32) {
  const l = removeVietnameseAccents(String(left));
  const r = removeVietnameseAccents(String(right));
  const spaceCount = Math.max(1, width - l.length - r.length);
  return l + ' '.repeat(spaceCount) + r + '\n';
}

// Connect to Bluetooth Thermal Printer
async function connectBluetoothPrinter() {
  if (!navigator.bluetooth) {
    showToast('Trình duyệt này chưa hỗ trợ Web Bluetooth. Vui lòng dùng Google Chrome trên điện thoại Android, hoặc in qua máy in Wi-Fi!', 'error');
    return;
  }

  try {
    showToast('Đang quét tìm máy in Bluetooth gần bạn...');
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        '000018f0-0000-1000-8000-00805f9b34fb', // OEM standard
        '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC transparent
        '0000ff00-0000-1000-8000-00805f9b34fb',
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2'
      ]
    });

    const server = await device.gatt.connect();
    
    // Search for writable characteristic
    let foundChar = null;
    const services = await server.getPrimaryServices();
    for (const service of services) {
      const chars = await service.getCharacteristics();
      for (const char of chars) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          foundChar = char;
          break;
        }
      }
      if (foundChar) break;
    }

    if (!foundChar) {
      throw new Error('Không tìm thấy cổng ghi dữ liệu in trên thiết bị này');
    }

    bluetoothDevice = device;
    bluetoothCharacteristic = foundChar;

    device.addEventListener('gattserverdisconnected', () => {
      bluetoothDevice = null;
      bluetoothCharacteristic = null;
      updatePrinterStatusBadge();
      showToast('Máy in Bluetooth đã ngắt kết nối', 'error');
    });

    updatePrinterStatusBadge();
    showToast(`Đã kết nối máy in: ${device.name || 'Bluetooth Printer'}`);
  } catch (err) {
    console.error('Bluetooth error:', err);
    showToast('Lỗi kết nối Bluetooth: ' + (err.message || 'Hủy chọn'), 'error');
  }
}

function updatePrinterStatusBadge() {
  const badge = document.getElementById('printerStatusBtn');
  if (!badge) return;

  if (bluetoothCharacteristic) {
    badge.className = 'px-2.5 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-semibold border border-emerald-300 transition-colors flex items-center space-x-1.5';
    badge.innerHTML = `<i class="fa-solid fa-print text-emerald-600"></i><span class="hidden sm:inline">Máy in:</span> <span>${bluetoothDevice.name || 'Sẵn sàng'}</span>`;
  } else {
    badge.className = 'px-2.5 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg text-xs font-semibold border border-slate-200 transition-colors flex items-center space-x-1.5';
    badge.innerHTML = `<i class="fa-solid fa-print text-slate-400"></i><span class="hidden sm:inline">Kết nối</span> <span>Máy In</span>`;
  }
}

// Send ESC/POS commands over Bluetooth
async function printEscPosBluetooth(order) {
  if (!bluetoothCharacteristic) {
    throw new Error('Chưa kết nối máy in Bluetooth');
  }

  const storeName = state.settings.store_name || 'CUA HANG TAP HOA POS';
  const storeAddress = state.settings.store_address || '';
  const storePhone = state.settings.store_phone || '';
  const is58mm = (state.settings.paper_size || '80mm') === '58mm';
  const lineWidth = is58mm ? 32 : 48;
  const divider = '-'.repeat(lineWidth) + '\n';

  // Construct raw ESC/POS text
  let content = '';

  // Initialize printer
  content += '\x1B\x40'; // ESC @ (Reset)
  
  // Center alignment for Header
  content += '\x1B\x61\x01'; // ESC a 1 (Align Center)
  content += '\x1B\x45\x01'; // Bold ON
  content += '\x1D\x21\x01'; // Double height
  content += removeVietnameseAccents(storeName) + '\n';
  content += '\x1D\x21\x00'; // Normal size
  content += '\x1B\x45\x00'; // Bold OFF

  if (storeAddress) content += removeVietnameseAccents(storeAddress) + '\n';
  if (storePhone) content += 'DT: ' + storePhone + '\n';
  
  content += '\x1B\x45\x01'; // Bold ON
  content += 'HOA DON BAN HANG\n';
  content += '\x1B\x45\x00'; // Bold OFF
  content += 'So HD: ' + order.order_code + '\n';
  content += 'Ngay: ' + formatDateTime(order.created_at) + '\n';
  content += 'Thu ngan: ' + removeVietnameseAccents(order.cashier_name || 'Thu ngan') + '\n';
  content += 'Khach hang: ' + removeVietnameseAccents(order.customer_name || 'Khach le') + '\n';

  content += '\x1B\x61\x00'; // ESC a 0 (Align Left)
  content += divider;
  content += formatLineColumns('TEN HANG / SL', 'THANH TIEN', lineWidth);
  content += divider;

  for (let i = 0; i < (order.items || []).length; i++) {
    const it = order.items[i];
    content += `${i + 1}. ${removeVietnameseAccents(it.product_name)}\n`;
    const qtyPrice = `   ${it.quantity} ${removeVietnameseAccents(it.unit || '')} x ${formatMoney(it.price)}`;
    const lineTotal = formatMoney(it.total);
    content += formatLineColumns(qtyPrice, lineTotal, lineWidth);
  }

  content += divider;
  content += formatLineColumns('Tam tinh:', formatMoney(order.subtotal), lineWidth);
  if (order.discount > 0) {
    content += formatLineColumns('Giam gia:', '-' + formatMoney(order.discount), lineWidth);
  }
  content += '\x1B\x45\x01'; // Bold ON
  content += formatLineColumns('TONG CONG:', formatMoney(order.total), lineWidth);
  content += '\x1B\x45\x00'; // Bold OFF

  const methodText = order.payment_method === 'vietqr' ? 'Chuyen khoan VietQR' : 'Tien mat';
  content += formatLineColumns('Hinh thuc:', methodText, lineWidth);
  if (order.payment_method === 'cash') {
    content += formatLineColumns('Tien khach dua:', formatMoney(order.cash_given), lineWidth);
    content += formatLineColumns('Tien thua:', formatMoney(order.change_returned), lineWidth);
  }

  content += divider;
  content += '\x1B\x61\x01'; // Align Center
  content += removeVietnameseAccents(state.settings.store_greeting || 'Cam on quy khach va hen gap lai!') + '\n';
  content += 'Hotline: ' + storePhone + '\n';
  
  // Feed lines & cut paper
  content += '\n\n\n\n\x1D\x56\x01'; // GS V 1 (Feed and partial cut)

  // Convert string to Uint8Array
  const encoder = new TextEncoder();
  const data = encoder.encode(content);

  // Send chunks of 100 bytes to avoid Bluetooth buffer overflow
  const chunkSize = 100;
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const chunk = data.slice(offset, offset + chunkSize);
    if (bluetoothCharacteristic.writeValueWithoutResponse) {
      await bluetoothCharacteristic.writeValueWithoutResponse(chunk);
    } else {
      await bluetoothCharacteristic.writeValue(chunk);
    }
    // Small delay between chunks
    await new Promise(r => setTimeout(r, 25));
  }
}

// Print Receipt (Auto decides Bluetooth vs Browser Print)
async function printReceipt(order) {
  if (bluetoothCharacteristic) {
    try {
      showToast('Đang gửi lệnh in tới máy in Bluetooth...');
      await printEscPosBluetooth(order);
      showToast('Đã in hóa đơn thành công!');
      return;
    } catch (err) {
      console.warn('Bluetooth print failed, falling back to window.print:', err);
      showToast('Lỗi in Bluetooth, chuyển sang in qua trình duyệt: ' + err.message, 'error');
    }
  }

  // Fallback to standard thermal receipt window.print() (works on iOS AirPrint, Wi-Fi printers, PC)
  const receiptContainer = document.getElementById('printable-receipt');
  if (receiptContainer) {
    receiptContainer.innerHTML = generateReceiptHtml(order);
    window.print();
  }
}

// Open/Close Printer Modal
function openPrinterModal() {
  const tag = document.getElementById('bluetoothStatusTag');
  if (tag) {
    if (bluetoothCharacteristic) {
      tag.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800';
      tag.textContent = bluetoothDevice ? bluetoothDevice.name || 'Đã kết nối' : 'Đã kết nối';
    } else {
      tag.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600';
      tag.textContent = 'Chưa kết nối';
    }
  }

  const paperSelect = document.getElementById('quickPaperSizeSelect');
  if (paperSelect) {
    paperSelect.value = state.settings.paper_size || '80mm';
  }

  document.getElementById('printerModal').classList.remove('hidden');
}

function closePrinterModal() {
  document.getElementById('printerModal').classList.add('hidden');
}

// Change Paper Size on the fly
async function changeQuickPaperSize(val) {
  state.settings.paper_size = val;
  try {
    if (state.currentUser && state.currentUser.role === 'admin') {
      await api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ paper_size: val })
      });
    }
    showToast(`Đã chuyển sang khổ giấy: ${val}`);
  } catch (e) {
    showToast(`Đã chọn khổ giấy: ${val}`);
  }
}

// Test Print Sample Receipt
function testPrintSample() {
  const sampleOrder = {
    order_code: 'HD-TEST-SAMPLE',
    created_at: new Date().toISOString(),
    cashier_name: state.currentUser ? state.currentUser.name : 'Thu ngân',
    customer_name: 'Khách thử nghiệm',
    customer_phone: '0901234567',
    subtotal: 35000,
    discount: 5000,
    total: 30000,
    payment_method: 'cash',
    cash_given: 50000,
    change_returned: 20000,
    items: [
      { product_name: 'Coca Cola 320ml', unit: 'lon', quantity: 2, price: 10000, total: 20000 },
      { product_name: 'Bánh Snack Oishi', unit: 'gói', quantity: 1, price: 15000, total: 15000 }
    ]
  };

  printReceipt(sampleOrder);
}
