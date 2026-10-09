// =============================================================
// POS ORDER - WEB ORDER PAD & CHECKOUT LOGIC
// =============================================================

let currentSelectedCategory = 'all';
let currentPaymentMethod = 'vietqr';
let tempOrderCode = '';

// Kiểm tra chuỗi có phải ảnh thực sự (base64 hoặc URL)
function isActualImage(str) {
  return typeof str === 'string' && (str.startsWith('data:image') || str.startsWith('http') || str.startsWith('/'));
}

// Initialize POS view
async function initPos() {
  await Promise.all([loadPosCategories(), loadPosProducts()]);
  setupPosListeners();
  selectTable(state.selectedTable || 'Bàn 1');
  updateCartUI();
}

// =============================================================
// TABLE SELECTOR (BÀN 1..5 / MANG VỀ)
// =============================================================
function selectTable(tableName) {
  state.selectedTable = tableName;

  // Update header in cart
  const currentTableEl = document.getElementById('currentTableDisplay');
  if (currentTableEl) currentTableEl.textContent = tableName;

  const mobileTableEl = document.getElementById('mobileFloatingTable');
  if (mobileTableEl) mobileTableEl.textContent = tableName;

  const checkoutTableEl = document.getElementById('checkoutModalTable');
  if (checkoutTableEl) checkoutTableEl.textContent = tableName;

  // Check if custom table pill exists, if not, create one
  const container = document.getElementById('quickTablePills');
  let matched = false;
  const pills = document.querySelectorAll('#quickTablePills .table-pill');
  pills.forEach(btn => {
    if (btn.textContent.trim() === tableName) {
      matched = true;
      btn.className = 'table-pill active px-3 py-1 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-xs';
    } else {
      btn.className = 'table-pill px-3 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors';
    }
  });

  if (!matched && container) {
    const newBtn = document.createElement('button');
    newBtn.onclick = () => selectTable(tableName);
    newBtn.className = 'table-pill active px-3 py-1 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-xs';
    newBtn.textContent = tableName;
    // Insert before the last button (+ Bàn...)
    const lastBtn = container.querySelector('button:last-child');
    container.insertBefore(newBtn, lastBtn);
  }
}

function promptCustomTable() {
  const custom = prompt('Nhập số bàn hoặc tên gọi (VD: Bàn 6, Bàn VIP, Sân thượng...):', '');
  if (custom && custom.trim()) {
    selectTable(custom.trim());
    showToast(`Đã chọn: ${custom.trim()}`);
  }
}

// =============================================================
// CATEGORIES & PRODUCTS RENDER
// =============================================================
async function loadPosCategories() {
  try {
    const cats = await api('/api/categories');
    state.categories = cats;

    const container = document.getElementById('posCategoryPills');
    if (!container) return;

    const pillsHtml = cats.map(cat => `
      <button 
        onclick="filterPosCategory(${cat.id})" 
        class="cat-pill px-3 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 whitespace-nowrap transition-colors" 
        data-id="${cat.id}"
      >
        <span>${cat.name}</span>
      </button>
    `).join('');

    container.innerHTML = `
      <button onclick="filterPosCategory('all')" class="cat-pill active px-3 py-1 rounded-lg text-xs font-bold bg-slate-800 text-white whitespace-nowrap shadow-xs transition-colors" data-id="all">
        Tất cả
      </button>
      ${pillsHtml}
    `;
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

function filterPosCategory(catId) {
  currentSelectedCategory = catId;

  document.querySelectorAll('#posCategoryPills .cat-pill').forEach(btn => {
    if (btn.dataset.id == String(catId)) {
      btn.className = 'cat-pill active px-3 py-1 rounded-lg text-xs font-bold bg-slate-800 text-white whitespace-nowrap shadow-xs';
    } else {
      btn.className = 'cat-pill px-3 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 whitespace-nowrap transition-colors';
    }
  });

  applyPosFilters();
}

async function loadPosProducts() {
  try {
    const products = await api('/api/products');
    state.products = products;
    applyPosFilters();
  } catch (err) {
    console.error('Failed to load products:', err);
  }
}

function applyPosFilters() {
  const searchTerm = (document.getElementById('posSearchInput')?.value || '').trim().toLowerCase();

  const filtered = state.products.filter(p => {
    const matchesCat = currentSelectedCategory === 'all' || p.category_id == currentSelectedCategory;
    const matchesSearch = !searchTerm || p.name.toLowerCase().includes(searchTerm);
    return matchesCat && matchesSearch;
  });

  renderPosProducts(filtered);
}

// Render Menu Cards (Tối giản, trực quan, ảnh to, giá rõ ràng)
function renderPosProducts(productsToRender) {
  const grid = document.getElementById('posProductGrid');
  const emptyState = document.getElementById('posNoProducts');
  if (!grid) return;

  if (!productsToRender || productsToRender.length === 0) {
    grid.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  grid.innerHTML = productsToRender.map(p => {
    // Check if dish is already in current cart
    const cartItem = state.cart.find(c => c.id === p.id);
    const hasInCart = !!cartItem;
    const qty = cartItem ? cartItem.quantity : 0;
    const hasImage = isActualImage(p.image);

    return `
      <div 
        onclick="handleProductClick(${p.id})"
        class="product-card relative bg-white border ${hasInCart ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/10' : 'border-slate-200 hover:border-blue-300'} rounded-2xl p-3 flex flex-col justify-between cursor-pointer shadow-xs select-none transition-all"
      >
        ${hasInCart ? `
          <span class="absolute top-2 right-2 bg-blue-600 text-white text-[11px] font-black w-6 h-6 rounded-full flex items-center justify-center shadow-xs z-10">
            ${qty}
          </span>
        ` : ''}

        <!-- Ảnh món hoặc khung giữ chỗ -->
        ${hasImage ? `
          <div class="h-28 w-full rounded-xl overflow-hidden bg-slate-100 mb-2 border border-slate-100 shadow-2xs">
            <img src="${p.image}" alt="${p.name}" class="w-full h-full object-cover">
          </div>
        ` : `
          <div class="h-24 w-full rounded-xl bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center text-slate-300 mb-2">
            <i class="fa-regular fa-image text-2xl"></i>
          </div>
        `}

        <div>
          <h4 class="font-bold text-xs sm:text-sm text-slate-800 line-clamp-2 leading-snug">
            ${p.name}
          </h4>
        </div>

        <div class="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between">
          <span class="text-xs sm:text-sm font-black text-blue-600">${formatMoney(p.price)}</span>
        </div>
      </div>
    `;
  }).join('');
}

function setupPosListeners() {
  const searchInput = document.getElementById('posSearchInput');
  const clearBtn = document.getElementById('posClearSearch');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (searchInput.value.trim().length > 0) {
        clearBtn?.classList.remove('hidden');
      } else {
        clearBtn?.classList.add('hidden');
      }
      applyPosFilters();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      clearBtn.classList.add('hidden');
      applyPosFilters();
      searchInput?.focus();
    });
  }
}

// =============================================================
// CART LOGIC (GỌI MÓN THEO BÀN)
// =============================================================
function handleProductClick(prodId) {
  const product = state.products.find(p => p.id === prodId);
  if (!product) return;

  const existing = state.cart.find(item => item.id === product.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image || '',
      quantity: 1
    });
  }

  updateCartUI();
}

function updateCartQty(productId, delta) {
  const item = state.cart.find(i => i.id === productId);
  if (!item) return;

  const newQty = item.quantity + delta;
  if (newQty <= 0) {
    removeFromCart(productId);
    return;
  }

  item.quantity = newQty;
  updateCartUI();
}

function removeFromCart(productId) {
  state.cart = state.cart.filter(item => item.id !== productId);
  updateCartUI();
}

function clearCart() {
  if (state.cart.length === 0) return;
  if (confirm(`Hủy toàn bộ món đang chọn cho ${state.selectedTable}?`)) {
    state.cart = [];
    const note = document.getElementById('orderNoteInput');
    if (note) note.value = '';
    updateCartUI();
    showToast('Đã làm trống order');
  }
}

function updateCartUI() {
  const itemsContainer = document.getElementById('cartItemsList');
  const emptyState = document.getElementById('cartEmptyState');
  const badgeCount = document.getElementById('cartBadgeCount');
  const btnCheckout = document.getElementById('btnOpenCheckout');
  const finalTotalEl = document.getElementById('cartFinalTotal');

  const totalItemCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  if (badgeCount) badgeCount.textContent = `${totalItemCount} món`;
  if (finalTotalEl) finalTotalEl.textContent = formatMoney(totalAmount);

  // Update mobile floating bar
  const mobileBadge = document.getElementById('mobileFloatingBadge');
  const mobileTotal = document.getElementById('mobileFloatingTotal');
  const mobileTable = document.getElementById('mobileFloatingTable');

  if (mobileBadge) mobileBadge.textContent = totalItemCount;
  if (mobileTotal) mobileTotal.textContent = formatMoney(totalAmount);
  if (mobileTable) mobileTable.textContent = state.selectedTable;

  if (state.cart.length === 0) {
    if (itemsContainer) itemsContainer.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    if (btnCheckout) btnCheckout.disabled = true;
    applyPosFilters(); // Update badges on grid
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');
  if (btnCheckout) btnCheckout.disabled = false;

  if (itemsContainer) {
    itemsContainer.innerHTML = state.cart.map(item => {
      const hasImage = isActualImage(item.image);

      return `
      <div class="cart-item bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2">
        <div class="flex items-center space-x-2.5 min-w-0 flex-1">
          ${hasImage ? `
            <img src="${item.image}" alt="${item.name}" class="w-10 h-10 rounded-lg object-cover shrink-0 border border-slate-200 shadow-2xs">
          ` : ''}
          <div class="truncate">
            <h5 class="text-xs font-bold text-slate-800 truncate">${item.name}</h5>
            <div class="text-[11px] font-semibold text-blue-600">${formatMoney(item.price)}</div>
          </div>
        </div>

        <!-- Tăng giảm số lượng -->
        <div class="flex items-center space-x-1 shrink-0 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
          <button onclick="updateCartQty(${item.id}, -1)" class="w-6 h-6 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100 text-xs">
            <i class="fa-solid fa-minus"></i>
          </button>
          <span class="w-6 text-center text-xs font-bold text-slate-800">${item.quantity}</span>
          <button onclick="updateCartQty(${item.id}, 1)" class="w-6 h-6 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100 text-xs">
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>

        <!-- Tổng tiền món & Xóa -->
        <div class="text-right shrink-0 min-w-[60px]">
          <div class="text-xs font-black text-slate-800">${formatMoney(item.price * item.quantity)}</div>
          <button onclick="removeFromCart(${item.id})" class="text-[11px] text-rose-500 hover:text-rose-700 transition-colors p-0.5">
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </div>
      </div>
    `;
    }).join('');
  }

  applyPosFilters(); // Update badges on product cards
}

// =============================================================
// CHECKOUT & VIETQR PAYMENT MODAL
// =============================================================
function openCheckoutModal() {
  if (state.cart.length === 0) return;

  const totalAmount = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // Generate short temporary order code
  const now = new Date();
  const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
  tempOrderCode = `HD-${dateStr}-${String(Math.floor(100 + Math.random() * 900))}`;

  document.getElementById('checkoutModalTable').textContent = state.selectedTable;
  document.getElementById('checkoutOrderCodePreview').textContent = `${tempOrderCode} • ${state.selectedTable}`;
  document.getElementById('checkoutModalTotal').textContent = formatMoney(totalAmount);

  // Dynamic VietQR code
  setupVietQRDisplay(totalAmount, tempOrderCode);

  // Default to QR payment
  setPaymentMethod('vietqr');

  document.getElementById('checkoutModal').classList.remove('hidden');
}

function closeCheckoutModal() {
  document.getElementById('checkoutModal').classList.add('hidden');
}

function setPaymentMethod(method) {
  currentPaymentMethod = method;

  const btnVietQR = document.getElementById('btnMethodVietQR');
  const btnCash = document.getElementById('btnMethodCash');

  if (method === 'vietqr') {
    btnVietQR.className = 'py-2 rounded-xl text-xs font-bold border-2 border-blue-600 bg-blue-50 text-blue-700';
    btnCash.className = 'py-2 rounded-xl text-xs font-semibold border border-slate-300 text-slate-700';
  } else {
    btnCash.className = 'py-2 rounded-xl text-xs font-bold border-2 border-emerald-600 bg-emerald-50 text-emerald-700';
    btnVietQR.className = 'py-2 rounded-xl text-xs font-semibold border border-slate-300 text-slate-700';
  }
}

// Generate Dynamic VietQR Image URL
function setupVietQRDisplay(amount, orderCode) {
  const bankId = state.settings.bank_id || 'MB';
  const accountNo = state.settings.bank_account_no || '0909888999';
  const accountName = state.settings.bank_account_name || 'NGUYEN VAN POS';
  const memo = `${orderCode} ${state.selectedTable}`.trim();

  // Napas standard dynamic VietQR API
  const qrUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(accountName)}`;

  const qrImg = document.getElementById('vietQrImg');
  if (qrImg) qrImg.src = qrUrl;
}

// Complete order checkout
async function completeCheckoutOrder() {
  const btnConfirm = document.getElementById('btnConfirmPayment');
  btnConfirm.disabled = true;

  try {
    const totalAmount = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const note = document.getElementById('orderNoteInput')?.value.trim() || '';

    const payload = {
      items: state.cart.map(item => ({
        id: item.id,
        quantity: item.quantity
      })),
      table_name: state.selectedTable,
      note: note,
      payment_method: currentPaymentMethod,
      cash_given: totalAmount
    };

    const newOrder = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    closeCheckoutModal();
    toggleMobileCart(false);

    // Confetti celebration
    try {
      if (typeof confetti === 'function') {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      }
    } catch (e) {}

    showToast(`Thanh toán thành công ${state.selectedTable}!`);

    // Reset Cart
    state.cart = [];
    const noteInput = document.getElementById('orderNoteInput');
    if (noteInput) noteInput.value = '';
    updateCartUI();

    // Reload products & reports
    loadPosProducts();
    if (typeof loadOrdersList === 'function') loadOrdersList();

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnConfirm.disabled = false;
  }
}

// In phiếu đối chiếu từ modal thanh toán
function printCheckoutReceipt() {
  if (state.cart.length === 0) return;

  const totalAmount = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const note = document.getElementById('orderNoteInput')?.value.trim() || '';

  const orderForPrint = {
    order_code: tempOrderCode || 'ORDER-TAM',
    created_at: new Date().toISOString(),
    table_name: state.selectedTable,
    cashier_name: state.currentUser ? state.currentUser.name : 'Chủ Quán',
    note: note,
    payment_method: currentPaymentMethod,
    subtotal: totalAmount,
    discount: 0,
    total: totalAmount,
    items: state.cart.map(item => ({
      product_name: item.name,
      quantity: item.quantity,
      price: item.price,
      total: item.price * item.quantity
    }))
  };

  printReceipt(orderForPrint);
}

// =============================================================
// THERMAL RECEIPT PRINTING (PHIẾU ĐỐI CHIẾU 80mm / 58mm)
// =============================================================
function generateReceiptHtml(order) {
  const storeName = state.settings.store_name || 'QUÁN ĂN - CÀ PHÊ';
  const tableName = order.table_name || 'Bàn 1';
  const methodText = order.payment_method === 'vietqr' ? 'Chuyển khoản (VietQR)' : 'Tiền mặt';

  const itemsHtml = (order.items || []).map((item, idx) => `
    <tr>
      <td colspan="2" style="font-weight: bold; padding-top: 4px;">${idx + 1}. ${item.product_name}</td>
    </tr>
    <tr>
      <td style="padding-left: 10px;">${item.quantity} phần x ${formatMoney(item.price)}</td>
      <td style="text-align: right; font-weight: bold;">${formatMoney(item.total)}</td>
    </tr>
  `).join('');

  return `
    <div class="receipt-title">${storeName}</div>
    <div class="receipt-header">
      <div style="font-size: 14px; font-weight: 900; margin: 4px 0; text-transform: uppercase;">
        PHIẾU GỌI MÓN / ĐỐI CHIẾU
      </div>
      <div style="font-size: 15px; font-weight: 900; color: #000; margin: 2px 0;">
        📍 ${tableName}
      </div>
      <div>Mã đơn: <strong>${order.order_code}</strong></div>
      <div>Giờ: ${formatDateTime(order.created_at)}</div>
      ${order.note ? `<div style="font-style: italic; margin-top: 2px;">Ghi chú: ${order.note}</div>` : ''}
    </div>

    <table class="receipt-table">
      <thead>
        <tr>
          <th>Món / SL x Giá</th>
          <th style="text-align: right;">Tiền</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div class="receipt-divider"></div>

    <table class="receipt-summary">
      <tr class="receipt-total">
        <td>TỔNG CỘNG:</td>
        <td style="text-align: right;">${formatMoney(order.total)}</td>
      </tr>
      <tr>
        <td>Thanh toán:</td>
        <td style="text-align: right; font-weight: bold;">${methodText}</td>
      </tr>
    </table>

    <div class="receipt-footer">
      <div>Cảm ơn quý khách và hẹn gặp lại!</div>
    </div>
  `;
}

// Web Bluetooth ESC/POS Printing
let bluetoothDevice = null;
let bluetoothCharacteristic = null;

function removeVietnameseAccents(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

function formatLineColumns(left, right, width = 32) {
  const l = removeVietnameseAccents(String(left));
  const r = removeVietnameseAccents(String(right));
  const spaceCount = Math.max(1, width - l.length - r.length);
  return l + ' '.repeat(spaceCount) + r + '\n';
}

async function connectBluetoothPrinter() {
  if (!navigator.bluetooth) {
    showToast('Trình duyệt chưa hỗ trợ Bluetooth. Hãy mở bằng Chrome trên Android hoặc dùng in qua Wi-Fi!', 'error');
    return;
  }

  try {
    showToast('Đang tìm máy in Bluetooth...');
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        '000018f0-0000-1000-8000-00805f9b34fb',
        '49535343-fe7d-4ae5-8fa9-9fafd205e455',
        '0000ff00-0000-1000-8000-00805f9b34fb'
      ]
    });

    const server = await device.gatt.connect();
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

    if (!foundChar) throw new Error('Không tìm thấy cổng in trên thiết bị');

    bluetoothDevice = device;
    bluetoothCharacteristic = foundChar;

    closePrinterModal();
    showToast(`Đã kết nối máy in: ${device.name || 'Bluetooth'}`);
  } catch (err) {
    showToast('Lỗi Bluetooth: ' + err.message, 'error');
  }
}

async function printEscPosBluetooth(order) {
  if (!bluetoothCharacteristic) throw new Error('Chưa kết nối máy in');

  const storeName = state.settings.store_name || 'POS ORDER';
  const lineWidth = 32;
  const divider = '-'.repeat(lineWidth) + '\n';

  let content = '\x1B\x40'; // Reset
  content += '\x1B\x61\x01'; // Center
  content += '\x1B\x45\x01' + removeVietnameseAccents(storeName) + '\n';
  content += 'PHIEU DOI CHIEU MON\n';
  content += `BAN: ${removeVietnameseAccents(order.table_name || 'BAN 1')}\n`;
  content += '\x1B\x45\x00';
  content += `Ma HD: ${order.order_code}\n`;
  content += `Gio: ${formatDateTime(order.created_at)}\n`;
  if (order.note) content += `Ghi chu: ${removeVietnameseAccents(order.note)}\n`;

  content += '\x1B\x61\x00'; // Left
  content += divider;
  content += formatLineColumns('MON / SL', 'TIEN', lineWidth);
  content += divider;

  (order.items || []).forEach((it, i) => {
    content += `${i + 1}. ${removeVietnameseAccents(it.product_name)}\n`;
    content += formatLineColumns(`   ${it.quantity} phan`, formatMoney(it.total), lineWidth);
  });

  content += divider;
  content += '\x1B\x45\x01';
  content += formatLineColumns('TONG CONG:', formatMoney(order.total), lineWidth);
  content += '\x1B\x45\x00';
  content += formatLineColumns('Thanh toan:', order.payment_method === 'vietqr' ? 'VietQR' : 'Tien mat', lineWidth);
  content += divider;
  content += '\x1B\x61\x01Cam on quy khach!\n\n\n\n\x1D\x56\x01';

  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const chunkSize = 100;
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const chunk = data.slice(offset, offset + chunkSize);
    if (bluetoothCharacteristic.writeValueWithoutResponse) {
      await bluetoothCharacteristic.writeValueWithoutResponse(chunk);
    } else {
      await bluetoothCharacteristic.writeValue(chunk);
    }
    await new Promise(r => setTimeout(r, 20));
  }
}

async function printReceipt(order) {
  if (bluetoothCharacteristic) {
    try {
      showToast('Đang in phiếu qua Bluetooth...');
      await printEscPosBluetooth(order);
      showToast('Đã in phiếu đối chiếu thành công!');
      return;
    } catch (err) {
      console.warn('Bluetooth print failed, falling back to window.print', err);
    }
  }

  // Fallback to window.print()
  const container = document.getElementById('printable-receipt');
  if (container) {
    container.innerHTML = generateReceiptHtml(order);
    window.print();
  }
}

function openPrinterModal() {
  document.getElementById('printerModal')?.classList.remove('hidden');
}

function closePrinterModal() {
  document.getElementById('printerModal')?.classList.add('hidden');
}

function testPrintSample() {
  const sampleOrder = {
    order_code: 'HD-MAU',
    created_at: new Date().toISOString(),
    table_name: 'Bàn 1 (Thử nghiệm)',
    note: 'Ít đá, ít ngọt',
    payment_method: 'vietqr',
    total: 45000,
    items: [
      { product_name: 'Cà phê sữa đá', quantity: 1, price: 25000, total: 25000 },
      { product_name: 'Trà đào cam sả', quantity: 1, price: 20000, total: 20000 }
    ]
  };
  printReceipt(sampleOrder);
}
