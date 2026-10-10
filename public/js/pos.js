// =============================================================
// POS ORDER - SƠ ĐỒ BÀN & GỌI MÓN (THEO MẪU FABiOrder)
// =============================================================

let currentSelectedCategory = 'all';
let currentPaymentMethod = 'cash';
let tempOrderCode = '';

// Kiểm tra chuỗi có phải ảnh thực sự (base64 hoặc URL)
function isActualImage(str) {
  return typeof str === 'string' && (str.startsWith('data:image') || str.startsWith('http') || str.startsWith('/'));
}

// Khởi tạo POS
async function initPos() {
  await Promise.all([loadPosCategories(), loadPosProducts()]);
  setupPosSearchListeners();
  showTableFloor();
}

// =============================================================
// SCREEN 1: SƠ ĐỒ BÀN (TABLE FLOOR MAP)
// =============================================================
function showTableFloor() {
  state.activeScreen = 'tables';

  const screenTables = document.getElementById('screen-tables');
  const screenOrder = document.getElementById('screen-order');
  const viewReports = document.getElementById('view-reports');
  const viewMenu = document.getElementById('view-menu');

  if (screenTables) screenTables.classList.remove('hidden');
  if (screenOrder) screenOrder.classList.add('hidden');
  if (viewReports) viewReports.classList.add('hidden');
  if (viewMenu) viewMenu.classList.add('hidden');

  closeTableCartDrawer();
  renderTableGrid();
}

function setOrderSource(source) {
  state.currentSource = source;

  const btnMangVe = document.getElementById('btnSourceMangVe');
  const btnTaiCho = document.getElementById('btnSourceTaiCho');

  if (source === 'mangve') {
    btnMangVe.className = 'px-3 py-1 rounded-lg text-xs font-bold bg-white text-emerald-700 shadow-xs transition-all';
    btnTaiCho.className = 'px-3 py-1 rounded-lg text-xs font-semibold text-slate-600 transition-all';
  } else {
    btnTaiCho.className = 'px-3 py-1 rounded-lg text-xs font-bold bg-white text-emerald-700 shadow-xs transition-all';
    btnMangVe.className = 'px-3 py-1 rounded-lg text-xs font-semibold text-slate-600 transition-all';
  }

  renderTableGrid();
}

function filterTableArea(filter) {
  state.currentAreaFilter = filter;

  const tabs = {
    all: document.getElementById('tabAreaAll'),
    occupied: document.getElementById('tabAreaOccupied'),
    empty: document.getElementById('tabAreaEmpty')
  };

  Object.keys(tabs).forEach(k => {
    if (tabs[k]) {
      if (k === filter) {
        tabs[k].className = 'area-tab pb-2 border-b-2 border-emerald-600 text-emerald-700 font-bold';
      } else {
        tabs[k].className = 'area-tab pb-2 text-slate-500 hover:text-slate-800 font-bold';
      }
    }
  });

  renderTableGrid();
}

function promptAddCustomTable() {
  const custom = prompt('Nhập tên bàn mới (VD: Bàn 13, Bàn VIP, Sân thượng...):', '');
  if (custom && custom.trim()) {
    const tableName = custom.trim();
    if (!state.tableList.includes(tableName)) {
      state.tableList.push(tableName);
      localStorage.setItem('pos_table_list', JSON.stringify(state.tableList));
      showToast(`Đã thêm: ${tableName}`);
      renderTableGrid();
    }
  }
}

// Render Lưới Bàn (3 cột trên điện thoại - Giống mẫu FABi Ảnh 1)
function renderTableGrid() {
  const container = document.getElementById('tableGridContainer');
  if (!container) return;

  const filter = state.currentAreaFilter;
  const tables = state.tableList.filter(tableName => {
    const order = state.tableOrders[tableName];
    const hasItems = order && order.items && order.items.length > 0;
    if (filter === 'occupied') return hasItems;
    if (filter === 'empty') return !hasItems;
    return true;
  });

  if (tables.length === 0) {
    container.innerHTML = `
      <div class="col-span-3 text-center py-12 text-slate-400 text-xs">
        <i class="fa-solid fa-table text-3xl mb-2 text-slate-300"></i>
        <p>Không có bàn nào phù hợp</p>
      </div>
    `;
    return;
  }

  const now = Date.now();

  container.innerHTML = tables.map(tableName => {
    const order = state.tableOrders[tableName];
    const hasItems = order && order.items && order.items.length > 0;

    if (hasItems) {
      // BÀN CÓ KHÁCH: Màu Xanh Ngọc nổi bật (khác màu xanh dương cũ)
      const totalAmount = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const totalCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
      const startTime = order.startTime || now;
      const elapsedMin = Math.max(1, Math.floor((now - startTime) / 60000));

      return `
        <div 
          onclick="openTableOrder('${tableName}')"
          class="table-card bg-emerald-600 text-white rounded-2xl p-2.5 sm:p-3 flex flex-col justify-between shadow-sm cursor-pointer aspect-square active:scale-95 transition-all"
        >
          <div class="flex items-center justify-between">
            <span class="font-black text-xs sm:text-sm tracking-tight text-white">${tableName}</span>
            <span class="w-2 h-2 rounded-full bg-emerald-300 animate-pulse"></span>
          </div>

          <div class="my-auto text-center py-1">
            <div class="text-xs sm:text-sm font-black text-white leading-tight">
              ${formatMoney(totalAmount)}
            </div>
            <div class="text-[10px] sm:text-xs text-emerald-100 font-semibold mt-0.5">
              ${totalCount} Món
            </div>
          </div>

          <div class="text-[10px] text-emerald-200 text-right font-medium">
            ${elapsedMin} phút
          </div>
        </div>
      `;
    } else {
      // BÀN TRỐNG: Nền trắng viền xám nhẹ nhàng bo góc
      return `
        <div 
          onclick="openTableOrder('${tableName}')"
          class="table-card bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl p-2.5 flex items-center justify-center text-slate-700 shadow-2xs cursor-pointer aspect-square active:scale-95 transition-all hover:bg-slate-50"
        >
          <span class="font-bold text-xs sm:text-sm text-slate-700">${tableName}</span>
        </div>
      `;
    }
  }).join('');
}

// =============================================================
// SCREEN 2: MÀN HÌNH GỌI MÓN (THEO MẪU FABiOrder Ảnh 2)
// =============================================================
function openTableOrder(tableName) {
  state.currentTable = tableName;
  state.activeScreen = 'order';

  const screenTables = document.getElementById('screen-tables');
  const screenOrder = document.getElementById('screen-order');

  if (screenTables) screenTables.classList.add('hidden');
  if (screenOrder) screenOrder.classList.remove('hidden');

  // Cập nhật tiêu đề màn hình
  const sourceLabel = state.currentSource === 'mangve' ? 'MANG VỀ' : 'TẠI CHỖ';
  const titleEl = document.getElementById('orderScreenTitle');
  if (titleEl) {
    titleEl.textContent = `${tableName} • ${sourceLabel}`;
  }

  // Khởi tạo đơn cho bàn nếu chưa có
  if (!state.tableOrders[tableName]) {
    state.tableOrders[tableName] = {
      source: state.currentSource,
      startTime: Date.now(),
      note: '',
      items: []
    };
  }

  renderOrderCategoriesPills();
  renderGroupedDishList();
  updateTableBottomBar();
}

// Thanh danh mục cuộn ngang
function renderOrderCategoriesPills() {
  const container = document.getElementById('orderCategoryPills');
  if (!container) return;

  const totalCount = state.products.length;

  const pillsHtml = state.categories.map(cat => {
    const isActive = currentSelectedCategory == cat.id;
    return `
      <button 
        onclick="filterOrderCategory(${cat.id})" 
        class="cat-pill px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
          isActive 
            ? 'bg-emerald-600 text-white shadow-xs' 
            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
        }"
        data-id="${cat.id}"
      >
        <span>${cat.name}</span>
      </button>
    `;
  }).join('');

  container.innerHTML = `
    <button 
      onclick="filterOrderCategory('all')" 
      class="cat-pill px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
        currentSelectedCategory === 'all' 
          ? 'bg-emerald-600 text-white shadow-xs' 
          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
      }"
      data-id="all"
    >
      Tất cả (${totalCount})
    </button>
    ${pillsHtml}
  `;
}

function filterOrderCategory(catId) {
  currentSelectedCategory = catId;
  renderOrderCategoriesPills();
  renderGroupedDishList();
}

async function loadPosCategories() {
  try {
    state.categories = await api('/api/categories');
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

async function loadPosProducts() {
  try {
    state.products = await api('/api/products');
  } catch (err) {
    console.error('Failed to load products:', err);
  }
}

function setupPosSearchListeners() {
  const searchInput = document.getElementById('posSearchInput');
  const clearBtn = document.getElementById('posClearSearch');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (searchInput.value.trim().length > 0) {
        clearBtn?.classList.remove('hidden');
      } else {
        clearBtn?.classList.add('hidden');
      }
      renderGroupedDishList();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      clearBtn.classList.add('hidden');
      renderGroupedDishList();
      searchInput?.focus();
    });
  }
}

// Render Danh Sách Món Phân Theo Nhóm (Ảnh 2 của FABiOrder)
function renderGroupedDishList() {
  const container = document.getElementById('groupedDishContainer');
  if (!container) return;

  const searchTerm = (document.getElementById('posSearchInput')?.value || '').trim().toLowerCase();
  const currentItems = state.tableOrders[state.currentTable]?.items || [];

  // Lọc món theo search & category
  const filteredProducts = state.products.filter(p => {
    const matchesCat = currentSelectedCategory === 'all' || p.category_id == currentSelectedCategory;
    const matchesSearch = !searchTerm || p.name.toLowerCase().includes(searchTerm);
    return matchesCat && matchesSearch;
  });

  if (filteredProducts.length === 0) {
    container.innerHTML = `
      <div class="h-40 flex flex-col items-center justify-center text-slate-400">
        <i class="fa-solid fa-utensils text-2xl mb-1 text-slate-300"></i>
        <p class="text-xs font-semibold">Không tìm thấy món ăn nào</p>
      </div>
    `;
    return;
  }

  // Nhóm món theo Category
  const groups = {};
  filteredProducts.forEach(p => {
    const catName = p.category_name || 'MÓN KHÁC';
    if (!groups[catName]) groups[catName] = [];
    groups[catName].push(p);
  });

  container.innerHTML = Object.keys(groups).map(catName => {
    const dishRows = groups[catName].map(p => {
      const existingInTable = currentItems.find(item => item.id === p.id);
      const currentQty = existingInTable ? existingInTable.quantity : 0;
      const hasImage = isActualImage(p.image);

      return `
        <div class="dish-row bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-200/90 shadow-2xs flex items-center justify-between gap-2.5">
          <!-- Thumbnail ảnh hoặc khung giữ chỗ sạch sẽ -->
          <div class="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-100 flex items-center justify-center">
            ${hasImage ? `
              <img src="${p.image}" alt="${p.name}" class="w-full h-full object-cover">
            ` : `
              <i class="fa-regular fa-image text-slate-300 text-lg"></i>
            `}
          </div>

          <!-- Tên món & Giá -->
          <div class="min-w-0 flex-1">
            <h4 class="font-bold text-xs sm:text-sm text-slate-800 line-clamp-2 leading-snug">
              ${p.name}
            </h4>
            <div class="text-xs font-black text-emerald-700 mt-0.5">
              ${formatMoney(p.price)}
            </div>
          </div>

          <!-- Bộ nút Stepper [-]  SL  [+] trực tiếp (Ảnh 2) -->
          <div class="flex items-center space-x-1.5 shrink-0 bg-slate-50 p-1 rounded-xl border border-slate-200">
            <button 
              type="button"
              onclick="changeDishQty(${p.id}, -1)" 
              class="stepper-btn w-7 h-7 rounded-lg border border-slate-300 bg-white flex items-center justify-center text-slate-600 active:bg-slate-100 text-xs font-bold transition-all"
            >
              <i class="fa-solid fa-minus text-[10px]"></i>
            </button>

            <span id="dish-qty-${p.id}" class="w-6 text-center text-xs font-black text-slate-800">
              ${currentQty}
            </span>

            <button 
              type="button"
              onclick="changeDishQty(${p.id}, 1)" 
              class="stepper-btn w-7 h-7 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center active:bg-emerald-800 text-xs font-bold shadow-2xs transition-all"
            >
              <i class="fa-solid fa-plus text-[10px]"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="space-y-2">
        <h3 class="text-[11px] font-black text-slate-400 uppercase tracking-wider px-1">
          ${catName}
        </h3>
        <div class="space-y-2">
          ${dishRows}
        </div>
      </div>
    `;
  }).join('');
}

// Thay đổi số lượng món bằng nút Stepper
function changeDishQty(productId, delta) {
  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  const currentTable = state.currentTable;
  if (!state.tableOrders[currentTable]) {
    state.tableOrders[currentTable] = {
      source: state.currentSource,
      startTime: Date.now(),
      note: '',
      items: []
    };
  }

  const tableOrder = state.tableOrders[currentTable];
  let item = tableOrder.items.find(i => i.id === product.id);

  if (item) {
    item.quantity += delta;
    if (item.quantity <= 0) {
      tableOrder.items = tableOrder.items.filter(i => i.id !== product.id);
    }
  } else if (delta > 0) {
    tableOrder.items.push({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image || '',
      quantity: 1
    });
  }

  // Cập nhật localStorage
  localStorage.setItem('pos_table_orders', JSON.stringify(state.tableOrders));

  // Cập nhật số trên Stepper ngay lập tức
  const updatedItem = tableOrder.items.find(i => i.id === product.id);
  const qtyEl = document.getElementById(`dish-qty-${product.id}`);
  if (qtyEl) qtyEl.textContent = updatedItem ? updatedItem.quantity : 0;

  updateTableBottomBar();
  renderCartDrawerItems();
}

// Cập nhật Thanh Dính Dưới Cùng (Sticky Bottom Bar)
function updateTableBottomBar() {
  const currentTable = state.currentTable;
  const tableOrder = state.tableOrders[currentTable];
  const items = tableOrder?.items || [];

  const totalCount = items.reduce((sum, it) => sum + it.quantity, 0);
  const totalAmount = items.reduce((sum, it) => sum + (it.price * it.quantity), 0);

  const badgeEl = document.getElementById('bottomBarBadge');
  const moneyEl = document.getElementById('bottomBarTotalMoney');
  const labelEl = document.getElementById('bottomBarTableLabel');
  const headerBadge = document.getElementById('orderHeaderBadge');
  const btnCheckout = document.getElementById('btnBottomCheckout');
  const btnKitchen = document.getElementById('btnPrintKitchen');

  if (badgeEl) badgeEl.textContent = totalCount;
  if (moneyEl) moneyEl.textContent = formatMoney(totalAmount);
  if (labelEl) labelEl.textContent = currentTable;

  if (headerBadge) {
    if (totalCount > 0) {
      headerBadge.textContent = totalCount;
      headerBadge.classList.remove('hidden');
    } else {
      headerBadge.classList.add('hidden');
    }
  }

  if (btnCheckout) {
    btnCheckout.disabled = totalCount === 0;
    if (totalCount === 0) {
      btnCheckout.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
      btnCheckout.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  }

  if (btnKitchen) {
    btnKitchen.disabled = totalCount === 0;
    if (totalCount === 0) {
      btnKitchen.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
      btnKitchen.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  }
}

// =============================================================
// DRAWER: XEM CHI TIẾT GIỎ MÓN CỦA BÀN
// =============================================================
function openTableCartDrawer() {
  const drawer = document.getElementById('tableCartDrawer');
  const backdrop = document.getElementById('tableCartBackdrop');
  if (!drawer || !backdrop) return;

  const currentTable = state.currentTable;
  const title = document.getElementById('cartDrawerTableTitle');
  if (title) title.textContent = currentTable;

  const noteInput = document.getElementById('orderNoteInput');
  if (noteInput) {
    noteInput.value = state.tableOrders[currentTable]?.note || '';
    noteInput.onchange = () => {
      if (state.tableOrders[currentTable]) {
        state.tableOrders[currentTable].note = noteInput.value.trim();
        localStorage.setItem('pos_table_orders', JSON.stringify(state.tableOrders));
      }
    };
  }

  renderCartDrawerItems();

  drawer.classList.remove('translate-x-full');
  backdrop.classList.remove('hidden');
}

function closeTableCartDrawer() {
  const drawer = document.getElementById('tableCartDrawer');
  const backdrop = document.getElementById('tableCartBackdrop');
  if (drawer) drawer.classList.add('translate-x-full');
  if (backdrop) backdrop.classList.add('hidden');
}

function renderCartDrawerItems() {
  const currentTable = state.currentTable;
  const items = state.tableOrders[currentTable]?.items || [];
  const container = document.getElementById('cartItemsList');
  const emptyState = document.getElementById('cartEmptyState');
  const finalTotalEl = document.getElementById('cartDrawerFinalTotal');
  const btnCheckout = document.getElementById('btnCartDrawerCheckout');
  const btnKitchen = document.getElementById('btnCartDrawerPrintKitchen');

  const totalAmount = items.reduce((sum, it) => sum + (it.price * it.quantity), 0);
  if (finalTotalEl) finalTotalEl.textContent = formatMoney(totalAmount);

  if (items.length === 0) {
    if (container) container.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    if (btnCheckout) btnCheckout.disabled = true;
    if (btnKitchen) btnKitchen.disabled = true;
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');
  if (btnCheckout) btnCheckout.disabled = false;
  if (btnKitchen) btnKitchen.disabled = false;

  if (container) {
    container.innerHTML = items.map(item => {
      const hasImage = isActualImage(item.image);
      return `
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2">
          <div class="flex items-center space-x-2.5 min-w-0 flex-1">
            ${hasImage ? `
              <img src="${item.image}" alt="${item.name}" class="w-10 h-10 rounded-lg object-cover shrink-0 border border-slate-200">
            ` : ''}
            <div class="truncate">
              <h5 class="text-xs font-bold text-slate-800 truncate">${item.name}</h5>
              <div class="text-[11px] font-semibold text-emerald-700">${formatMoney(item.price)}</div>
            </div>
          </div>

          <div class="flex items-center space-x-1 shrink-0 bg-white border border-slate-200 rounded-lg p-0.5">
            <button onclick="changeDishQty(${item.id}, -1)" class="w-6 h-6 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100 text-xs">
              <i class="fa-solid fa-minus text-[9px]"></i>
            </button>
            <span class="w-6 text-center text-xs font-bold text-slate-800">${item.quantity}</span>
            <button onclick="changeDishQty(${item.id}, 1)" class="w-6 h-6 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100 text-xs">
              <i class="fa-solid fa-plus text-[9px]"></i>
            </button>
          </div>

          <div class="text-right shrink-0 min-w-[60px]">
            <div class="text-xs font-black text-slate-800">${formatMoney(item.price * item.quantity)}</div>
          </div>
        </div>
      `;
    }).join('');
  }
}

function clearCurrentTableOrder() {
  const currentTable = state.currentTable;
  if (!confirm(`Hủy toàn bộ món đang gọi của ${currentTable}?`)) return;

  delete state.tableOrders[currentTable];
  localStorage.setItem('pos_table_orders', JSON.stringify(state.tableOrders));

  showToast(`Đã làm trống ${currentTable}`);
  renderGroupedDishList();
  updateTableBottomBar();
  closeTableCartDrawer();
  renderTableGrid();
}

// Menu 3 chấm bàn
function openTableActionsMenu() {
  const title = document.getElementById('tableActionsTitle');
  if (title) title.textContent = `Thao Tác: ${state.currentTable}`;
  document.getElementById('tableActionsModal')?.classList.remove('hidden');
}

function closeTableActionsMenu() {
  document.getElementById('tableActionsModal')?.classList.add('hidden');
}

// =============================================================
// MỞ MODAL XÁC NHẬN THANH TOÁN (KHÔNG QR) & IN PHIẾU BÁO BẾP
// =============================================================
function openCheckoutModal() {
  const currentTable = state.currentTable;
  const tableOrder = state.tableOrders[currentTable];
  const items = tableOrder?.items || [];

  if (items.length === 0) {
    showToast('Bàn chưa có món nào để thanh toán!', 'error');
    return;
  }

  const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const now = new Date();
  const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
  tempOrderCode = tableOrder.orderCode || `HD-${dateStr}-${String(Math.floor(100 + Math.random() * 900))}`;
  tableOrder.orderCode = tempOrderCode;

  document.getElementById('checkoutModalTable').textContent = currentTable;
  document.getElementById('checkoutOrderCodePreview').textContent = `${tempOrderCode} • ${currentTable}`;
  document.getElementById('checkoutModalTotal').textContent = formatMoney(totalAmount);

  const countEl = document.getElementById('checkoutModalItemCount');
  if (countEl) countEl.textContent = `${totalCount} món`;

  // Render danh sách món đối chiếu
  const itemsContainer = document.getElementById('checkoutModalItemsList');
  if (itemsContainer) {
    itemsContainer.innerHTML = items.map((it, idx) => `
      <div class="py-1.5 flex items-center justify-between text-xs">
        <div class="truncate pr-2">
          <span class="font-bold text-slate-800">${idx + 1}. ${it.name}</span>
          <span class="text-slate-500 text-[11px] block">SL: ${it.quantity} phần x ${formatMoney(it.price)}</span>
        </div>
        <div class="font-bold text-slate-800 shrink-0">
          ${formatMoney(it.price * it.quantity)}
        </div>
      </div>
    `).join('');
  }

  document.getElementById('checkoutModal').classList.remove('hidden');
}

function closeCheckoutModal() {
  document.getElementById('checkoutModal')?.classList.add('hidden');
}

// In phiếu báo bếp: nhân viên mang phiếu vào bếp, bếp mang món + phiếu ra bàn cho khách
function printKitchenSlip() {
  const currentTable = state.currentTable;
  const tableOrder = state.tableOrders[currentTable];
  const items = tableOrder?.items || [];

  if (items.length === 0) {
    showToast('Bàn chưa có món nào để in báo bếp!', 'error');
    return;
  }

  const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const note = document.getElementById('orderNoteInput')?.value.trim() || tableOrder.note || '';

  // Đảm bảo bàn đã có thời gian bắt đầu và ghi chú
  if (!tableOrder.startTime) {
    tableOrder.startTime = Date.now();
  }
  tableOrder.note = note;
  tableOrder.hasPrintedKitchen = true;

  const now = new Date();
  const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
  const kitchenCode = tableOrder.orderCode || `BEP-${dateStr}-${String(Math.floor(100 + Math.random() * 900))}`;
  tableOrder.orderCode = kitchenCode;

  // Lưu trạng thái bàn vào localStorage
  localStorage.setItem('pos_table_orders', JSON.stringify(state.tableOrders));

  const orderForPrint = {
    order_code: kitchenCode,
    created_at: new Date().toISOString(),
    table_name: currentTable,
    cashier_name: state.currentUser ? state.currentUser.name : 'Nhân Viên',
    note: note,
    payment_method: 'cash',
    subtotal: totalAmount,
    discount: 0,
    total: totalAmount,
    items: items.map(item => ({
      product_name: item.name,
      quantity: item.quantity,
      price: item.price,
      total: item.price * item.quantity
    }))
  };

  printReceipt(orderForPrint);
  showToast(`Đã in phiếu ${currentTable} chuyển cho bếp!`);

  // Đóng giỏ hàng và chuyển về sơ đồ bàn (bàn giữ nguyên màu xanh ngọc có khách)
  closeTableCartDrawer();
  showTableFloor();
}

// Hoàn tất đơn hàng tại quầy và giải phóng bàn (bàn lập tức trống)
async function completeCheckoutOrder() {
  const currentTable = state.currentTable;
  const tableOrder = state.tableOrders[currentTable];
  if (!tableOrder || !tableOrder.items || tableOrder.items.length === 0) return;

  const btnConfirm = document.getElementById('btnConfirmPayment');
  if (btnConfirm) btnConfirm.disabled = true;

  try {
    const totalAmount = tableOrder.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const note = document.getElementById('orderNoteInput')?.value.trim() || tableOrder.note || '';

    const payload = {
      items: tableOrder.items.map(item => ({
        id: item.id,
        quantity: item.quantity
      })),
      table_name: currentTable,
      note: note,
      payment_method: 'cash',
      cash_given: totalAmount
    };

    const newOrder = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    closeCheckoutModal();
    closeTableCartDrawer();

    // Confetti chúc mừng
    try {
      if (typeof confetti === 'function') {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      }
    } catch (e) {}

    showToast(`Đã thanh toán ${currentTable}, bàn đã trống!`);

    // XÓA ĐƠN CỦA BÀN VÀ TRẢ BÀN VỀ TRẠNG THÁI TRỐNG
    delete state.tableOrders[currentTable];
    localStorage.setItem('pos_table_orders', JSON.stringify(state.tableOrders));

    // Quay lại màn hình Sơ Đồ Bàn (bàn sẽ chuyển sang màu xám trống)
    showTableFloor();

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btnConfirm) btnConfirm.disabled = false;
  }
}

// In lại phiếu đối chiếu
function printCheckoutReceipt() {
  const currentTable = state.currentTable;
  const tableOrder = state.tableOrders[currentTable];
  const items = tableOrder?.items || [];

  if (items.length === 0) {
    showToast('Bàn chưa có món nào!', 'error');
    return;
  }

  const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const note = document.getElementById('orderNoteInput')?.value.trim() || tableOrder.note || '';

  const orderForPrint = {
    order_code: tableOrder?.orderCode || tempOrderCode || 'ORDER-TAM',
    created_at: new Date().toISOString(),
    table_name: currentTable,
    cashier_name: state.currentUser ? state.currentUser.name : 'Nhân Viên',
    note: note,
    payment_method: 'cash',
    subtotal: totalAmount,
    discount: 0,
    total: totalAmount,
    items: items.map(item => ({
      product_name: item.name,
      quantity: item.quantity,
      price: item.price,
      total: item.price * item.quantity
    }))
  };

  printReceipt(orderForPrint);
}

// Compatibility stubs
function setPaymentMethod() {}
function setupVietQRDisplay() {}

// =============================================================
// IN HÓA ĐƠN NHIỆT / PHIẾU BÁO BẾP (80mm / 58mm & BLUETOOTH)
// =============================================================
function generateReceiptHtml(order) {
  const storeName = state.settings.store_name || 'QUÁN ĂN - CÀ PHÊ';
  const tableName = order.table_name || 'Bàn 1';
  const footerText = state.settings.receipt_footer || 'Quý khách vui lòng mang phiếu này ra quầy khi thanh toán';

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
      <div style="font-size: 15px; font-weight: 900; margin: 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">
        PHIẾU BÁO BẾP / GỌI MÓN
      </div>
      <div style="font-size: 20px; font-weight: 900; color: #000; margin: 4px 0; padding: 2px 0; border: 1px dashed #000;">
        📍 ${tableName}
      </div>
      <div>Mã phiếu: <strong>${order.order_code}</strong></div>
      <div>Giờ: ${formatDateTime(order.created_at)}</div>
      ${order.note ? `<div style="font-style: italic; font-weight: bold; margin-top: 2px;">Ghi chú: ${order.note}</div>` : ''}
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
        <td>TỔNG TẠM TÍNH:</td>
        <td style="text-align: right;">${formatMoney(order.total)}</td>
      </tr>
    </table>

    <div class="receipt-footer">
      <div style="font-weight: bold; margin-top: 6px; font-size: 12px;">*** ${footerText} ***</div>
      <div style="font-size: 11px; margin-top: 4px;">Cảm ơn quý khách và hẹn gặp lại!</div>
    </div>
  `;
}

// In qua Bluetooth hoặc Trình duyệt
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
    showToast('Trình duyệt chưa hỗ trợ Bluetooth. Hãy mở bằng Chrome trên Android hoặc in qua Wi-Fi!', 'error');
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

  let content = '\x1B\x40';
  content += '\x1B\x61\x01';
  content += '\x1B\x45\x01' + removeVietnameseAccents(storeName) + '\n';
  content += 'PHIEU BAO BEP / GOI MON\n';
  content += `BAN: ${removeVietnameseAccents(order.table_name || 'BAN 1')}\n`;
  content += '\x1B\x45\x00';
  content += `Ma phieu: ${order.order_code}\n`;
  content += `Gio: ${formatDateTime(order.created_at)}\n`;
  if (order.note) content += `Ghi chu: ${removeVietnameseAccents(order.note)}\n`;

  content += '\x1B\x61\x00';
  content += divider;
  content += formatLineColumns('MON / SL', 'TIEN', lineWidth);
  content += divider;

  (order.items || []).forEach((it, i) => {
    content += `${i + 1}. ${removeVietnameseAccents(it.product_name)}\n`;
    content += formatLineColumns(`   ${it.quantity} phan`, formatMoney(it.total), lineWidth);
  });

  content += divider;
  content += '\x1B\x45\x01';
  content += formatLineColumns('TONG TAM TINH:', formatMoney(order.total), lineWidth);
  content += '\x1B\x45\x00';
  content += divider;
  content += '\x1B\x61\x01Vui long mang phieu ra quay\nkhi thanh toan!\nCam on quy khach!\n\n\n\n\x1D\x56\x01';

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
    order_code: 'BEP-MAU',
    created_at: new Date().toISOString(),
    table_name: 'Bàn 1 (Thử nghiệm)',
    note: 'Ít đá, ít cay',
    payment_method: 'cash',
    total: 45000,
    items: [
      { product_name: 'Cà phê sữa đá', quantity: 1, price: 25000, total: 25000 },
      { product_name: 'Trà đào cam sả', quantity: 1, price: 20000, total: 20000 }
    ]
  };
  printReceipt(sampleOrder);
}
