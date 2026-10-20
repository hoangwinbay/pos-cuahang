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

// =============================================================
// ĐỒNG BỘ THỜI GIAN THỰC ĐA THIẾT BỊ (MULTI-DEVICE REALTIME SYNC)
// =============================================================
let tableEventSource = null;
let syncDebounceTimers = {};

// =============================================================
// OFFLINE QUEUE & AUTO-RETRY (BẢO VỆ ĐƠN KHI MẠNG YẾU/MẤT KẾT NỐI)
// =============================================================
function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem('pos_offline_orders') || '[]');
  } catch (e) {
    return [];
  }
}

function saveOfflineQueue(queue) {
  localStorage.setItem('pos_offline_orders', JSON.stringify(queue));
}

function queueOfflineOrder(tableName, orderData) {
  const queue = getOfflineQueue();
  const existingIdx = queue.findIndex(q => q.tableName === tableName);
  if (existingIdx !== -1) {
    queue[existingIdx] = { tableName, orderData, timestamp: Date.now() };
  } else {
    queue.push({ tableName, orderData, timestamp: Date.now() });
  }
  saveOfflineQueue(queue);
  updateSyncIndicator(false);
}

let isSyncingOffline = false;
async function syncOfflineQueue() {
  if (isSyncingOffline || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  isSyncingOffline = true;
  const remaining = [];

  for (const item of queue) {
    try {
      await api('/api/tables/order', {
        method: 'POST',
        body: JSON.stringify({
          table_name: item.tableName,
          order_data: item.orderData,
          check_conflict: false
        })
      });
      console.log(`Đã gửi lại thành công đơn offline của ${item.tableName}`);
    } catch (err) {
      console.warn(`Chưa gửi được đơn offline của ${item.tableName}, sẽ thử lại sau:`, err);
      remaining.push(item);
    }
  }

  saveOfflineQueue(remaining);
  isSyncingOffline = false;

  if (remaining.length === 0) {
    updateSyncIndicator(true);
    showToast('Tất cả đơn đặt lúc mất mạng đã được đồng bộ lên máy chủ!', 'success');
  }
}

window.addEventListener('online', () => {
  console.log('Thiết bị có mạng trở lại, đang đồng bộ dữ liệu...');
  syncOfflineQueue();
  fetchAndApplyTableSync();
});

window.addEventListener('offline', () => {
  console.warn('Thiết bị mất kết nối mạng!');
  updateSyncIndicator(false);
  showToast('Thiết bị đang offline. Đơn hàng sẽ được lưu tạm trên máy.', 'warning');
});

setInterval(syncOfflineQueue, 15000);

function syncTableOrderToServer(tableName, immediate = false) {
  if (syncDebounceTimers[tableName]) {
    clearTimeout(syncDebounceTimers[tableName]);
  }

  const doSync = async () => {
    try {
      const orderData = state.tableOrders[tableName];
      if (!orderData || !orderData.items || orderData.items.length === 0) {
        deleteTableOrderOnServer(tableName);
        return;
      }
      await api('/api/tables/order', {
        method: 'POST',
        body: JSON.stringify({
          table_name: tableName,
          order_data: orderData
        })
      });
    } catch (e) {
      console.warn('Đồng bộ bàn lên server thất bại, lưu hàng đợi:', e);
      const orderData = state.tableOrders[tableName];
      if (orderData && orderData.items && orderData.items.length > 0) {
        queueOfflineOrder(tableName, orderData);
      }
    }
  };

  if (immediate) {
    return doSync();
  } else {
    syncDebounceTimers[tableName] = setTimeout(doSync, 300);
  }
}

async function deleteTableOrderOnServer(tableName) {
  try {
    await api('/api/tables/order/' + encodeURIComponent(tableName), {
      method: 'DELETE'
    });
  } catch (e) {
    console.warn('Xóa bàn trên server thất bại:', e);
  }
}

async function fetchAndApplyTableSync(silent = false) {
  try {
    const data = await api('/api/tables/sync');
    if (data && data.tables) {
      state.tableList = data.tables;
      localStorage.setItem('pos_table_list', JSON.stringify(state.tableList));
    }
    if (data && data.tableOrders) {
      applyIncomingTableOrders(data.tableOrders);
    }
    updateSyncIndicator(true);
  } catch (err) {
    if (!silent) console.warn('Lỗi lấy dữ liệu sync bàn:', err);
    updateSyncIndicator(false);
  }
}

function applyIncomingTableOrders(newTableOrders) {
  state.tableOrders = newTableOrders || {};
  localStorage.setItem('pos_table_orders', JSON.stringify(state.tableOrders));

  if (state.activeScreen === 'tables') {
    renderTableGrid();
  } else if (state.activeScreen === 'order') {
    renderGroupedDishList();
    updateTableBottomBar();
  }
}

function updateSyncIndicator(online) {
  const dot = document.getElementById('realtimeSyncDot');
  if (dot) {
    if (online) {
      dot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs animate-pulse';
      dot.title = 'Đang đồng bộ trực tiếp đa thiết bị (Online)';
    } else {
      dot.className = 'w-2.5 h-2.5 rounded-full bg-amber-500 shadow-xs';
      dot.title = 'Đang kết nối lại máy chủ...';
    }
  }
}

function connectTableEventSource() {
  if (tableEventSource) {
    try { tableEventSource.close(); } catch (e) {}
  }

  try {
    const base = typeof getApiBaseUrl === 'function' ? getApiBaseUrl() : '';
    const sseUrl = base ? `${base}/api/tables/events` : '/api/tables/events';
    tableEventSource = new EventSource(sseUrl);

    tableEventSource.onopen = () => {
      updateSyncIndicator(true);
    };

    tableEventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.tables) {
          state.tableList = payload.tables;
          localStorage.setItem('pos_table_list', JSON.stringify(state.tableList));
          if (typeof renderTableGrid === 'function') renderTableGrid();
          if (typeof renderManageTablesList === 'function') renderManageTablesList();
        }
        if (payload.all_table_orders !== undefined) {
          applyIncomingTableOrders(payload.all_table_orders);
        }
        if (payload.connected_devices_count !== undefined && typeof updateConnectedDeviceBadgeUI === 'function') {
          updateConnectedDeviceBadgeUI(payload.connected_devices_count);
        }
        if (payload.type === 'print_job' && payload.print_order) {
          const myDevId = typeof getDeviceId === 'function' ? getDeviceId() : null;
          // Bỏ qua nếu chính thiết bị này phát ra lệnh in (tránh laptop tự in lại lần 2)
          if (myDevId && payload.sender_device_id && payload.sender_device_id === myDevId) {
            return;
          }
          const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
          if (!isMobile) {
            console.log('Quầy nhận lệnh từ di động:', payload.print_order);
            playOrderNotificationSound();
            showToast(`🔔 Bếp nhận đơn mới từ ${payload.print_order.table_name || 'Bàn'}!`, 'success');

            // Chỉ gọi lệnh in nếu người dùng BẬT tự động in (đã có máy in bill nhiệt thật)
            if (isAutoPrintEnabled()) {
              if (Date.now() - (window._lastPrintTimestamp || 0) < 2500) return;
              window._lastPrintTimestamp = Date.now();
              executeWindowPrint(payload.print_order);
            }
          }
        }
        updateSyncIndicator(true);
      } catch (e) {}
    };

    tableEventSource.onerror = () => {
      updateSyncIndicator(false);
    };
  } catch (err) {
    updateSyncIndicator(false);
  }
}

function initRealtimeTableSync() {
  fetchAndApplyTableSync();
  connectTableEventSource();

  // Polling dự phòng liên tục mỗi 2.5 giây cho mọi thiết bị
  setInterval(() => {
    fetchAndApplyTableSync(true);
  }, 2500);

  // Khi mở lại tab hoặc mở khóa màn hình điện thoại
  document.addEventListener('visibilitychange', () => {
    fetchAndApplyTableSync();
    if (!tableEventSource || tableEventSource.readyState === EventSource.CLOSED) {
      connectTableEventSource();
    }
  });
}

// Khởi tạo POS
async function initPos() {
  await Promise.all([loadPosCategories(), loadPosProducts()]);
  setupPosSearchListeners();
  showTableFloor();
  initRealtimeTableSync();
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
    btnMangVe.className = 'px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold bg-white text-emerald-700 shadow-xs transition-all';
    btnTaiCho.className = 'px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold text-slate-600 transition-all';
  } else {
    btnTaiCho.className = 'px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold bg-white text-emerald-700 shadow-xs transition-all';
    btnMangVe.className = 'px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold text-slate-600 transition-all';
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
        tabs[k].className = 'area-tab pb-2.5 border-b-2 border-emerald-600 text-emerald-700 font-bold';
      } else {
        tabs[k].className = 'area-tab pb-2.5 text-slate-500 hover:text-slate-800 font-bold';
      }
    }
  });

  renderTableGrid();
}

async function promptAddCustomTable() {
  const custom = prompt('Nhập tên bàn mới (VD: Bàn 13, Bàn VIP, Sân thượng...):', '');
  if (custom && custom.trim()) {
    const tableName = custom.trim();
    if (!state.tableList.includes(tableName)) {
      state.tableList.push(tableName);
      localStorage.setItem('pos_table_list', JSON.stringify(state.tableList));
      showToast(`Đã thêm: ${tableName}`);
      renderTableGrid();
      try {
        await api('/api/tables/custom', {
          method: 'POST',
          body: JSON.stringify({ table_name: tableName })
        });
      } catch (e) {}
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
      // BÀN CÓ KHÁCH: Màu Xanh Ngọc (Tại chỗ) hoặc Màu Vàng Cam (Mang về)
      const totalAmount = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const totalCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
      const startTime = order.startTime || now;
      const elapsedMin = Math.max(1, Math.floor((now - startTime) / 60000));
      const isMangVe = order.source === 'mangve';

      return `
        <div 
          onclick="openTableOrder('${tableName}')"
          class="table-card ${isMangVe ? 'bg-amber-600' : 'bg-emerald-600'} text-white rounded-2xl p-2.5 sm:p-3 flex flex-col justify-between shadow-sm cursor-pointer aspect-square active:scale-95 transition-all"
        >
          <div class="flex items-center justify-between">
            <span class="font-black text-sm sm:text-base tracking-tight text-white">${tableName}</span>
            ${isMangVe 
              ? `<span class="text-[10px] font-black bg-amber-200 text-amber-950 px-1.5 py-0.5 rounded shadow-2xs">MANG VỀ</span>` 
              : `<span class="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-pulse"></span>`}
          </div>

          <div class="my-auto text-center py-1">
            <div class="text-sm sm:text-base font-black text-white leading-tight">
              ${formatMoney(totalAmount)}
            </div>
            <div class="text-xs sm:text-sm text-white/95 font-bold mt-0.5">
              ${totalCount} Món
            </div>
          </div>

          <div class="flex items-center justify-between text-[11px] sm:text-xs text-white/90 font-medium">
            <span>${isMangVe ? 'Mang về' : 'Tại chỗ'}</span>
            <span>${elapsedMin}p</span>
          </div>
        </div>
      `;
    } else {
      // BÀN TRỐNG: Nền trắng viền xám nhẹ nhàng bo góc, chữ Bàn to rõ nét
      return `
        <div 
          onclick="openTableOrder('${tableName}')"
          class="table-card bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl p-2.5 flex items-center justify-center text-slate-800 shadow-2xs cursor-pointer aspect-square active:scale-95 transition-all hover:bg-slate-50"
        >
          <span class="font-extrabold text-base sm:text-lg text-slate-800 tracking-tight">${tableName}</span>
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

  // Khởi tạo đơn cho bàn nếu chưa có
  if (!state.tableOrders[tableName]) {
    state.tableOrders[tableName] = {
      source: state.currentSource || 'taicho',
      startTime: Date.now(),
      note: '',
      items: []
    };
  } else if (!state.tableOrders[tableName].source) {
    state.tableOrders[tableName].source = state.currentSource || 'taicho';
  }

  // Cập nhật nguồn hiện tại theo bàn này
  state.currentSource = state.tableOrders[tableName].source;

  updateOrderScreenHeader();
  renderOrderCategoriesPills();
  renderGroupedDishList();
  updateTableBottomBar();
}

function updateOrderScreenHeader() {
  const currentTable = state.currentTable;
  const tableOrder = state.tableOrders[currentTable];
  const source = tableOrder?.source || state.currentSource || 'taicho';
  const isMangVe = source === 'mangve';

  const nameEl = document.getElementById('orderScreenTableName');
  if (nameEl) nameEl.textContent = currentTable;

  const btnEl = document.getElementById('orderScreenSourceBtn');
  const textEl = document.getElementById('orderScreenSourceText');
  if (btnEl && textEl) {
    if (isMangVe) {
      btnEl.className = 'px-2 py-0.5 rounded-lg text-xs font-black bg-amber-500 hover:bg-amber-600 text-white shadow-2xs transition-all flex items-center space-x-1 shrink-0';
      textEl.textContent = 'MANG VỀ';
    } else {
      btnEl.className = 'px-2 py-0.5 rounded-lg text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all flex items-center space-x-1 shrink-0';
      textEl.textContent = 'TẠI CHỖ';
    }
  }

  const titleEl = document.getElementById('orderScreenTitle');
  if (titleEl) {
    titleEl.textContent = `${currentTable} • ${isMangVe ? 'MANG VỀ' : 'TẠI CHỖ'}`;
  }

  const drawerTableTitle = document.getElementById('cartDrawerTableTitle');
  if (drawerTableTitle) {
    drawerTableTitle.textContent = `${currentTable} • ${isMangVe ? 'Mang về' : 'Tại chỗ'}`;
  }
}

function toggleCurrentTableSource() {
  const currentTable = state.currentTable;
  if (!currentTable) return;

  if (!state.tableOrders[currentTable]) {
    state.tableOrders[currentTable] = {
      source: state.currentSource || 'taicho',
      startTime: Date.now(),
      note: '',
      items: []
    };
  }

  const curSource = state.tableOrders[currentTable].source || 'taicho';
  const newSource = curSource === 'mangve' ? 'taicho' : 'mangve';
  state.tableOrders[currentTable].source = newSource;
  state.currentSource = newSource;
  localStorage.setItem('pos_table_orders', JSON.stringify(state.tableOrders));

  updateOrderScreenHeader();
  updateTableBottomBar();
  showToast(`Đã chuyển ${currentTable} sang: ${newSource === 'mangve' ? 'MANG VỀ' : 'TẠI CHỖ'}`);

  // Nếu bàn đã có món, đồng bộ ngay sang các máy khác
  if (state.tableOrders[currentTable].items && state.tableOrders[currentTable].items.length > 0) {
    api('/api/tables/order', {
      method: 'POST',
      body: JSON.stringify({
        table_name: currentTable,
        order_data: state.tableOrders[currentTable],
        check_conflict: false
      })
    }).catch(e => console.warn('Lỗi đồng bộ nguồn đơn:', e));
  }
}

// Thứ tự ưu tiên hiển thị chuẩn: Hộp mang về -> Bún mắm -> Đồ gọi thêm -> Đồ uống
const PREFERRED_CAT_ORDER = ['hộp mang về', 'bún mắm', 'đồ gọi thêm', 'đồ uống'];

function getCategoryPriority(catName) {
  const lower = (catName || '').trim().toLowerCase();
  const idx = PREFERRED_CAT_ORDER.indexOf(lower);
  return idx !== -1 ? idx : 999;
}

// Thanh danh mục cuộn ngang
function renderOrderCategoriesPills() {
  const container = document.getElementById('orderCategoryPills');
  if (!container) return;

  const totalCount = state.products.length;

  const sortedCategories = [...(state.categories || [])].sort((a, b) => {
    const priA = getCategoryPriority(a.name);
    const priB = getCategoryPriority(b.name);
    if (priA !== priB) return priA - priB;
    return (a.id || 0) - (b.id || 0);
  });

  const pillsHtml = sortedCategories.map(cat => {
    const isActive = currentSelectedCategory == cat.id;
    return `
      <button 
        onclick="filterOrderCategory(${cat.id})" 
        class="cat-pill px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold uppercase whitespace-nowrap transition-all ${
          isActive 
            ? 'bg-emerald-600 text-white shadow-xs' 
            : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
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
      class="cat-pill px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold uppercase whitespace-nowrap transition-all ${
        currentSelectedCategory === 'all' 
          ? 'bg-emerald-600 text-white shadow-xs' 
          : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
      }"
      data-id="all"
    >
      TẤT CẢ (${totalCount})
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
    if (state.categories && state.categories.length > 0) {
      localStorage.setItem('pos_cached_categories', JSON.stringify(state.categories));
    }
  } catch (err) {
    console.warn('Failed to load categories (using fallback/cache):', err);
    state.categories = JSON.parse(localStorage.getItem('pos_cached_categories') || 'null') || [
      { id: 1, name: 'Hộp mang về' },
      { id: 2, name: 'Bún mắm' },
      { id: 3, name: 'Đồ gọi thêm' },
      { id: 4, name: 'Đồ uống' }
    ];
  }
}

async function loadPosProducts() {
  try {
    state.products = await api('/api/products');
    if (state.products && state.products.length > 0) {
      localStorage.setItem('pos_cached_products', JSON.stringify(state.products));
    }
  } catch (err) {
    console.warn('Failed to load products (using fallback/cache):', err);
    state.products = JSON.parse(localStorage.getItem('pos_cached_products') || 'null') || [
      { id: 1, barcode: 'HMV01', name: 'Hộp mang về', category_id: 1, price: 5000, stock: 999, unit: 'hộp', image: '' },
      { id: 2, barcode: 'BM01', name: 'Bún mắm chả cá', category_id: 2, price: 45000, stock: 999, unit: 'tô', image: '' },
      { id: 3, barcode: 'BM02', name: 'Bún mắm heo quay', category_id: 2, price: 55000, stock: 999, unit: 'tô', image: '' },
      { id: 4, barcode: 'BM03', name: 'Bún mắm chả cá heo quay', category_id: 2, price: 60000, stock: 999, unit: 'tô', image: '' },
      { id: 5, barcode: 'BM04', name: 'Bún mắm cá tươi', category_id: 2, price: 55000, stock: 999, unit: 'tô', image: '' },
      { id: 6, barcode: 'BM05', name: 'Bún mắm mực', category_id: 2, price: 80000, stock: 999, unit: 'tô', image: '' },
      { id: 7, barcode: 'BM06', name: 'Bún mắm tôm', category_id: 2, price: 80000, stock: 999, unit: 'tô', image: '' },
      { id: 8, barcode: 'BM07', name: 'Bún mắm đầy đủ', category_id: 2, price: 80000, stock: 999, unit: 'tô', image: '' },
      { id: 9, barcode: 'BM08', name: 'Bún mắm đặc biệt', category_id: 2, price: 100000, stock: 999, unit: 'tô', image: '' },
      { id: 10, barcode: 'THEM01', name: 'Thêm tôm', category_id: 3, price: 18000, stock: 999, unit: 'phần', image: '' },
      { id: 11, barcode: 'THEM02', name: 'Thêm trứng vịt lộn', category_id: 3, price: 10000, stock: 999, unit: 'quả', image: '' },
      { id: 12, barcode: 'THEM03', name: 'Thêm chả cá', category_id: 3, price: 20000, stock: 999, unit: 'phần', image: '' },
      { id: 13, barcode: 'THEM04', name: 'Thêm mực', category_id: 3, price: 40000, stock: 999, unit: 'phần', image: '' },
      { id: 14, barcode: 'THEM05', name: 'Thêm cá tươi', category_id: 3, price: 40000, stock: 999, unit: 'phần', image: '' },
      { id: 15, barcode: 'THEM06', name: 'Thêm heo quay', category_id: 3, price: 40000, stock: 999, unit: 'phần', image: '' },
      { id: 16, barcode: 'THEM07', name: 'Thêm rau', category_id: 3, price: 5000, stock: 999, unit: 'đĩa', image: '' },
      { id: 17, barcode: 'DU01', name: 'Trà đá', category_id: 4, price: 5000, stock: 999, unit: 'ly', image: '' },
      { id: 18, barcode: 'DU02', name: 'Sữa đậu', category_id: 4, price: 10000, stock: 999, unit: 'ly', image: '' },
      { id: 19, barcode: 'DU03', name: 'Coca', category_id: 4, price: 15000, stock: 999, unit: 'lon', image: '' },
      { id: 20, barcode: 'DU04', name: 'Dừa tươi', category_id: 4, price: 25000, stock: 999, unit: 'quả', image: '' },
      { id: 21, barcode: 'DU05', name: 'Bia', category_id: 4, price: 25000, stock: 999, unit: 'lon', image: '' },
      { id: 22, barcode: 'DU06', name: 'Lavie', category_id: 4, price: 10000, stock: 999, unit: 'chai', image: '' }
    ];
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

  // Thứ tự ưu tiên hiển thị: Hộp mang về -> Bún mắm -> Đồ gọi thêm -> Đồ uống
  const sortedCatNames = Object.keys(groups).sort((a, b) => {
    const priA = getCategoryPriority(a);
    const priB = getCategoryPriority(b);
    if (priA !== priB) return priA - priB;
    return a.localeCompare(b, 'vi');
  });

  container.innerHTML = sortedCatNames.map(catName => {
    const sortedDishes = groups[catName].sort((a, b) => (a.id || 0) - (b.id || 0));
    const dishRows = sortedDishes.map(p => {
      const existingInTable = currentItems.find(item => item.id === p.id);
      const currentQty = existingInTable ? existingInTable.quantity : 0;
      const hasImage = isActualImage(p.image);

      let fallbackIcon = 'fa-bowl-food';
      const lowerCat = catName.toLowerCase();
      if (lowerCat.includes('uống')) {
        fallbackIcon = 'fa-glass-water';
      } else if (lowerCat.includes('hộp')) {
        fallbackIcon = 'fa-box-archive';
      }

      return `
        <div class="dish-row bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/80 shadow-xs flex items-center justify-between gap-3 sm:gap-4 transition-all hover:border-slate-300">
          <!-- Thumbnail ảnh hoặc khung giữ chỗ màu xanh lá pastel chuẩn tone thương hiệu -->
          <div class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden bg-emerald-50 shrink-0 border border-emerald-100 flex items-center justify-center text-emerald-600">
            ${hasImage ? `
              <img src="${p.image}" alt="${p.name}" class="w-full h-full object-cover">
            ` : `
              <i class="fa-solid ${fallbackIcon} text-xl text-emerald-600"></i>
            `}
          </div>

          <!-- Tên món & Giá -->
          <div class="min-w-0 flex-1 flex flex-col justify-center">
            <h4 class="font-bold text-sm sm:text-base text-slate-900 leading-snug">
              ${p.name}
            </h4>
            <div class="text-xs sm:text-sm font-bold text-[#ea650d] mt-1">
              ${formatMoney(p.price)}
            </div>
          </div>

          <!-- Bộ nút Stepper [-]  SL  [+] trực tiếp viền trắng bo tròn -->
          <div class="flex items-center justify-between shrink-0 bg-white border border-slate-200 rounded-xl px-2.5 py-1 min-w-[104px] sm:min-w-[118px] shadow-2xs">
            <button 
              type="button"
              onclick="changeDishQty(${p.id}, -1)" 
              class="w-7 h-7 flex items-center justify-center text-slate-700 hover:text-slate-900 active:scale-90 text-sm font-bold select-none cursor-pointer transition-all"
              title="Giảm 1"
            >
              <i class="fa-solid fa-minus text-xs"></i>
            </button>

            <span id="dish-qty-${p.id}" class="w-7 text-center text-sm sm:text-base font-bold text-slate-900 select-none">
              ${currentQty}
            </span>

            <button 
              type="button"
              onclick="changeDishQty(${p.id}, 1)" 
              class="w-7 h-7 flex items-center justify-center text-slate-700 hover:text-slate-900 active:scale-90 text-sm font-bold select-none cursor-pointer transition-all"
              title="Thêm 1"
            >
              <i class="fa-solid fa-plus text-xs"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="space-y-2.5">
        <h3 class="text-sm sm:text-base font-extrabold text-slate-900 uppercase tracking-wide px-0.5 pt-1">
          ${catName}
        </h3>
        <div class="space-y-3">
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

  // Đồng bộ thời gian thực cho mọi thiết bị
  if (tableOrder.items.length === 0) {
    delete state.tableOrders[currentTable];
    localStorage.setItem('pos_table_orders', JSON.stringify(state.tableOrders));
    deleteTableOrderOnServer(currentTable);
  } else {
    syncTableOrderToServer(currentTable);
  }
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

  const source = tableOrder?.source || state.currentSource || 'taicho';
  const sourceLabel = source === 'mangve' ? 'MANG VỀ' : 'TẠI CHỖ';

  if (badgeEl) badgeEl.textContent = totalCount;
  if (moneyEl) moneyEl.textContent = formatMoney(totalAmount);
  if (labelEl) labelEl.textContent = `${currentTable} • ${sourceLabel}`;

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
  const tableOrder = state.tableOrders[currentTable];
  const source = tableOrder?.source || state.currentSource || 'taicho';
  const sourceLabel = source === 'mangve' ? 'Mang về' : 'Tại chỗ';
  const title = document.getElementById('cartDrawerTableTitle');
  if (title) title.textContent = `${currentTable} (${sourceLabel})`;

  const currentNote = state.tableOrders[currentTable]?.note || '';
  const noteInput = document.getElementById('orderNoteInput');
  const noteBox = document.getElementById('orderNoteBox');
  if (noteBox) {
    noteBox.classList.add('hidden');
  }

  if (noteInput) {
    noteInput.value = currentNote;
    noteInput.oninput = () => {
      const val = noteInput.value.trim();
      if (!state.tableOrders[currentTable]) {
        state.tableOrders[currentTable] = {
          source: state.currentSource,
          startTime: Date.now(),
          items: [],
          note: val
        };
      } else {
        state.tableOrders[currentTable].note = val;
      }
      localStorage.setItem('pos_table_orders', JSON.stringify(state.tableOrders));
      updateOrderNoteDisplay(val);
      syncTableOrderToServer(currentTable);
    };
    noteInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        toggleOrderNoteBox(false);
      }
    };
  }

  updateOrderNoteDisplay(currentNote);

  renderCartDrawerItems();

  drawer.classList.remove('translate-x-full');
  backdrop.classList.remove('hidden');
}

function updateOrderNoteDisplay(note) {
  const noteBadge = document.getElementById('orderNoteBadge');
  const noteBtnLabel = document.getElementById('orderNoteBtnLabel');

  if (note) {
    if (noteBadge) {
      noteBadge.textContent = note;
      noteBadge.classList.remove('hidden');
    }
    if (noteBtnLabel) noteBtnLabel.textContent = 'Ghi chú:';
  } else {
    if (noteBadge) {
      noteBadge.textContent = '';
      noteBadge.classList.add('hidden');
    }
    if (noteBtnLabel) noteBtnLabel.textContent = 'Ghi chú';
  }
}

function toggleOrderNoteBox(forceOpen) {
  const box = document.getElementById('orderNoteBox');
  const input = document.getElementById('orderNoteInput');
  if (!box) return;

  const isCurrentlyHidden = box.classList.contains('hidden');
  const willOpen = typeof forceOpen === 'boolean' ? forceOpen : isCurrentlyHidden;

  if (willOpen) {
    box.classList.remove('hidden');
    setTimeout(() => {
      input?.focus();
      if (input) input.select();
    }, 80);
  } else {
    box.classList.add('hidden');
  }
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
  deleteTableOrderOnServer(currentTable);

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

  const source = tableOrder?.source || state.currentSource || 'taicho';
  const sourceLabel = source === 'mangve' ? 'Mang về' : 'Tại chỗ';

  document.getElementById('checkoutModalTable').textContent = `${currentTable} (${sourceLabel})`;
  document.getElementById('checkoutOrderCodePreview').textContent = `${tempOrderCode} • ${currentTable} • ${sourceLabel}`;
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

  // Hiển thị ghi chú đơn hàng nếu có
  const noteBox = document.getElementById('checkoutModalNoteBox');
  const noteText = document.getElementById('checkoutModalNoteText');
  const currentNote = tableOrder?.note || document.getElementById('orderNoteInput')?.value.trim() || '';
  if (noteBox && noteText) {
    if (currentNote) {
      noteText.textContent = currentNote;
      noteBox.classList.remove('hidden');
    } else {
      noteBox.classList.add('hidden');
    }
  }

  document.getElementById('checkoutModal').classList.remove('hidden');
}

function closeCheckoutModal() {
  document.getElementById('checkoutModal')?.classList.add('hidden');
}

// Xóa trắng ghi chú trên modal xác nhận
function clearKitchenConfirmNote() {
  const noteInput = document.getElementById('kitchenConfirmNote');
  const clearBtn = document.getElementById('btnClearKitchenNote');
  if (noteInput) {
    noteInput.value = '';
    noteInput.focus();
  }
  if (clearBtn) clearBtn.classList.add('hidden');
}

// Thêm nhanh tag gợi ý ghi chú trên modal xác nhận
function appendKitchenNote(tag) {
  const noteInput = document.getElementById('kitchenConfirmNote');
  const clearBtn = document.getElementById('btnClearKitchenNote');
  if (!noteInput) return;
  const currentVal = noteInput.value.trim();
  if (!currentVal) {
    noteInput.value = tag;
  } else {
    const parts = currentVal.split(',').map(s => s.trim()).filter(Boolean);
    if (!parts.includes(tag)) {
      parts.push(tag);
      noteInput.value = parts.join(', ');
    }
  }
  if (clearBtn) clearBtn.classList.remove('hidden');
  noteInput.focus();
}

// Đăng ký toàn cục cho các hàm tương tác popup
window.clearKitchenConfirmNote = clearKitchenConfirmNote;
window.appendKitchenNote = appendKitchenNote;

// Mở popup xác nhận in phiếu báo bếp & đặt bàn
function printKitchenSlip() {
  const currentTable = state.currentTable;
  const tableOrder = state.tableOrders[currentTable];
  const items = tableOrder?.items || [];

  if (items.length === 0) {
    showToast('Bàn chưa có món nào để xác nhận!', 'error');
    return;
  }

  const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const source = tableOrder?.source || state.currentSource || 'taicho';
  const sourceLabel = source === 'mangve' ? 'MANG VỀ' : 'TẠI CHỖ';

  const tableEl = document.getElementById('kitchenConfirmTable');
  const totalEl = document.getElementById('kitchenConfirmTotal');
  const countEl = document.getElementById('kitchenConfirmCount');

  if (tableEl) tableEl.textContent = `${currentTable} • ${sourceLabel}`;
  if (totalEl) totalEl.textContent = formatMoney(totalAmount);
  if (countEl) countEl.textContent = `${totalCount} món`;

  // Render danh sách đầy đủ các món để nhân viên xác định
  const itemsListEl = document.getElementById('kitchenConfirmItemsList');
  if (itemsListEl) {
    itemsListEl.innerHTML = items.map((it, idx) => `
      <div class="py-2 flex items-center justify-between text-xs">
        <div class="truncate pr-2">
          <div class="font-bold text-slate-800 truncate">${idx + 1}. ${it.name}</div>
          <div class="text-[11px] text-slate-500 font-semibold">
            SL: ${it.quantity} phần x ${formatMoney(it.price)}
          </div>
        </div>
        <div class="font-black text-slate-800 shrink-0 text-sm">
          ${formatMoney(it.price * it.quantity)}
        </div>
      </div>
    `).join('');
  }

  // Khởi tạo và đồng bộ ô ghi chú trên modal xác nhận
  const kitchenNoteInput = document.getElementById('kitchenConfirmNote');
  const clearBtn = document.getElementById('btnClearKitchenNote');
  if (kitchenNoteInput) {
    const existingNote = tableOrder?.note || document.getElementById('orderNoteInput')?.value.trim() || '';
    kitchenNoteInput.value = existingNote;
    if (clearBtn) clearBtn.classList.toggle('hidden', !existingNote);

    kitchenNoteInput.oninput = () => {
      if (clearBtn) clearBtn.classList.toggle('hidden', !kitchenNoteInput.value.trim());
    };
    kitchenNoteInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        executePrintKitchenSlip();
      }
    };
  }

  document.getElementById('kitchenConfirmModal')?.classList.remove('hidden');
}

function closeKitchenConfirmModal() {
  document.getElementById('kitchenConfirmModal')?.classList.add('hidden');
}

// Khi người dùng bấm "Hủy & Trả Bàn Trống"
function cancelAndClearKitchenSlip() {
  const currentTable = state.currentTable;
  delete state.tableOrders[currentTable];
  localStorage.setItem('pos_table_orders', JSON.stringify(state.tableOrders));
  deleteTableOrderOnServer(currentTable);

  closeKitchenConfirmModal();
  closeTableCartDrawer();
  showToast(`Đã hủy gọi món ${currentTable} (Bàn trống)`);
  showTableFloor();
}

// Khi người dùng bấm "In Báo Bếp"
function executePrintKitchenSlip() {
  const currentTable = state.currentTable;
  const tableOrder = state.tableOrders[currentTable];
  const items = tableOrder?.items || [];

  if (items.length === 0) {
    showToast('Bàn chưa có món nào!', 'error');
    closeKitchenConfirmModal();
    return;
  }

  const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  // Lấy ghi chú từ modal xác nhận (nếu có nhập) hoặc từ giỏ hàng / order cũ
  const modalNoteInput = document.getElementById('kitchenConfirmNote');
  const note = modalNoteInput ? modalNoteInput.value.trim() : (document.getElementById('orderNoteInput')?.value.trim() || tableOrder.note || '');

  // Đảm bảo bàn đã có thời gian bắt đầu và ghi chú
  if (!tableOrder.startTime) {
    tableOrder.startTime = Date.now();
  }
  tableOrder.note = note;
  tableOrder.hasPrintedKitchen = true;

  // Đồng bộ lại ô ghi chú trong giỏ hàng nếu có
  const cartNoteInput = document.getElementById('orderNoteInput');
  if (cartNoteInput) cartNoteInput.value = note;
  if (typeof updateOrderNoteDisplay === 'function') updateOrderNoteDisplay(note);

  const now = new Date();
  const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
  const kitchenCode = tableOrder.orderCode || `BEP-${dateStr}-${String(Math.floor(100 + Math.random() * 900))}`;
  tableOrder.orderCode = kitchenCode;

  // 1. Lưu ngay vào localStorage
  localStorage.setItem('pos_table_orders', JSON.stringify(state.tableOrders));

  const orderForPrint = {
    order_code: kitchenCode,
    created_at: new Date().toISOString(),
    table_name: currentTable,
    source: tableOrder.source || state.currentSource || 'taicho',
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

  closeKitchenConfirmModal();
  closeTableCartDrawer();

  // 2. KÍCH HOẠT IN NẾU CÓ BẬT CHẾ ĐỘ TỰ ĐỘNG IN (HOẶC ĐÃ KẾT NỐI BLUETOOTH)
  if (isAutoPrintEnabled() || bluetoothCharacteristic) {
    printReceipt(orderForPrint);
  }

  // Chỉ phát lệnh in từ xa lên quầy nếu người dùng BẬT tự động in (đã có máy in bill)
  const isMobileDev = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobileDev && isAutoPrintEnabled()) {
    const myDevId = typeof getDeviceId === 'function' ? getDeviceId() : null;
    api('/api/print-job', {
      method: 'POST',
      body: JSON.stringify({
        order: orderForPrint,
        sender_device_id: myDevId
      })
    }).catch(() => {});
  }

  // 3. ĐỒNG BỘ NỀN LÊN SERVER (NON-BLOCKING)
  api('/api/tables/order', {
    method: 'POST',
    body: JSON.stringify({
      table_name: currentTable,
      order_data: tableOrder,
      check_conflict: true
    })
  }).catch(err => {
    if (err.status === 409 || err.data?.conflict) {
      showTableConflictModal(err.data || { table_name: currentTable, incoming_order: tableOrder });
    } else {
      console.warn('Mất kết nối mạng khi in bếp, lưu hàng đợi offline:', err);
      queueOfflineOrder(currentTable, tableOrder);
    }
  });

  // 4. CHUYỂN VỀ SƠ ĐỒ BÀN
  showToast(`Đã xác nhận món ${currentTable}!`);
  if (state.activeScreen !== 'tables') showTableFloor();
}

// =============================================================
// XỬ LÝ XUNG ĐỘT TRÙNG BÀN (CONFLICT RESOLUTION)
// =============================================================
let pendingConflictData = null;

function showTableConflictModal(data) {
  pendingConflictData = data;
  const tableName = data.table_name || state.currentTable;
  const existingOrder = data.existing_order || {};
  const incomingOrder = data.incoming_order || state.tableOrders[tableName] || {};

  const tableNameEl = document.getElementById('conflictTableName');
  if (tableNameEl) tableNameEl.innerText = tableName;

  // Render các món đang có trên bàn (từ máy trước gửi lên)
  const existingContainer = document.getElementById('conflictExistingItems');
  const existingTotalEl = document.getElementById('conflictExistingTotal');
  if (existingContainer) {
    const exItems = existingOrder.items || [];
    if (exItems.length === 0) {
      existingContainer.innerHTML = '<div class="text-slate-400 py-2 italic text-center">Không có món</div>';
    } else {
      existingContainer.innerHTML = exItems.map(it => `
        <div class="py-1 flex justify-between items-center text-slate-700">
          <span class="font-medium truncate mr-1">${it.name || it.product_name}</span>
          <span class="font-bold shrink-0 text-slate-900">x${it.quantity}</span>
        </div>
      `).join('');
    }
    const exTotal = exItems.reduce((s, it) => s + (it.price * it.quantity), 0);
    if (existingTotalEl) existingTotalEl.innerText = formatMoney(exTotal);
  }

  // Render các món máy này vừa chọn
  const incomingContainer = document.getElementById('conflictIncomingItems');
  const incomingTotalEl = document.getElementById('conflictIncomingTotal');
  if (incomingContainer) {
    const incItems = incomingOrder.items || [];
    incomingContainer.innerHTML = incItems.map(it => `
      <div class="py-1 flex justify-between items-center text-amber-950">
        <span class="font-medium truncate mr-1">${it.name}</span>
        <span class="font-bold shrink-0 text-amber-800">x${it.quantity}</span>
      </div>
    `).join('');
    const incTotal = incItems.reduce((s, it) => s + (it.price * it.quantity), 0);
    if (incomingTotalEl) incomingTotalEl.innerText = formatMoney(incTotal);
  }

  const modal = document.getElementById('tableConflictModal');
  if (modal) modal.classList.remove('hidden');
}

function closeTableConflictModal() {
  const modal = document.getElementById('tableConflictModal');
  if (modal) modal.classList.add('hidden');
  pendingConflictData = null;
}

// 1. Gộp món vào bàn này
async function resolveConflictMerge() {
  if (!pendingConflictData) return;
  const tableName = pendingConflictData.table_name || state.currentTable;
  const incomingOrder = pendingConflictData.incoming_order || state.tableOrders[tableName];

  try {
    const res = await api('/api/tables/order', {
      method: 'POST',
      body: JSON.stringify({
        table_name: tableName,
        order_data: incomingOrder,
        merge: true
      })
    });

    if (res.order_data) {
      state.tableOrders[tableName] = res.order_data;
      localStorage.setItem('pos_table_orders', JSON.stringify(state.tableOrders));
    }

    closeTableConflictModal();
    closeTableCartDrawer();

    // In phiếu các món gọi thêm cho bếp
    const incItems = incomingOrder.items || [];
    const incTotal = incItems.reduce((s, it) => s + (it.price * it.quantity), 0);
    const orderForPrint = {
      order_code: (state.tableOrders[tableName]?.orderCode || 'BEP-GOP') + '-THEM',
      created_at: new Date().toISOString(),
      table_name: tableName + ' (GỘP THÊM)',
      source: incomingOrder.source || state.tableOrders[tableName]?.source || 'taicho',
      cashier_name: state.currentUser ? state.currentUser.name : 'Nhân Viên',
      note: incomingOrder.note || 'Gọi thêm',
      payment_method: 'cash',
      subtotal: incTotal,
      discount: 0,
      total: incTotal,
      items: incItems.map(item => ({
        product_name: item.name,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity
      }))
    };
    printReceipt(orderForPrint);

    showToast(`Đã gộp món vào ${tableName} và in phiếu báo bếp thành công!`);
    showTableFloor();
  } catch (err) {
    showToast('Lỗi khi gộp món: ' + (err.message || 'Vui lòng thử lại'), 'error');
  }
}

// 2. Chuyển sang bàn khác
function resolveConflictMoveTable() {
  if (!pendingConflictData) return;
  const emptyListEl = document.getElementById('conflictEmptyTablesList');
  if (!emptyListEl) return;

  const currentT = pendingConflictData.table_name;
  const allTables = state.tableList || [];
  const emptyTables = allTables.filter(t => {
    if (t === currentT) return false;
    const ord = state.tableOrders[t];
    return !ord || !ord.items || ord.items.length === 0;
  });

  if (emptyTables.length === 0) {
    showToast('Hiện tại quán đã hết bàn trống! Vui lòng chọn Gộp món hoặc Hủy.', 'warning');
    return;
  }

  emptyListEl.innerHTML = emptyTables.map(t => `
    <button onclick="selectConflictNewTable('${t}')" class="p-3 bg-slate-50 hover:bg-emerald-50 active:bg-emerald-100 border border-slate-200 hover:border-emerald-300 rounded-xl flex flex-col items-center justify-center text-center transition-all">
      <i class="fa-solid fa-chair text-slate-400 text-lg mb-1"></i>
      <span class="font-bold text-xs text-slate-800">${t}</span>
    </button>
  `).join('');

  const modal = document.getElementById('conflictMoveSelectModal');
  if (modal) modal.classList.remove('hidden');
}

function closeConflictMoveModal() {
  const modal = document.getElementById('conflictMoveSelectModal');
  if (modal) modal.classList.add('hidden');
}

// Khi nhân viên chạm chọn một bàn trống mới
async function selectConflictNewTable(newTable) {
  if (!pendingConflictData) return;
  const oldTable = pendingConflictData.table_name;
  const incomingOrder = pendingConflictData.incoming_order;

  // Cập nhật đơn vào bàn mới
  incomingOrder.table_name = newTable;
  state.tableOrders[newTable] = incomingOrder;

  // Cập nhật bàn cũ theo dữ liệu của máy trước trên server
  if (pendingConflictData.existing_order) {
    state.tableOrders[oldTable] = pendingConflictData.existing_order;
  }

  localStorage.setItem('pos_table_orders', JSON.stringify(state.tableOrders));

  // Gửi lưu bàn mới lên server
  try {
    await api('/api/tables/order', {
      method: 'POST',
      body: JSON.stringify({
        table_name: newTable,
        order_data: incomingOrder,
        check_conflict: false
      })
    });
  } catch (e) {
    queueOfflineOrder(newTable, incomingOrder);
  }

  closeConflictMoveModal();
  closeTableConflictModal();
  closeTableCartDrawer();

  // In phiếu bếp cho bàn mới
  const items = incomingOrder.items || [];
  const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const orderForPrint = {
    order_code: incomingOrder.orderCode || 'BEP-CHUYEN',
    created_at: new Date().toISOString(),
    table_name: newTable,
    source: incomingOrder.source || 'taicho',
    cashier_name: state.currentUser ? state.currentUser.name : 'Nhân Viên',
    note: incomingOrder.note || '',
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

  showToast(`Đã chuyển toàn bộ món sang ${newTable} và in phiếu bếp!`);
  state.currentTable = newTable;
  showTableFloor();
}

// Bấm nút Hủy bàn ở header màn hình gọi món
function promptCancelCurrentTable() {
  const currentTable = state.currentTable;
  const order = state.tableOrders[currentTable];
  if (!order || !order.items || order.items.length === 0) {
    showToast(`${currentTable} hiện đang trống!`);
    showTableFloor();
    return;
  }

  if (confirm(`Hủy toàn bộ món của ${currentTable} và đưa bàn về trạng thái TRỐNG?`)) {
    delete state.tableOrders[currentTable];
    localStorage.setItem('pos_table_orders', JSON.stringify(state.tableOrders));
    deleteTableOrderOnServer(currentTable);
    showToast(`Đã làm trống ${currentTable}`);
    showTableFloor();
  }
}

// Xử lý khi bấm nút quay lại ← từ màn hình gọi món
function handleBackFromOrderScreen() {
  const currentTable = state.currentTable;
  const order = state.tableOrders[currentTable];

  // Nếu bàn có món nhưng CHƯA TỪNG in gửi bếp:
  if (order && order.items && order.items.length > 0 && !order.hasPrintedKitchen) {
    const shouldClear = confirm(
      `${currentTable} vừa chọn món nhưng CHƯA BẤM XÁC NHẬN.\n\n` +
      `- Bấm [OK] để: HỦY GỌI MÓN (Trả bàn về trống)\n` +
      `- Bấm [Hủy] để: GIỮ BÀN (Lưu lại để chọn tiếp sau)`
    );
    if (shouldClear) {
      delete state.tableOrders[currentTable];
      localStorage.setItem('pos_table_orders', JSON.stringify(state.tableOrders));
      deleteTableOrderOnServer(currentTable);
      showToast(`Đã làm trống ${currentTable}`);
    }
  }

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

    const source = tableOrder.source || state.currentSource || 'taicho';
    const sourceLabel = source === 'mangve' ? 'Mang về' : 'Tại chỗ';

    const payload = {
      items: tableOrder.items.map(item => ({
        id: item.id,
        quantity: item.quantity
      })),
      table_name: `${currentTable} (${sourceLabel})`,
      raw_table_name: currentTable,
      note: note,
      payment_method: 'cash',
      cash_given: totalAmount
    };

    const newOrder = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    // XÓA ĐƠN CỦA BÀN VÀ TRẢ BÀN VỀ TRẠNG THÁI TRỐNG TRÊN CẢ CLIENT VÀ SERVER
    delete state.tableOrders[currentTable];
    localStorage.setItem('pos_table_orders', JSON.stringify(state.tableOrders));
    await deleteTableOrderOnServer(currentTable);

    closeCheckoutModal();
    closeTableCartDrawer();

    showToast(`Đã thanh toán ${currentTable}, bàn đã trống!`);

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
    source: tableOrder?.source || state.currentSource || 'taicho',
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
function formatReceiptNum(val) {
  const num = Math.round(Number(val) || 0);
  return num.toLocaleString('en-US');
}

function generateReceiptHtml(order) {
  const storeName = state.settings.store_name || 'Bún mắm miền Tây';
  const storeAddress = state.settings.store_address || '324 Bạch Mai';
  const footerNotice = state.settings.receipt_footer || 'Quý khách vui lòng mang phiếu này ra quầy khi thanh toán';

  // Xác định hình thức: Mang về hay Tại chỗ
  let orderSource = order.source;
  if (!orderSource && order.table_name && state.tableOrders && state.tableOrders[order.table_name]) {
    orderSource = state.tableOrders[order.table_name].source;
  }
  if (!orderSource) {
    orderSource = state.currentSource || 'taicho';
  }

  const isMangVe = (orderSource === 'mangve') || 
                   (order.order_type && order.order_type.toLowerCase().includes('mang')) ||
                   (order.table_name && order.table_name.toLowerCase().includes('mang về'));
  const sourceLabel = isMangVe ? 'MANG VỀ' : 'TẠI CHỖ';

  let rawTable = (order.table_name || 'Bàn 1').trim();
  let tableDisplay = rawTable;
  if (!tableDisplay.toLowerCase().startsWith('bàn') && !tableDisplay.toLowerCase().startsWith('mang')) {
    tableDisplay = 'Bàn ' + tableDisplay;
  }

  const createdAt = order.created_at ? new Date(order.created_at) : new Date();
  const dateStr = String(createdAt.getDate()).padStart(2, '0') + '/' + 
                  String(createdAt.getMonth() + 1).padStart(2, '0') + '/' + 
                  createdAt.getFullYear();
  const timeStr = String(createdAt.getHours()).padStart(2, '0') + ':' + 
                  String(createdAt.getMinutes()).padStart(2, '0');

  const itemsHtml = (order.items || []).map((item) => {
    const qty = Number(item.quantity) || 1;
    const price = Number(item.price) || 0;
    const total = Number(item.total !== undefined ? item.total : price * qty);
    const itemName = item.product_name || item.name || '';
    return `
      <tr>
        <td style="text-align: left; vertical-align: top; padding: 5px 2px; word-break: break-word; font-size: 13.5px;">${itemName}</td>
        <td style="text-align: center; vertical-align: top; padding: 5px 1px; font-size: 13.5px;">${qty}</td>
        <td style="text-align: right; vertical-align: top; padding: 5px 1px; white-space: nowrap; font-size: 13.5px;">${formatReceiptNum(price)}</td>
        <td style="text-align: right; vertical-align: top; padding: 5px 1px; white-space: nowrap; font-size: 13.5px;">${formatReceiptNum(total)}</td>
      </tr>
    `;
  }).join('');

  const subtotal = Number(order.subtotal !== undefined ? order.subtotal : (order.total || 0));
  const discount = Number(order.discount || 0);
  const finalTotal = Number(order.total !== undefined ? order.total : (subtotal - discount));

  const isChuyenKhoan = order.payment_method === 'transfer' || 
                        order.payment_method === 'bank' || 
                        order.payment_method === 'qr' ||
                        order.payment_method === 'chuyenkhoan';
  const paymentMethodLabel = isChuyenKhoan ? 'Thanh toán chuyển khoản' : 'Thanh toán tiền mặt';

  return `
    <div class="receipt-title" style="font-size: 18px; font-weight: 900; text-align: center; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px;">
      HÓA ĐƠN THANH TOÁN
    </div>

    <div class="receipt-meta" style="margin-bottom: 6px; line-height: 1.4;">
      <div style="border: 2px dashed #000; padding: 6px 4px; margin: 5px 0 7px 0; text-align: center; border-radius: 4px;">
        <div style="font-size: 23px; font-weight: 900; letter-spacing: 0.5px; line-height: 1.25;">
          ${tableDisplay} - ${sourceLabel}
        </div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 13px;">
        <span><strong>Giờ vào:</strong> ${timeStr}</span>
        <span><strong>Ngày:</strong> ${dateStr}</span>
      </div>
      ${order.note ? `<div style="margin-top: 4px; font-size: 13px;"><strong>Ghi chú:</strong> ${order.note}</div>` : ''}
    </div>

    <table class="receipt-table" style="width: 100%; border-collapse: collapse; margin: 6px 0;">
      <thead>
        <tr style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; font-size: 13px;">
          <th style="width: 48%; text-align: left; padding: 5px 2px; border-right: 1px solid #000; font-weight: bold;">Tên món</th>
          <th style="width: 14%; text-align: center; padding: 5px 1px; border-right: 1px solid #000; font-weight: bold;">SL</th>
          <th style="width: 19%; text-align: right; padding: 5px 1px; border-right: 1px solid #000; font-weight: bold;">Đơn giá</th>
          <th style="width: 19%; text-align: right; padding: 5px 1px; font-weight: bold;">Thành tiền</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div class="receipt-divider" style="border-bottom: 1px dashed #000; margin: 5px 0 7px 0;"></div>

    <table class="receipt-summary" style="width: 100%; border-collapse: collapse; font-size: 13.5px; margin-top: 2px; font-weight: bold;">
      <tr style="font-weight: bold;">
        <td style="padding: 2.5px 0; font-weight: bold;">Thành tiền:</td>
        <td style="padding: 2.5px 0; text-align: right; font-weight: bold;">${formatReceiptNum(subtotal)} đ</td>
      </tr>
      ${discount > 0 ? `
      <tr style="font-weight: bold;">
        <td style="padding: 2.5px 0; font-weight: bold;">Giảm giá:</td>
        <td style="padding: 2.5px 0; text-align: right; font-weight: bold;">-${formatReceiptNum(discount)} đ</td>
      </tr>
      ` : ''}
      <tr class="receipt-total" style="font-size: 16px; font-weight: 900;">
        <td style="padding: 4px 0; font-weight: 900;">Tổng tiền:</td>
        <td style="padding: 4px 0; text-align: right; font-weight: 900;">${formatReceiptNum(finalTotal)} đ</td>
      </tr>
      <tr class="receipt-payment-row" style="font-weight: normal; font-size: 13px; color: #000000;">
        <td style="padding: 2px 0; font-weight: normal; font-size: 13px; color: #000000;">+ ${paymentMethodLabel}</td>
        <td style="padding: 2px 0; text-align: right; font-weight: normal; font-size: 13px; color: #000000;">${formatReceiptNum(finalTotal)} đ</td>
      </tr>
    </table>

    <div class="receipt-footer" style="text-align: center; margin-top: 16px; font-size: 12.5px; line-height: 1.45;">
      <div style="font-weight: bold; font-size: 15px; margin-bottom: 3px;">${storeName}</div>
      <div style="margin-bottom: 8px;">Địa chỉ: ${storeAddress}</div>
      <div style="margin-top: 6px; font-weight: bold;">${footerNotice}</div>
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

  const storeName = state.settings.store_name || 'Bun mam mien Tay';
  const storeAddress = state.settings.store_address || '324 Bach Mai';
  const footerNotice = state.settings.receipt_footer || 'Quy khach vui long mang phieu nay ra quay khi thanh toan';
  const lineWidth = 32;
  const divider = '-'.repeat(lineWidth) + '\n';

  let orderSource = order.source;
  if (!orderSource && order.table_name && state.tableOrders && state.tableOrders[order.table_name]) {
    orderSource = state.tableOrders[order.table_name].source;
  }
  if (!orderSource) orderSource = state.currentSource || 'taicho';
  const isMangVe = (orderSource === 'mangve') || 
                   (order.order_type && order.order_type.toLowerCase().includes('mang')) ||
                   (order.table_name && order.table_name.toLowerCase().includes('mang ve'));
  const sourceLabel = isMangVe ? 'MANG VE' : 'TAI CHO';

  let rawTable = (order.table_name || 'Ban 1').trim();
  let tableDisplay = rawTable;
  if (!tableDisplay.toLowerCase().startsWith('ban') && !tableDisplay.toLowerCase().startsWith('mang')) {
    tableDisplay = 'Ban ' + tableDisplay;
  }

  const createdAt = order.created_at ? new Date(order.created_at) : new Date();
  const dateStr = String(createdAt.getDate()).padStart(2, '0') + '/' + 
                  String(createdAt.getMonth() + 1).padStart(2, '0') + '/' + 
                  createdAt.getFullYear();
  const timeStr = String(createdAt.getHours()).padStart(2, '0') + ':' + 
                  String(createdAt.getMinutes()).padStart(2, '0');

  let content = '\x1B\x40'; // Reset
  content += '\x1B\x61\x01'; // Canh giữa
  content += '\x1B\x45\x01' + 'HOA DON THANH TOAN\n\n' + '\x1B\x45\x00';
  content += divider;
  content += '\x1B\x61\x01'; // Canh giữa
  content += '\x1B\x45\x01'; // In đậm
  content += `${tableDisplay} - ${sourceLabel}\n`;
  content += '\x1B\x45\x00'; // Bình thường
  content += '\x1B\x61\x00'; // Canh trái
  content += divider;
  content += formatLineColumns(`Gio vao: ${timeStr}`, `Ngay: ${dateStr}`, lineWidth);
  if (order.note) content += `Ghi chu: ${removeVietnameseAccents(order.note)}\n`;

  content += divider;
  content += 'TEN MON | SL | GIA | TIEN\n';
  content += divider;

  (order.items || []).forEach((it) => {
    const qty = Number(it.quantity) || 1;
    const price = Number(it.price) || 0;
    const total = Number(it.total !== undefined ? it.total : price * qty);
    content += `${removeVietnameseAccents(it.product_name || it.name)}\n`;
    content += formatLineColumns(`   ${qty} x ${formatReceiptNum(price)}`, formatReceiptNum(total), lineWidth);
  });

  content += divider;
  const subtotal = Number(order.subtotal !== undefined ? order.subtotal : (order.total || 0));
  const finalTotal = Number(order.total !== undefined ? order.total : subtotal);
  content += '\x1B\x45\x01'; // In đậm Thành tiền và Tổng tiền
  content += formatLineColumns('Thanh tien:', formatReceiptNum(subtotal) + ' d', lineWidth);
  content += formatLineColumns('Tong tien:', formatReceiptNum(finalTotal) + ' d', lineWidth);
  content += '\x1B\x45\x00'; // Hết in đậm trước mục thanh toán để in nét thường/mờ hơn

  const isChuyenKhoan = order.payment_method === 'transfer' || order.payment_method === 'bank' || order.payment_method === 'qr';
  const payLabel = isChuyenKhoan ? '+ Thanh toan chuyen khoan' : '+ Thanh toan tien mat';
  content += formatLineColumns(payLabel, formatReceiptNum(finalTotal) + ' d', lineWidth);

  content += '\n\x1B\x61\x01'; // Canh giữa
  content += '\x1B\x45\x01' + removeVietnameseAccents(storeName) + '\x1B\x45\x00\n';
  content += `Dia chi: ${removeVietnameseAccents(storeAddress)}\n`;
  content += `${removeVietnameseAccents(footerNotice)}\n\n\n\n\x1D\x56\x01`; // Cắt giấy

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

let lastPrintedOrder = null;

function printReceipt(order) {
  // Nếu tự động in đang tắt và không có máy in Bluetooth -> Không gọi window.print() để tuyệt đối không mở File Explorer
  if (!isAutoPrintEnabled() && !bluetoothCharacteristic) {
    console.log('Chế độ tự động in đang tắt, bỏ qua lệnh in để không mở File Explorer');
    return;
  }

  if (Date.now() - (window._lastPrintTimestamp || 0) < 2000) {
    console.log('Chặn in trùng lặp trong 2s');
    return;
  }
  window._lastPrintTimestamp = Date.now();
  lastPrintedOrder = order;

  if (bluetoothCharacteristic) {
    showToast('Đang in phiếu qua Bluetooth...');
    printEscPosBluetooth(order).then(() => {
      showToast('Đã in phiếu thành công!');
    }).catch(err => {
      console.warn('Bluetooth print failed, falling back to window.print', err);
      if (isAutoPrintEnabled()) executeWindowPrint(order);
    });
    return;
  }

  executeWindowPrint(order);
}

function playOrderNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    // Ding-dong chime (880Hz then 1174Hz)
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch (e) {}
}

function executeWindowPrint(order) {
  // Chỉ gọi window.print nếu người dùng BẬT tự động in hoặc có máy in Bluetooth
  if (!isAutoPrintEnabled() && !bluetoothCharacteristic) {
    console.log('Chế độ in đang tắt, bỏ qua executeWindowPrint để không mở File Explorer');
    return;
  }
  const receiptHtml = generateReceiptHtml(order);

  // 1. Cập nhật DOM chính #printable-receipt để in
  let container = document.getElementById('printable-receipt');
  if (!container) {
    container = document.createElement('div');
    container.id = 'printable-receipt';
    const appEl = document.getElementById('app') || document.body;
    appEl.insertBefore(container, appEl.firstChild);
  }
  container.innerHTML = receiptHtml;

  // 2. Kích hoạt trực tiếp hộp thoại in hệ thống (Chrome Print / iOS AirPrint)
  try {
    window.print();
  } catch (err) {
    console.warn('Lỗi gọi window.print:', err);
    printViaIsolatedIframe(receiptHtml);
  }
}

function printViaIsolatedIframe(receiptHtml) {
  if (!isAutoPrintEnabled() && !bluetoothCharacteristic) {
    console.log('Chế độ in đang tắt, bỏ qua printViaIsolatedIframe để không mở File Explorer');
    return;
  }
  let iframe = document.getElementById('pos-print-isolated-iframe');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'pos-print-isolated-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '100px';
    iframe.style.height = '100px';
    iframe.style.border = '0';
    iframe.style.opacity = '0.01';
    iframe.style.zIndex = '-9999';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);
  }

  const iframeDoc = iframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8">
      <title>Hóa Đơn Thanh Toán</title>
      <style>
        @page {
          margin: 0;
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        html, body {
          width: 80mm;
          margin: 0;
          padding: 0;
          background: #ffffff;
          color: #000000;
          font-family: 'Courier New', Courier, monospace, sans-serif;
          font-size: 13px;
          line-height: 1.35;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .receipt-container {
          width: 80mm;
          max-width: 80mm;
          padding: 4mm 3mm;
          background: #ffffff;
          color: #000000;
        }
        .receipt-title {
          font-size: 18px;
          font-weight: 900;
          text-align: center;
          text-transform: uppercase;
          margin-bottom: 8px;
          letter-spacing: 0.5px;
        }
        .receipt-meta {
          font-size: 13px;
          line-height: 1.45;
          margin-bottom: 6px;
        }
        .receipt-table {
          width: 100%;
          border-collapse: collapse;
          margin: 6px 0;
        }
        .receipt-table th {
          border-top: 1px dashed #000000;
          border-bottom: 1px dashed #000000;
          padding: 5px 2px;
          font-size: 13px;
          font-weight: bold;
        }
        .receipt-table th:not(:last-child) {
          border-right: 1px solid #000000;
        }
        .receipt-table td {
          padding: 5px 2px;
          font-size: 13.5px;
          vertical-align: top;
        }
        .receipt-divider {
          border-bottom: 1px dashed #000000;
          margin: 5px 0 7px 0;
        }
        .receipt-summary {
          width: 100%;
          margin-top: 2px;
          border-collapse: collapse;
        }
        .receipt-summary td {
          padding: 3px 0;
          font-size: 13.5px;
          font-weight: bold;
        }
        .receipt-summary tr.receipt-payment-row,
        .receipt-summary tr.receipt-payment-row * {
          padding: 2px 0;
          font-size: 13px !important;
          font-weight: normal !important;
          color: #000000 !important;
          opacity: 1 !important;
        }
        .receipt-total {
          font-size: 16px;
          font-weight: 900;
        }
        .receipt-footer {
          text-align: center;
          font-size: 12.5px;
          margin-top: 16px;
          line-height: 1.45;
        }
      </style>
    </head>
    <body>
      <div class="receipt-container">
        ${receiptHtml}
      </div>
    </body>
    </html>
  `);
  iframeDoc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (err) {
      console.warn('Iframe print error, fallback to window.print:', err);
      try {
        window.print();
      } catch (e) {}
    }
  }, 120);
}

function openReceiptPrintWindow() {
  if (!lastPrintedOrder) {
    showToast('Chưa có thông tin phiếu!', 'error');
    return;
  }
  const receiptHtml = generateReceiptHtml(lastPrintedOrder);
  const win = window.open('', '_blank', 'width=420,height=650');
  if (!win) {
    showToast('Trình duyệt chặn popup. Hãy bấm Cho phép mở popup để xem trang in riêng!', 'warning');
    return;
  }

  let orderSource = lastPrintedOrder.source;
  if (!orderSource && lastPrintedOrder.table_name && state.tableOrders && state.tableOrders[lastPrintedOrder.table_name]) {
    orderSource = state.tableOrders[lastPrintedOrder.table_name].source;
  }
  if (!orderSource) orderSource = state.currentSource || 'taicho';
  const sourceLabel = (orderSource === 'mangve' || (lastPrintedOrder.table_name && lastPrintedOrder.table_name.toLowerCase().includes('mang về'))) ? 'MANG VỀ' : 'TẠI CHỖ';

  win.document.write(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8">
      <title>Hóa Đơn Thanh Toán - ${lastPrintedOrder.table_name || 'Bàn'} [${sourceLabel}]</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        body {
          margin: 0;
          padding: 12px;
          background: #f8fafc;
          font-family: 'Courier New', Courier, monospace, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .btn-print {
          background: #059669;
          color: white;
          border: none;
          padding: 12px 24px;
          font-size: 14px;
          font-weight: bold;
          border-radius: 10px;
          cursor: pointer;
          margin-bottom: 16px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .receipt-container {
          background: white;
          width: 80mm;
          padding: 4mm 3mm;
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          border: 1px dashed #cbd5e1;
          border-radius: 8px;
        }
        .receipt-title { font-size: 18px; font-weight: 900; text-align: center; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px; }
        .receipt-meta { font-size: 13px; line-height: 1.45; margin-bottom: 6px; }
        .receipt-table { width: 100%; border-collapse: collapse; margin: 6px 0; }
        .receipt-table th { border-top: 1px dashed #000; border-bottom: 1px dashed #000; text-align: center; padding: 5px 2px; font-size: 13px; font-weight: bold; }
        .receipt-table th:not(:last-child) { border-right: 1px solid #000; }
        .receipt-table td { padding: 5px 2px; font-size: 13.5px; vertical-align: top; }
        .receipt-divider { border-bottom: 1px dashed #000; margin: 5px 0 7px 0; }
        .receipt-summary { width: 100%; margin-top: 2px; border-collapse: collapse; }
        .receipt-summary td { padding: 3px 0; font-size: 13.5px; font-weight: bold; }
        .receipt-summary tr.receipt-payment-row, .receipt-summary tr.receipt-payment-row * { padding: 2px 0; font-size: 13px !important; font-weight: normal !important; color: #000000 !important; opacity: 1 !important; }
        .receipt-total { font-size: 16px; font-weight: 900; }
        .receipt-footer { text-align: center; font-size: 12.5px; margin-top: 16px; line-height: 1.45; }
        @media print {
          body { background: white; padding: 0; }
          .btn-print { display: none; }
          .receipt-container { box-shadow: none; border: none; padding: 4mm 3mm; width: 80mm; }
        }
      </style>
    </head>
    <body>
      <button class="btn-print" onclick="window.print()">🖨️ BẤM VÀO ĐÂY ĐỂ IN HÓA ĐƠN THANH TOÁN</button>
      <div class="receipt-container">
        ${receiptHtml}
      </div>
      <script>
        window.onload = function() {
          setTimeout(function() { window.print(); }, 250);
        };
      <\/script>
    </body>
    </html>
  `);
  win.document.close();
}


async function sendPrintJobToServer() {
  if (!lastPrintedOrder) {
    showToast('Chưa có thông tin phiếu!', 'error');
    return;
  }
  try {
    showToast('Đang phát lệnh in tới máy tính quầy...');
    await api('/api/print-job', {
      method: 'POST',
      body: JSON.stringify({ order: lastPrintedOrder })
    });
    showToast('Đã gửi lệnh in thành công tới máy tính quầy!', 'success');
  } catch (err) {
    showToast('Chưa kết nối máy tính quầy (Vui lòng kiểm tra IP trong Cài đặt)', 'warning');
  }
}

function triggerDirectSystemPrint() {
  if (!lastPrintedOrder) {
    showToast('Chưa có thông tin phiếu!', 'error');
    return;
  }
  if (Date.now() - (window._lastPrintTimestamp || 0) < 2000) return;
  window._lastPrintTimestamp = Date.now();
  const receiptHtml = generateReceiptHtml(lastPrintedOrder);
  try {
    window.print();
  } catch (e) {
    console.warn('Lỗi gọi window.print từ modal, chuyển sang iframe:', e);
    printViaIsolatedIframe(receiptHtml);
  }
}

function copyReceiptTextToClipboard() {
  if (!lastPrintedOrder) {
    showToast('Chưa có thông tin phiếu!', 'error');
    return;
  }
  const o = lastPrintedOrder;
  let orderSource = o.source;
  if (!orderSource && o.table_name && state.tableOrders && state.tableOrders[o.table_name]) {
    orderSource = state.tableOrders[o.table_name].source;
  }
  if (!orderSource) orderSource = state.currentSource || 'taicho';
  const sourceLabel = (orderSource === 'mangve' || (o.table_name && o.table_name.toLowerCase().includes('mang về'))) ? 'MANG VỀ' : 'TẠI CHỖ';

  let rawTable = (o.table_name || 'Bàn 1').trim();
  let tableDisplay = rawTable;
  if (!tableDisplay.toLowerCase().startsWith('bàn') && !tableDisplay.toLowerCase().startsWith('mang')) {
    tableDisplay = 'Bàn ' + tableDisplay;
  }

  const createdAt = o.created_at ? new Date(o.created_at) : new Date();
  const dateStr = String(createdAt.getDate()).padStart(2, '0') + '/' + 
                  String(createdAt.getMonth() + 1).padStart(2, '0') + '/' + 
                  createdAt.getFullYear();
  const timeStr = String(createdAt.getHours()).padStart(2, '0') + ':' + 
                  String(createdAt.getMinutes()).padStart(2, '0');

  const subtotal = Number(o.subtotal !== undefined ? o.subtotal : (o.total || 0));
  const finalTotal = Number(o.total !== undefined ? o.total : subtotal);
  const isChuyenKhoan = o.payment_method === 'transfer' || o.payment_method === 'bank' || o.payment_method === 'qr';
  const payLabel = isChuyenKhoan ? '+ Thanh toán chuyển khoản' : '+ Thanh toán tiền mặt';

  const storeName = state.settings.store_name || 'Bún mắm miền Tây';
  const storeAddress = state.settings.store_address || '324 Bạch Mai';
  const footerNotice = state.settings.receipt_footer || 'Quý khách vui lòng mang phiếu này ra quầy khi thanh toán';

  const itemsText = (o.items || []).map((it) => {
    const qty = Number(it.quantity) || 1;
    const price = Number(it.price) || 0;
    const total = Number(it.total !== undefined ? it.total : price * qty);
    return `${it.product_name || it.name} | ${qty} | ${formatReceiptNum(price)} | ${formatReceiptNum(total)}`;
  }).join('\n');

  const text = `HÓA ĐƠN THANH TOÁN\n` +
               `------------------------------------------\n` +
               `       [ ${tableDisplay} - ${sourceLabel} ]\n` +
               `------------------------------------------\n` +
               `Giờ vào: ${timeStr}    Ngày: ${dateStr}\n` +
               (o.note ? `Ghi chú: ${o.note}\n` : '') +
               `------------------------------------------\n` +
               `Tên món | SL | Đơn giá | Thành tiền\n` +
               `------------------------------------------\n` +
               `${itemsText}\n` +
               `------------------------------------------\n` +
               `Thành tiền: ${formatReceiptNum(subtotal)} đ\n` +
               `Tổng tiền: ${formatReceiptNum(finalTotal)} đ\n` +
               `${payLabel} ${formatReceiptNum(finalTotal)} đ\n\n` +
               `${storeName}\n` +
               `Địa chỉ: ${storeAddress}\n` +
               `${footerNotice}`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Đã sao chép nội dung hóa đơn!', 'success');
    }).catch(() => {
      fallbackCopyText(text);
    });
  } else {
    fallbackCopyText(text);
  }
}

function fallbackCopyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
    showToast('Đã sao chép nội dung hóa đơn!', 'success');
  } catch (e) {
    showToast('Đã chọn nội dung hóa đơn, hãy nhấn Sao chép', 'info');
  }
  document.body.removeChild(ta);
}

function isAutoPrintEnabled() {
  return localStorage.getItem('pos_auto_print_enabled') === 'true';
}

function toggleAutoPrintSetting(enabled) {
  localStorage.setItem('pos_auto_print_enabled', enabled ? 'true' : 'false');
  updateAutoPrintUI();
  if (enabled) {
    showToast('Đã BẬT tự động in khi có đơn từ điện thoại!', 'success');
  } else {
    showToast('Đã TẮT tự động in (Không mở File Explorer & không lưu file)', 'info');
  }
}

function updateAutoPrintUI() {
  const isEnabled = isAutoPrintEnabled();
  const toggle = document.getElementById('toggleAutoPrintSwitch');
  if (toggle) toggle.checked = isEnabled;
  const hint = document.getElementById('autoPrintHintText');
  if (hint) {
    if (isEnabled) {
      hint.innerHTML = '🟢 <strong>Đang BẬT</strong>: Máy tính sẽ tự động nhả giấy in khi có đơn từ điện thoại. <em>(Chỉ dùng khi đã cắm máy in bill thật)</em>.';
      hint.className = 'text-[10px] leading-relaxed text-emerald-800 bg-emerald-50 p-2 rounded-xl border border-emerald-200';
    } else {
      hint.innerHTML = '⚪ <strong>Đang TẮT</strong>: Máy tính chỉ báo chuông & cập nhật bàn, <strong>không mở File Explorer và không lưu file bill</strong>. Hãy BẬT khi quán đã cắm máy in hóa đơn nhiệt thật.';
      hint.className = 'text-[10px] leading-relaxed text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-200';
    }
  }
}

function openPrinterModal() {
  updateAutoPrintUI();
  document.getElementById('printerModal')?.classList.remove('hidden');
}

function closePrinterModal() {
  document.getElementById('printerModal')?.classList.add('hidden');
}

function testPrintSample() {
  closePrinterModal();
  const sampleOrder = {
    order_code: 'HD-MAU-01',
    created_at: new Date().toISOString(),
    table_name: 'Bàn 5',
    source: 'taicho',
    cashier_name: '.',
    payment_method: 'cash',
    subtotal: 55000,
    discount: 0,
    total: 55000,
    items: [
      { product_name: 'Bún mắm cá tươi', quantity: 1, price: 55000, total: 55000 }
    ]
  };
  printReceipt(sampleOrder);
}
