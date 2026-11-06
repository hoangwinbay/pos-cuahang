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

function clearOfflineQueueForTable(tableName) {
  try {
    const queue = getOfflineQueue();
    const cleanTarget = (tableName || '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
    const filtered = queue.filter(q => {
      const qClean = (q.tableName || '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
      return qClean !== cleanTarget && (q.tableName || '') !== tableName;
    });
    saveOfflineQueue(filtered);
  } catch (e) {}
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
      const myDevId = typeof getDeviceId === 'function' ? getDeviceId() : null;
      const staffName = (state.currentUser && state.currentUser.name) || (state.user && state.user.name) || localStorage.getItem('pos_staff_name') || 'Nhân viên';

      await api('/api/tables/order', {
        method: 'POST',
        body: JSON.stringify({
          table_name: tableName,
          order_data: orderData,
          sender_device_id: myDevId,
          sender_name: staffName,
          action: 'sync_dishes',
          is_confirmed: false, // Thêm/bớt món thì CHƯA PHẢI XÁC NHẬN ĐƠN
          trigger_print: false // TUYỆT ĐỐI KHÔNG IN KHI ĐANG ĐỒNG BỘ MÓN / BẤM CỘNG MÓN
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
    syncDebounceTimers[tableName] = setTimeout(doSync, 120);
  }
}

async function deleteTableOrderOnServer(tableName) {
  try {
    clearOfflineQueueForTable(tableName);
    await api('/api/tables/order/' + encodeURIComponent(tableName), {
      method: 'DELETE'
    });
  } catch (e) {
    console.warn('Xóa bàn trên server thất bại:', e);
  }
}

async function fetchAndApplyTableSync(silent = false) {
  // Tránh gọi sync định kỳ nếu chưa có token để không sinh lỗi 401
  const hasToken = !!((state && state.token) || (typeof localStorage !== 'undefined' && localStorage.getItem('pos_token')));
  if (!hasToken) {
    return;
  }

  try {
    const data = await api('/api/tables/sync');
    if (data && data.tables) {
      state.tableList = data.tables;
      localStorage.setItem('pos_table_list', JSON.stringify(state.tableList));
    }
    if (data && data.tableOrders !== undefined) {
      applyIncomingTableOrders(data.tableOrders);
    }
    updateSyncIndicator(true);
  } catch (err) {
    if (!silent) console.warn('Lỗi lấy dữ liệu sync bàn:', err);
    updateSyncIndicator(false);
  }
}

function applyIncomingTableOrders(newTableOrders) {
  const incoming = newTableOrders || {};
  const currentLocal = state.tableOrders || {};

  // Dữ liệu từ Server là nguồn chuẩn duy nhất (Source of Truth)
  const mergedOrders = { ...incoming };
  const currentTable = state.currentTable;
  const isActivelyEditingCurrentTable = (
    state.activeScreen === 'order' &&
    currentTable &&
    (syncDebounceTimers[currentTable] || (Date.now() - (window._lastDishTapTime || 0) < 3500))
  );

  // Chỉ bảo lưu bàn hiện tại nếu người dùng tại thiết bị này đang trực tiếp bấm thêm/bớt món trên màn hình gọi món
  if (isActivelyEditingCurrentTable && currentLocal[currentTable]) {
    mergedOrders[currentTable] = currentLocal[currentTable];
  }

  state.tableOrders = mergedOrders;
  localStorage.setItem('pos_table_orders', JSON.stringify(state.tableOrders));

  if (state.activeScreen === 'tables') {
    renderTableGrid();
  } else if (state.activeScreen === 'order') {
    // Không gián đoạn DOM khi người dùng đang trực tiếp bấm thêm/bớt món
    if (!isActivelyEditingCurrentTable) {
      renderGroupedDishList();
      updateTableBottomBar();
    }
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
    const token = (state && state.token) || (typeof localStorage !== 'undefined' ? localStorage.getItem('pos_token') : '') || '';
    const qs = token ? `?token=${encodeURIComponent(token)}` : '';
    const sseUrl = (base ? `${base}/api/tables/events` : '/api/tables/events') + qs;
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
        // TỰ ĐỘNG IN KHI CÓ BÀN ĐƯỢC XÁC NHẬN (CHỈ IN KHI ĐÃ BẤM XÁC NHẬN - BÀN HIỆN XANH, KHÔNG IN KHI BẤM CỘNG MÓN)
        const myDevId = typeof getDeviceId === 'function' ? getDeviceId() : null;
        const senderId = payload.sender_device_id || null;
        // Chỉ coi là thiết bị khác nếu CẢ HAI đều có ID VÀ KHÁC NHAU (tránh nhận nhầm chính thiết bị này)
        const isFromOtherDevice = Boolean(myDevId && senderId && senderId !== myDevId);

        if (isPrintStationDevice()) {
          // 1. Trường hợp có bàn được XÁC NHẬN đặt món từ thiết bị khác
          // CHÚ Ý: CHỈ IN KHI type = 'table_order_confirmed', action = 'confirm_order', VÀ trigger_print = true
          // TUYỆT ĐỐI KHÔNG IN KHI CẬP NHẬT MÓN, BẤM CỘNG/TRỪ MÓN (table_order_updated)
          if (payload.type === 'table_order_confirmed' && payload.action === 'confirm_order' && payload.trigger_print === true) {
            if (isFromOtherDevice && payload.table_name && payload.order_data) {
              console.log('Trạm in quầy nhận đơn xác nhận từ thiết bị khác:', payload.table_name);
              playOrderNotificationSound();
              const senderTag = payload.sender_name ? ` (${payload.sender_name})` : '';
              showToast(`🔔 Bàn ${payload.table_name} vừa xác nhận đặt món${senderTag}!`, 'success');

              const printOrder = formatTableOrderForPrint(payload.table_name, payload.order_data);
              if (printOrder && printOrder.items && printOrder.items.length > 0) {
                window._explicitPrintAuthorized = true;
                try {
                  executeOrderPrint(printOrder, { isKitchen: true });
                } finally {
                  window._explicitPrintAuthorized = false;
                }
                showRemotePrintAlert(printOrder, payload.sender_name);
              }
            }
          }

          // 2. Trường hợp có bàn thanh toán thành công từ thiết bị khác
          if (payload.type === 'table_order_cleared' && payload.checkout_order) {
            if (isFromOtherDevice) {
              console.log('Trạm in quầy nhận lệnh in thanh toán từ thiết bị khác:', payload.checkout_order.table_name);
              playOrderNotificationSound();
              showToast(`🔔 Bàn ${payload.checkout_order.table_name} đã thanh toán! Đang in hóa đơn...`, 'success');
              window._explicitPrintAuthorized = true;
              try {
                executeOrderPrint(payload.checkout_order, { isCheckout: true });
              } finally {
                window._explicitPrintAuthorized = false;
              }
              showRemotePrintAlert(payload.checkout_order, payload.sender_name);
            }
          }

          // 3. Nhận yêu cầu in thủ công (In bill tạm tính / in lại)
          if (payload.type === 'print_job' && payload.print_order) {
            if (isFromOtherDevice) {
              console.log('Trạm in quầy nhận yêu cầu in thủ công:', payload.print_order);
              playOrderNotificationSound();
              const senderTag = payload.sender_name ? ` (${payload.sender_name})` : '';
              showToast(`🔔 Yêu cầu in từ ${payload.sender_name || 'nhân viên'}: ${payload.print_order.table_name || 'Bàn'}${senderTag}!`, 'success');
              executeOrderPrint(payload.print_order, { isManual: true });
              showRemotePrintAlert(payload.print_order, payload.sender_name);
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
  const hasToken = !!((state && state.token) || (typeof localStorage !== 'undefined' && localStorage.getItem('pos_token')));
  if (hasToken) {
    fetchAndApplyTableSync();
    connectTableEventSource();
  }

  // Polling dự phòng định kỳ mỗi 2.5 giây cho thiết bị ĐÃ ĐĂNG NHẬP
  setInterval(() => {
    const isAuthed = !!((state && state.token) || (typeof localStorage !== 'undefined' && localStorage.getItem('pos_token')));
    if (isAuthed) {
      fetchAndApplyTableSync(true);
    }
  }, 2500);

  // Khi mở lại tab hoặc mở khóa màn hình điện thoại
  document.addEventListener('visibilitychange', () => {
    const isAuthed = !!((state && state.token) || (typeof localStorage !== 'undefined' && localStorage.getItem('pos_token')));
    if (isAuthed) {
      fetchAndApplyTableSync();
      if (!tableEventSource || tableEventSource.readyState === EventSource.CLOSED) {
        connectTableEventSource();
      }
    }
  });
}

// Khởi tạo POS
async function initPos() {
  await Promise.all([loadPosCategories(), loadPosProducts()]);
  setupPosSearchListeners();
  showTableFloor();
  initRealtimeTableSync();
  if (typeof updateDrawerPrinterBadge === 'function') updateDrawerPrinterBadge();
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
  const custom = prompt('Nhập tên bàn mới:', '');
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
    const isConfirmed = order && Array.isArray(order.items) && order.items.length > 0 && Boolean(order.confirmed || order.hasPrintedKitchen);
    if (filter === 'occupied') return isConfirmed;
    if (filter === 'empty') return !isConfirmed;
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
    const hasItems = order && Array.isArray(order.items) && order.items.length > 0;
    const isConfirmed = hasItems && Boolean(order.confirmed || order.hasPrintedKitchen);

    if (isConfirmed) {
      // BÀN ĐÃ XÁC NHẬN (CÓ KHÁCH): Màu Xanh Ngọc (Tại chỗ - HIỆN XANH) hoặc Màu Vàng Cam (Mang về)
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
    } else if (hasItems) {
      // BÀN CHƯA XÁC NHẬN (ĐANG CHỌN MÓN / DRAFT): Viền nét đứt cam nhạt, KHÔNG HIỆN XANH
      const totalAmount = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const totalCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
      const isMangVe = order.source === 'mangve';

      return `
        <div 
          onclick="openTableOrder('${tableName}')"
          class="table-card bg-amber-50/90 border-2 border-dashed border-amber-400 text-slate-800 rounded-2xl p-2.5 sm:p-3 flex flex-col justify-between shadow-2xs cursor-pointer aspect-square active:scale-95 transition-all hover:bg-amber-100/60"
        >
          <div class="flex items-center justify-between">
            <span class="font-black text-sm sm:text-base tracking-tight text-slate-800">${tableName}</span>
            <span class="text-[9px] font-bold bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded shadow-2xs">CHƯA XÁC NHẬN</span>
          </div>

          <div class="my-auto text-center py-1">
            <div class="text-sm sm:text-base font-black text-amber-950 leading-tight">
              ${formatMoney(totalAmount)}
            </div>
            <div class="text-xs sm:text-sm text-amber-800 font-bold mt-0.5">
              ${totalCount} Món (Đang chọn)
            </div>
          </div>

          <div class="flex items-center justify-between text-[11px] sm:text-xs text-amber-700 font-medium">
            <span>${isMangVe ? 'Mang về' : 'Tại chỗ'}</span>
            <span class="text-amber-600 font-bold italic">Chưa xác nhận</span>
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
      items: [],
      confirmed: false,
      hasPrintedKitchen: false
    };
  } else if (!state.tableOrders[tableName].source) {
    state.tableOrders[tableName].source = state.currentSource || 'taicho';
  }

  // Cập nhật nguồn hiện tại theo bàn này
  state.currentSource = state.tableOrders[tableName].source;

  // Đồng bộ ô ghi chú trên thanh giỏ hàng theo bàn mới (tránh dính ghi chú bàn cũ)
  syncCartNoteToCurrentTable();

  updateOrderScreenHeader();
  renderOrderCategoriesPills();
  renderGroupedDishList();
  updateTableBottomBar();
}

// Đồng bộ giá trị ô ghi chú (orderNoteInput) + badge theo bàn hiện tại
function syncCartNoteToCurrentTable() {
  const noteInput = document.getElementById('orderNoteInput');
  const noteBox = document.getElementById('orderNoteBox');
  // Đóng khung nhập ghi chú khi chuyển bàn (tránh hiện ghi chú bàn cũ)
  if (noteBox) noteBox.classList.add('hidden');
  if (noteInput) {
    noteInput.value = state.tableOrders[state.currentTable]?.note || '';
  }
  if (typeof updateOrderNoteDisplay === 'function') {
    updateOrderNoteDisplay(state.tableOrders[state.currentTable]?.note || '');
  }
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

  // Nếu bàn đã có món, đồng bộ ngay sang các máy khác (KHÔNG IN)
  if (state.tableOrders[currentTable].items && state.tableOrders[currentTable].items.length > 0) {
    const myDevId = typeof getDeviceId === 'function' ? getDeviceId() : null;
    const staffName = (state.currentUser && state.currentUser.name) || (state.user && state.user.name) || localStorage.getItem('pos_staff_name') || 'Nhân viên';
    api('/api/tables/order', {
      method: 'POST',
      body: JSON.stringify({
        table_name: currentTable,
        order_data: state.tableOrders[currentTable],
        sender_device_id: myDevId,
        sender_name: staffName,
        is_confirmed: Boolean(state.tableOrders[currentTable].confirmed || state.tableOrders[currentTable].hasPrintedKitchen),
        trigger_print: false,
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
          <div class="flex items-center justify-between shrink-0 bg-white border border-slate-200 rounded-xl p-1 min-w-[112px] sm:min-w-[124px] shadow-2xs">
            <button 
              type="button"
              onclick="event.stopPropagation(); changeDishQty(${p.id}, -1)" 
              ondblclick="event.stopPropagation(); event.preventDefault();"
              class="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700 hover:bg-slate-200 active:scale-90 text-sm font-bold select-none cursor-pointer transition-all"
              title="Giảm 1"
            >
              <i class="fa-solid fa-minus text-xs pointer-events-none"></i>
            </button>

            <span id="dish-qty-${p.id}" class="w-8 text-center text-sm sm:text-base font-extrabold text-slate-900 select-none">
              ${currentQty}
            </span>

            <button 
              type="button"
              onclick="event.stopPropagation(); changeDishQty(${p.id}, 1)" 
              ondblclick="event.stopPropagation(); event.preventDefault();"
              class="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 active:scale-90 text-sm font-bold select-none cursor-pointer transition-all shadow-xs"
              title="Thêm 1"
            >
              <i class="fa-solid fa-plus text-xs pointer-events-none"></i>
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
  window._lastDishTapTime = Date.now();

  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  const currentTable = state.currentTable;
  if (!state.tableOrders[currentTable]) {
    state.tableOrders[currentTable] = {
      source: state.currentSource,
      startTime: Date.now(),
      note: '',
      items: [],
      confirmed: false,
      hasPrintedKitchen: false
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

  // Khi bấm thêm/bớt món, bàn có thay đổi chưa xác nhận (cần bấm "Xác Nhận" mới in báo bếp)
  tableOrder.confirmed = false;

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
            <button type="button" onclick="event.stopPropagation(); changeDishQty(${item.id}, -1)" ondblclick="event.stopPropagation(); event.preventDefault();" class="w-7 h-7 rounded-md flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-90 text-xs">
              <i class="fa-solid fa-minus text-[10px] pointer-events-none"></i>
            </button>
            <span class="w-7 text-center text-xs font-bold text-slate-800">${item.quantity}</span>
            <button type="button" onclick="event.stopPropagation(); changeDishQty(${item.id}, 1)" ondblclick="event.stopPropagation(); event.preventDefault();" class="w-7 h-7 rounded-md flex items-center justify-center text-emerald-600 hover:bg-emerald-50 active:scale-90 text-xs">
              <i class="fa-solid fa-plus text-[10px] pointer-events-none"></i>
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

async function clearAllTables() {
  if (!confirm('Bạn có chắc chắn muốn LÀM TRỐNG TOÀN BỘ CÁC BÀN đang mở?')) return;
  try {
    showToast('Đang làm trống tất cả các bàn...', 'info');
    await api('/api/tables/orders/clear-all', {
      method: 'DELETE'
    });
    state.tableOrders = {};
    localStorage.setItem('pos_table_orders', JSON.stringify({}));
    localStorage.removeItem('pos_offline_orders');
    renderTableGrid();
    if (state.activeScreen === 'order') {
      showTableFloor();
    }
    showToast('Đã làm trống toàn bộ các bàn thành công!', 'success');
  } catch (err) {
    showToast('Lỗi khi làm trống bàn: ' + err.message, 'error');
  }
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
  tableOrder.confirmed = true;
  tableOrder.confirmedAt = new Date().toISOString();

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

  // 2. KÍCH HOẠT IN PHIẾU BÁO BẾP:
  if (isPrintStationDevice()) {
    // Trạm quầy: Tự động in theo chế độ Chrome Windows hoặc RawBT Android
    window._explicitPrintAuthorized = true;
    try {
      executeOrderPrint(orderForPrint, { isKitchen: true });
    } finally {
      window._explicitPrintAuthorized = false;
    }
  } else if (bluetoothCharacteristic) {
    printEscPosBluetooth(orderForPrint);
  } else {
    // Điện thoại nhân viên: Không gọi in cục bộ
    showToast(`Đã gửi đơn ${currentTable} thành công!`, 'success');
  }

  // 3. ĐỒNG BỘ NỀN LÊN SERVER (NON-BLOCKING) VỚI CỜ XÁC NHẬN ĐƠN (TRIGGER PRINT TẠI QUẦY)
  const myDevId = typeof getDeviceId === 'function' ? getDeviceId() : null;
  const staffName = (state.currentUser && state.currentUser.name) || (state.user && state.user.name) || localStorage.getItem('pos_staff_name') || 'Nhân viên';

  api('/api/tables/order', {
    method: 'POST',
    body: JSON.stringify({
      table_name: currentTable,
      order_data: tableOrder,
      sender_device_id: myDevId,
      sender_name: staffName,
      check_conflict: true,
      is_confirmed: true,
      action: 'confirm_order',
      trigger_print: true
    })
  }).catch(err => {
    if (err.status === 409 || err.data?.conflict) {
      showTableConflictModal(err.data || { table_name: currentTable, incoming_order: tableOrder });
    } else {
      console.warn('Mất kết nối mạng khi in bếp, lưu hàng đợi offline:', err);
      queueOfflineOrder(currentTable, tableOrder);
    }
  });

  // 4. CHUYỂN VỀ SƠ ĐỒ BÀN (LÚC NÀY BÀN HIỆN XANH)
  showToast(`Đã xác nhận món ${currentTable}!`, 'success');
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
    if (isPrintStationDevice()) {
      window._explicitPrintAuthorized = true;
      try {
        executeOrderPrint(orderForPrint, { isCheckout: true });
      } finally {
        window._explicitPrintAuthorized = false;
      }
    } else if (bluetoothCharacteristic) {
      printEscPosBluetooth(orderForPrint);
    }

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
  if (isRawBtStation()) {
    callRawBtPrint(orderForPrint);
  } else if (bluetoothCharacteristic) {
    printEscPosBluetooth(orderForPrint);
  }

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

  // Nếu bàn có món nhưng CHƯA TỪNG in gửi bếp / chưa xác nhận:
  if (order && order.items && order.items.length > 0 && !order.hasPrintedKitchen && !order.confirmed) {
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
      cash_given: totalAmount,
      sender_device_id: typeof getDeviceId === 'function' ? getDeviceId() : null,
      sender_name: state.currentUser ? state.currentUser.name : (localStorage.getItem('pos_staff_name') || 'Nhân viên')
    };

    const newOrder = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    // In hóa đơn thanh toán cho khách
    const orderForPrint = {
      order_code: newOrder?.order?.order_code || tableOrder?.orderCode || `BILL-${Date.now().toString().slice(-4)}`,
      created_at: new Date().toISOString(),
      table_name: currentTable,
      source: source,
      cashier_name: state.currentUser ? state.currentUser.name : 'Chủ Quán',
      note: note,
      payment_method: 'cash',
      subtotal: totalAmount,
      discount: 0,
      total: totalAmount,
      items: (tableOrder.items || []).map(item => ({
        product_name: item.name,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity
      }))
    };
    if (isPrintStationDevice()) {
      window._explicitPrintAuthorized = true;
      try {
        executeOrderPrint(orderForPrint, { isCheckout: true });
      } finally {
        window._explicitPrintAuthorized = false;
      }
    } else if (bluetoothCharacteristic) {
      printEscPosBluetooth(orderForPrint);
    }

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

  if (isPrintStationDevice()) {
    executeOrderPrint(orderForPrint, { isManual: true });
  } else if (bluetoothCharacteristic) {
    printEscPosBluetooth(orderForPrint);
  } else {
    sendPrintJobToServer(orderForPrint);
  }
}

// Compatibility stubs
function setPaymentMethod() {}
function setupVietQRDisplay() {}

// =============================================================
// IN HÓA ĐƠN NHIỆT / PHIẾU BÁO BẾP (80mm / 58mm & BLUETOOTH)
// =============================================================
function formatReceiptNum(val) {
  const num = Math.round(Number(val) || 0);
  return num.toLocaleString('en-US').replace(/,/g, '.');
}

function generateReceiptHtml(order, options = {}) {
  const storeName = state.settings.store_name || 'Bún mắm miền Tây';
  const storeAddress = state.settings.store_address || '324 Bạch Mai';
  const footerNotice = state.settings.receipt_footer || 'Quý khách vui lòng mang phiếu này ra quầy khi thanh toán';

  const isRaster = Boolean(options.isRaster);
  const is58mm = Boolean(options.is58mm);

  // Kích thước font chữ tự động tương thích:
  // Nếu là in raster 576 dots (80mm) -> Dùng font to đậm rõ nét, tràn viền giấy nhiệt
  // Nếu là in laptop qua hộp thoại in Chrome -> Dùng kích thước CSS chuẩn như mẫu gốc
  const titleSize = isRaster ? (is58mm ? '26px' : '36px') : '18px';
  const tableBoxSize = isRaster ? (is58mm ? '34px' : '48px') : '23px';
  const tableBoxBorder = isRaster ? (is58mm ? '3px dashed #000' : '4px dashed #000') : '2px dashed #000';
  const tableBoxPadding = isRaster ? '10px 4px' : '6px 4px';
  const metaSize = isRaster ? (is58mm ? '18px' : '24px') : '13px';
  const thSize = isRaster ? (is58mm ? '18px' : '24px') : '13px';
  const itemSize = isRaster ? (is58mm ? '20px' : '28px') : '13.5px';
  const summarySize = isRaster ? (is58mm ? '20px' : '28px') : '13.5px';
  const totalSize = isRaster ? (is58mm ? '30px' : '44px') : '16px';
  const paymentSize = isRaster ? (is58mm ? '18px' : '24px') : '13px';
  const storeNameSize = isRaster ? (is58mm ? '22px' : '30px') : '15px';
  const storeAddrSize = isRaster ? (is58mm ? '17px' : '22px') : '12.5px';
  const footerNoticeSize = isRaster ? (is58mm ? '17px' : '22px') : '12.5px';
  const paddingCell = isRaster ? '9px 4px' : '5px 2px';
  const paddingCellSub = isRaster ? '9px 2px' : '5px 1px';

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
        <td style="text-align: left; vertical-align: top; padding: ${paddingCell}; word-break: break-word; font-size: ${itemSize};">${itemName}</td>
        <td style="text-align: center; vertical-align: top; padding: ${paddingCellSub}; font-size: ${itemSize};">${qty}</td>
        <td style="text-align: right; vertical-align: top; padding: ${paddingCellSub}; white-space: nowrap; font-size: ${itemSize};">${formatReceiptNum(price)}</td>
        <td style="text-align: right; vertical-align: top; padding: ${paddingCellSub}; white-space: nowrap; font-size: ${itemSize};">${formatReceiptNum(total)}</td>
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
    <div class="receipt-title" style="font-size: ${titleSize}; font-weight: 900; text-align: center; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px;">
      HÓA ĐƠN THANH TOÁN
    </div>

    <div class="receipt-meta" style="margin-bottom: 6px; line-height: 1.4;">
      <div style="border: ${tableBoxBorder}; padding: ${tableBoxPadding}; margin: 5px 0 7px 0; text-align: center; border-radius: 4px;">
        <div style="font-size: ${tableBoxSize}; font-weight: 900; letter-spacing: 0.5px; line-height: 1.25;">
          ${tableDisplay} - ${sourceLabel}
        </div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: ${metaSize};">
        <span><strong>Giờ vào:</strong> ${timeStr}</span>
        <span><strong>Ngày:</strong> ${dateStr}</span>
      </div>
      ${order.note ? `<div style="margin-top: 4px; font-size: ${metaSize};"><strong>Ghi chú:</strong> ${order.note}</div>` : ''}
    </div>

    <table class="receipt-table" style="width: 100%; border-collapse: collapse; margin: 6px 0;">
      <thead>
        <tr style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; font-size: ${thSize};">
          <th style="width: 48%; text-align: left; padding: ${paddingCell}; border-right: 1px solid #000; font-weight: bold;">Tên món</th>
          <th style="width: 14%; text-align: center; padding: ${paddingCellSub}; border-right: 1px solid #000; font-weight: bold;">SL</th>
          <th style="width: 19%; text-align: right; padding: ${paddingCellSub}; border-right: 1px solid #000; font-weight: bold;">Đơn giá</th>
          <th style="width: 19%; text-align: right; padding: ${paddingCellSub}; font-weight: bold;">Thành tiền</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div class="receipt-divider" style="border-bottom: 1px dashed #000; margin: 5px 0 7px 0;"></div>

    <table class="receipt-summary" style="width: 100%; border-collapse: collapse; font-size: ${summarySize}; margin-top: 2px; font-weight: bold;">
      <tr style="font-weight: bold;">
        <td style="padding: 3px 0; font-weight: bold;">Thành tiền:</td>
        <td style="padding: 3px 0; text-align: right; font-weight: bold;">${formatReceiptNum(subtotal)} đ</td>
      </tr>
      ${discount > 0 ? `
      <tr style="font-weight: bold;">
        <td style="padding: 3px 0; font-weight: bold;">Giảm giá:</td>
        <td style="padding: 3px 0; text-align: right; font-weight: bold;">-${formatReceiptNum(discount)} đ</td>
      </tr>
      ` : ''}
      <tr class="receipt-total" style="font-size: ${totalSize}; font-weight: 900;">
        <td style="padding: 5px 0; font-weight: 900;">Tổng tiền:</td>
        <td style="padding: 5px 0; text-align: right; font-weight: 900;">${formatReceiptNum(finalTotal)} đ</td>
      </tr>
      <tr class="receipt-payment-row" style="font-weight: normal; font-size: ${paymentSize}; color: #000000;">
        <td style="padding: 3px 0; font-weight: normal; font-size: ${paymentSize}; color: #000000;">+ ${paymentMethodLabel}</td>
        <td style="padding: 3px 0; text-align: right; font-weight: normal; font-size: ${paymentSize}; color: #000000;">${formatReceiptNum(finalTotal)} đ</td>
      </tr>
    </table>

    <div class="receipt-footer" style="text-align: center; margin-top: 16px; font-size: ${storeAddrSize}; line-height: 1.45;">
      <div style="font-weight: bold; font-size: ${storeNameSize}; margin-bottom: 3px;">${storeName}</div>
      <div style="margin-bottom: 8px;">Địa chỉ: ${storeAddress}</div>
      <div style="margin-top: 6px; font-weight: bold; font-size: ${footerNoticeSize};">${footerNotice}</div>
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

function formatLineColumns(left, right, width = 42, keepAccents = true) {
  const l = keepAccents ? String(left).normalize('NFC') : removeVietnameseAccents(String(left));
  const r = keepAccents ? String(right).normalize('NFC') : removeVietnameseAccents(String(right));
  const spaceCount = Math.max(1, width - l.length - r.length);
  return l + ' '.repeat(spaceCount) + r + '\n';
}

function wrapTextLines(text, maxChars = 38) {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!w) continue;
    if ((cur ? cur + ' ' + w : w).length <= maxChars) {
      cur = cur ? cur + ' ' + w : w;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function formatBoxedTitle(text, width = 42, keepAccents = true) {
  const clean = keepAccents ? String(text).normalize('NFC').trim() : removeVietnameseAccents(String(text)).trim();
  const padLeft = Math.max(0, Math.floor((width - clean.length) / 2));
  const padRight = Math.max(0, width - clean.length - padLeft);
  const border = '-'.repeat(width) + '\n';
  const middle = ' '.repeat(padLeft) + clean + ' '.repeat(padRight) + '\n';
  return { border, middle, full: border + middle + border };
}

function wrapItemName(name, maxLen) {
  const words = String(name).trim().split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!w) continue;
    if (!cur) {
      cur = w;
    } else if ((cur + ' ' + w).length <= maxLen) {
      cur += ' ' + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function formatItemRow4Col(name, qty, price, total, width = 42, keepAccents = true) {
  const cleanName = keepAccents ? String(name).normalize('NFC').trim() : removeVietnameseAccents(String(name)).trim();
  const qtyStr = String(qty);
  const priceStr = formatReceiptNum(price);
  const totalStr = formatReceiptNum(total);

  const nameWidth = width === 32 ? 12 : 17;
  const qtyWidth = 3;
  const priceWidth = width === 32 ? 7 : 9;
  const totalWidth = width === 32 ? 7 : 10;

  const wrapped = wrapItemName(cleanName, nameWidth);
  const firstPart = (wrapped[0] || '').padEnd(nameWidth, ' ');
  const colQty = qtyStr.padStart(qtyWidth, ' ');
  const colPrice = priceStr.padStart(priceWidth, ' ');
  const colTotal = totalStr.padStart(totalWidth, ' ');

  const lines = [];
  lines.push(`${firstPart} ${colQty} ${colPrice} ${colTotal}`);
  for (let i = 1; i < wrapped.length; i++) {
    lines.push(`  ${wrapped[i]}`);
  }
  return lines.join('\n') + '\n';
}

function generateReceiptHtmlFullDoc(order) {
  const bodyHtml = generateReceiptHtml(order);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Hóa Đơn</title>
  <style>
    @page { margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 76mm;
      max-width: 76mm;
      margin: 0 auto;
      padding: 3mm 1mm;
      font-family: 'Courier New', Courier, monospace, sans-serif;
      font-size: 13px;
      line-height: 1.35;
      color: #000;
      background: #fff;
    }
    table { width: 100%; border-collapse: collapse; }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
}

function htmlToBase64(html) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(html);
  return uint8ArrayToBase64(bytes);
}

function generateEscPosPayload(order) {
  const printAccentsMode = localStorage.getItem('pos_print_accents') || '0';
  const withAccents = printAccentsMode !== '2';
  const sanitize = withAccents ? (s) => (s ? String(s).normalize('NFC') : '') : removeVietnameseAccents;

  const rawStoreName = state.settings.store_name || 'Bún mắm miền Tây';
  const rawStoreAddress = state.settings.store_address || '324 Bạch Mai';
  const rawFooterNotice = state.settings.receipt_footer || 'Quý khách vui lòng mang phiếu này ra quầy khi thanh toán';

  const storeName = sanitize(rawStoreName);
  const storeAddress = sanitize(rawStoreAddress);
  const footerNotice = sanitize(rawFooterNotice);

  const paperWidth = localStorage.getItem('pos_paper_width') || '80mm';
  const lineWidth = paperWidth === '58mm' ? 32 : 42;
  const divider = '-'.repeat(lineWidth) + '\n';

  let orderSource = order.source;
  if (!orderSource && order.table_name && state.tableOrders && state.tableOrders[order.table_name]) {
    orderSource = state.tableOrders[order.table_name].source;
  }
  if (!orderSource) orderSource = state.currentSource || 'taicho';
  const isMangVe = (orderSource === 'mangve') || 
                   (order.order_type && order.order_type.toLowerCase().includes('mang')) ||
                   (order.table_name && order.table_name.toLowerCase().includes('mang'));
  const sourceLabel = isMangVe ? (withAccents ? 'MANG VỀ' : 'MANG VE') : (withAccents ? 'TẠI CHỖ' : 'TAI CHO');

  let rawTable = String(order.table_name || 'Bàn 1').trim();
  let tableDisplay = rawTable;
  if (!tableDisplay.toLowerCase().startsWith('bàn') && !tableDisplay.toLowerCase().startsWith('ban') && !tableDisplay.toLowerCase().startsWith('mang')) {
    tableDisplay = (withAccents ? 'Bàn ' : 'Ban ') + tableDisplay;
  }
  tableDisplay = sanitize(tableDisplay);

  const createdAt = order.created_at ? new Date(order.created_at) : new Date();
  const dateStr = String(createdAt.getDate()).padStart(2, '0') + '/' + 
                  String(createdAt.getMonth() + 1).padStart(2, '0') + '/' + 
                  createdAt.getFullYear();
  const timeStr = String(createdAt.getHours()).padStart(2, '0') + ':' + 
                  String(createdAt.getMinutes()).padStart(2, '0');

  let content = '\x1B\x40'; // Reset / Khởi tạo máy in
  content += '\x1B\x61\x01'; // Canh giữa
  content += '\x1B\x45\x01\x1D\x21\x01' + (withAccents ? 'HÓA ĐƠN THANH TOÁN\n\n' : 'HOA DON THANH TOAN\n\n') + '\x1D\x21\x00\x1B\x45\x00';
  
  // Khung viền bàn ăn chuẩn như mẫu Windows (Đường kẻ đứt trên dưới, chữ bàn to đậm gấp đôi)
  content += '\x1B\x61\x00'; // Canh trái để viền chuẩn
  const boxedInfo = formatBoxedTitle(`${tableDisplay} - ${sourceLabel}`, lineWidth, withAccents);
  content += boxedInfo.border;
  content += '\x1B\x45\x01\x1D\x21\x01'; // In đậm + Tăng chiều cao x2 cho tên bàn
  content += boxedInfo.middle;
  content += '\x1D\x21\x00\x1B\x45\x00'; // Tắt in đậm & reset kích thước
  content += boxedInfo.border;
  
  const labelTime = withAccents ? `Giờ vào: ${timeStr}` : `Gio vao: ${timeStr}`;
  const labelDate = withAccents ? `Ngày: ${dateStr}` : `Ngay: ${dateStr}`;
  content += formatLineColumns(labelTime, labelDate, lineWidth, withAccents);
  
  if (order.note) {
    const noteLines = wrapTextLines(sanitize(`Ghi chú: ${order.note}`), lineWidth);
    noteLines.forEach((nl) => {
      content += nl + '\n';
    });
  }

  // Tiêu đề 4 cột chuẩn theo đúng mẫu hóa đơn Windows
  content += divider;
  content += '\x1B\x45\x01'; // In đậm tiêu đề cột
  if (lineWidth === 32) {
    content += withAccents ? 'Tên món      SL Đơn giá  T.Tiền\n' : 'Ten mon      SL Don gia  T.Tien\n';
  } else {
    content += withAccents ? 'Tên món           SL   Đơn giá Thành tiền\n' : 'Ten mon           SL   Don gia Thanh tien\n';
  }
  content += '\x1B\x45\x00';
  content += divider;

  // In từng món theo đúng cấu trúc 4 cột (In đậm tên món để đọc rõ)
  (order.items || []).forEach((it) => {
    const qty = Number(it.quantity) || 1;
    const price = Number(it.price) || 0;
    const total = Number(it.total !== undefined ? it.total : price * qty);
    const itemName = sanitize(it.product_name || it.name || 'Món');
    content += '\x1B\x45\x01';
    content += formatItemRow4Col(itemName, qty, price, total, lineWidth, withAccents);
    content += '\x1B\x45\x00';
  });

  content += divider;
  const subtotal = Number(order.subtotal !== undefined ? order.subtotal : (order.total || 0));
  const discount = Number(order.discount || 0);
  const finalTotal = Number(order.total !== undefined ? order.total : (subtotal - discount));

  const labelSubtotal = withAccents ? 'Thành tiền:' : 'Thanh tien:';
  content += formatLineColumns(labelSubtotal, formatReceiptNum(subtotal) + (withAccents ? ' đ' : ' d'), lineWidth, withAccents);
  if (discount > 0) {
    const labelDiscount = withAccents ? 'Giảm giá:' : 'Giam gia:';
    content += formatLineColumns(labelDiscount, '-' + formatReceiptNum(discount) + (withAccents ? ' đ' : ' d'), lineWidth, withAccents);
  }
  // Tổng tiền: In đậm + Chữ cao gấp đôi (Double height)
  content += '\x1B\x45\x01\x1D\x21\x01';
  const labelTotal = withAccents ? 'Tổng tiền:' : 'Tong tien:';
  content += formatLineColumns(labelTotal, formatReceiptNum(finalTotal) + (withAccents ? ' đ' : ' d'), lineWidth, withAccents);
  content += '\x1D\x21\x00\x1B\x45\x00';

  const isChuyenKhoan = order.payment_method === 'transfer' || order.payment_method === 'bank' || order.payment_method === 'qr' || order.payment_method === 'chuyenkhoan';
  const payLabel = isChuyenKhoan 
    ? (withAccents ? '+ Thanh toán chuyển khoản' : '+ Thanh toan chuyen khoan')
    : (withAccents ? '+ Thanh toán tiền mặt' : '+ Thanh toan tien mat');
  content += formatLineColumns(payLabel, formatReceiptNum(finalTotal) + (withAccents ? ' đ' : ' d'), lineWidth, withAccents);

  content += divider;
  content += '\x1B\x61\x01'; // Canh giữa
  content += '\x1B\x45\x01' + storeName + '\x1B\x45\x00\n';
  
  // Tự động ngắt dòng địa chỉ nếu dài
  const labelAddr = withAccents ? 'Địa chỉ: ' : 'Dia chi: ';
  const addrLines = wrapTextLines(labelAddr + storeAddress, Math.max(26, lineWidth - 4));
  addrLines.forEach((al) => {
    content += al + '\n';
  });

  // Tự động ngắt dòng lời cảm ơn/thông báo chân trang
  const footerLines = wrapTextLines(footerNotice, Math.max(26, lineWidth - 4));
  footerLines.forEach((fl) => {
    content += fl + '\n';
  });

  // Cuộn giấy 3 dòng và CHỈ GỬI ĐÚNG 1 LỆNH CẮT DUY NHẤT
  content += '\n\n\n\x1D\x56\x01';

  return content;
}

function uint8ArrayToBase64(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

function generateEscPosBase64(order) {
  const content = generateEscPosPayload(order);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  return uint8ArrayToBase64(bytes);
}

function loadHtml2CanvasScript() {
  return new Promise((resolve, reject) => {
    if (typeof html2canvas !== 'undefined') return resolve();
    const s = document.createElement('script');
    s.src = 'js/html2canvas.min.js';
    s.onload = () => resolve();
    s.onerror = () => {
      const cdn = document.createElement('script');
      cdn.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      cdn.onload = () => resolve();
      cdn.onerror = (e) => reject(new Error('Không thể tải thư viện kết xuất ảnh html2canvas'));
      document.head.appendChild(cdn);
    };
    document.head.appendChild(s);
  });
}

function dispatchRawBtIntent(targetUrl, fallbackUrl) {
  try {
    const a = document.createElement('a');
    a.href = targetUrl;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { if (a.parentNode) a.parentNode.removeChild(a); } catch (e) {}
    }, 2000);
  } catch (err) {
    console.warn('dispatchRawBtIntent anchor click error:', err);
    if (fallbackUrl) {
      window.location.href = fallbackUrl;
    } else {
      window.location.href = targetUrl;
    }
  }
}

function convertCanvasToEscPosRaster(canvas, targetDots = 576) {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const widthInBytes = Math.ceil(targetDots / 8);
  const chunkHeight = 120;
  const chunks = [];

  // Khởi tạo máy in và đặt giãn dòng = 0 để in các khối raster liền mạch
  chunks.push(new Uint8Array([0x1B, 0x40]));
  chunks.push(new Uint8Array([0x1B, 0x33, 0x00]));

  for (let startY = 0; startY < height; startY += chunkHeight) {
    const currentH = Math.min(chunkHeight, height - startY);
    const header = [
      0x1D, 0x76, 0x30, 0x00, // Lệnh ESC/POS GS v 0 0: In raster bit image
      widthInBytes & 0xFF,
      (widthInBytes >> 8) & 0xFF,
      currentH & 0xFF,
      (currentH >> 8) & 0xFF
    ];
    const buf = new Uint8Array(header.length + (widthInBytes * currentH));
    buf.set(header, 0);
    let offset = header.length;

    for (let y = 0; y < currentH; y++) {
      const realY = startY + y;
      for (let b = 0; b < widthInBytes; b++) {
        let byteVal = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = b * 8 + bit;
          if (x < width) {
            const idx = (realY * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const bVal = data[idx + 2];
            const a = data[idx + 3];
            // Điểm tối hơn 190 (chữ, đường kẻ hoặc khung nét đứt) -> kim in nhiệt đen
            const lum = a < 128 ? 255 : (0.299 * r + 0.587 * g + 0.114 * bVal);
            if (lum < 190) {
              byteVal |= (1 << (7 - bit));
            }
          }
        }
        buf[offset++] = byteVal;
      }
    }
    chunks.push(buf);
  }

  // Khôi phục khoảng cách dòng, cuộn giấy 4 dòng và kích hoạt ĐÚNG 1 LỆNH CẮT DUY NHẤT
  const footer = new Uint8Array([
    0x1B, 0x32, // Trả lại khoảng cách dòng mặc định
    0x0A, 0x0A, 0x0A, 0x0A, // Cuộn 4 dòng
    0x1B, 0x64, 0x03, // ESC d 3: Cuộn giấy qua mép dao cắt
    0x1D, 0x56, 0x01 // GS V 1: Lệnh cắt giấy bán phần (1 lần duy nhất)
  ]);
  chunks.push(footer);

  let totalLen = 0;
  for (let i = 0; i < chunks.length; i++) totalLen += chunks[i].length;
  const merged = new Uint8Array(totalLen);
  let pos = 0;
  for (let i = 0; i < chunks.length; i++) {
    merged.set(chunks[i], pos);
    pos += chunks[i].length;
  }
  return merged;
}

async function printViaRawBt(order) {
  try {
    // 0 = ESC/POS Siêu Tốc (MẶC ĐỊNH - Cực nhanh < 10ms, không lag máy POS, chữ to rõ)
    // 1 = Đồ Họa Bitmap (Có dấu)
    const printMode = localStorage.getItem('pos_print_accents') || '0';

    if (printMode === '0') {
      showToast('Đang gửi lệnh in siêu tốc tới RawBT...', 'info');
      const base64Data = generateEscPosBase64(order);
      if (!base64Data) throw new Error('Không thể tạo dữ liệu in ESC/POS');

      const isChrome = /Chrome|CriOS/i.test(navigator.userAgent);
      const targetUrl = isChrome
        ? 'intent:base64,' + base64Data + '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dru.a402d.rawbtprinter;end;'
        : 'rawbt:base64,' + base64Data;

      dispatchRawBtIntent(targetUrl, 'rawbt:base64,' + base64Data);
      showToast('Đã gửi lệnh in siêu tốc tới máy in RawBT!', 'success');
      return true;
    }

    // Nếu người dùng chọn Form Đồ Họa Bitmap (1)
    showToast('Đang kết xuất hóa đơn gửi RawBT...', 'info');

    // 1. Đảm bảo thư viện html2canvas đã sẵn sàng
    if (typeof html2canvas === 'undefined') {
      await loadHtml2CanvasScript();
    }

    // 2. Xác định khổ in: 80mm = 576 dots (tràn viền 72mm giấy), 58mm = 384 dots (tràn viền 48mm giấy)
    const paperWidth = localStorage.getItem('pos_paper_width') || '80mm';
    const is58mm = paperWidth === '58mm';
    const targetDots = is58mm ? 384 : 576;
    const renderWidthPx = targetDots;

    // 3. Tạo khung chứa DOM hóa đơn 1:1 chuẩn đầu in nhiệt (To rõ, tràn giấy)
    const hiddenBox = document.createElement('div');
    hiddenBox.id = 'rawbt-render-container';
    hiddenBox.style.cssText = `
      position: fixed;
      left: -9999px;
      top: 0;
      width: ${renderWidthPx}px;
      max-width: ${renderWidthPx}px;
      padding: 6px 4px 18px 4px;
      background: #ffffff !important;
      color: #000000 !important;
      font-family: 'Courier New', Courier, monospace, sans-serif !important;
      line-height: 1.35 !important;
      box-sizing: border-box !important;
      z-index: -9999;
      pointer-events: none;
    `;
    hiddenBox.innerHTML = generateReceiptHtml(order, { isRaster: true, is58mm: is58mm });
    document.body.appendChild(hiddenBox);

    // Chờ 60ms để DOM ổn định bố cục font
    await new Promise(r => setTimeout(r, 60));

    // 4. Kết xuất thành Canvas 1:1 với độ phân giải đầu in nhiệt (576 dots)
    const canvas = await html2canvas(hiddenBox, {
      scale: 1.0,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
      windowWidth: renderWidthPx
    });

    // Dọn dẹp DOM tạm
    try {
      if (hiddenBox.parentNode) hiddenBox.parentNode.removeChild(hiddenBox);
    } catch (e) {}

    // 5. Chuyển đổi Canvas trực tiếp thành luồng lệnh ESC/POS Raster (GS v 0) + CẮT GIẤY 1 LẦN
    const escPosBytes = convertCanvasToEscPosRaster(canvas, targetDots);
    const base64Data = uint8ArrayToBase64(escPosBytes);

    if (!base64Data) throw new Error('Không thể tạo dữ liệu in ESC/POS');

    // 6. Gửi qua RawBT bằng intent / scheme base64 chuẩn
    const isChrome = /Chrome|CriOS/i.test(navigator.userAgent);
    const targetUrl = isChrome
      ? 'intent:base64,' + base64Data + '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dru.a402d.rawbtprinter;end;'
      : 'rawbt:base64,' + base64Data;

    dispatchRawBtIntent(targetUrl, 'rawbt:base64,' + base64Data);
    showToast('Đã gửi hóa đơn in & cắt giấy qua RawBT!', 'success');
    return true;
  } catch (err) {
    console.error('Lỗi khi in qua RawBT:', err);
    showToast('Lỗi in RawBT: ' + (err.message || err), 'error');
    executeWindowPrint(order, false);
    return false;
  }
}

async function printEscPosBluetooth(order) {
  if (!bluetoothCharacteristic) throw new Error('Chưa kết nối máy in');

  const content = generateEscPosPayload(order);
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

function printReceipt(order, isManual = false) {
  // Nếu là lệnh in tự động và chế độ tự động in đang tắt -> Bỏ qua
  // Nhưng nếu người dùng chủ động bấm In (isManual = true: In bill, In lại, In thử) -> Luôn thực thi lệnh in!
  if (!isManual && !isAutoPrintEnabled() && !bluetoothCharacteristic) {
    console.log('Chế độ tự động in đang tắt, bỏ qua lệnh in tự động');
    return;
  }

  if (Date.now() - (window._lastPrintTimestamp || 0) < 1500) {
    console.log('Chặn in trùng lặp trong 1.5s');
    return;
  }
  window._lastPrintTimestamp = Date.now();
  lastPrintedOrder = order;

  // 1. Máy in Bluetooth Web API (nếu đã kết nối trực tiếp)
  if (bluetoothCharacteristic) {
    showToast('Đang in phiếu qua Bluetooth...', 'info');
    printEscPosBluetooth(order).then(() => {
      showToast('Đã in phiếu thành công!', 'success');
    }).catch(err => {
      console.warn('Bluetooth print failed, falling back to window.print', err);
      executeWindowPrint(order, isManual);
    });
    return;
  }

  // 2. Chế độ in ngầm RawBT (dành cho máy POS Android / Cổng USB)
  const config = getPrinterConfig();
  if (config.isRawBt) {
    printViaRawBt(order);
    return;
  }

  // 3. Mặc định: Laptop/PC quầy thu ngân (window.print / Kiosk silent print)
  executeWindowPrint(order, isManual);
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

// Biến toàn cục bảo vệ lệnh in: CHỈ cho phép in khi người dùng bấm "Xác Nhận" hoặc "Thanh Toán"
window._explicitPrintAuthorized = false;

function executeWindowPrint(order, isManual = false) {
  // BẢO VỆ TUYỆT ĐỐI 1: Nếu đang ở màn hình chọn món (screen-order) và KHÔNG ĐƯỢC ủy quyền rõ ràng qua modal Xác Nhận / Thanh Toán -> CHẶN 100%
  if (state.activeScreen === 'order' && !window._explicitPrintAuthorized) {
    console.warn('executeWindowPrint: ĐÃ CHẶN vì người dùng đang ở màn hình gọi món, chưa bấm Xác Nhận / Thanh Toán');
    return;
  }

  // BẢO VỆ TUYỆT ĐỐI 2: CHẶN TẤT CẢ LỆNH IN KHI BẤM CỘNG/TRỪ MÓN HOẶC ĐỒNG BỘ NỀN
  // Chỉ in nếu là in thủ công (isManual=true: In bill tạm tính, in lại, in thử)
  // HOẶC được cấp quyền rõ ràng từ Xác Nhận Báo Bếp / Thanh Toán (window._explicitPrintAuthorized=true)
  if (!isManual && !window._explicitPrintAuthorized) {
    console.warn('executeWindowPrint: ĐÃ CHẶN LỆNH IN TỰ ĐỘNG KHÔNG HỢP LỆ (Chưa bấm Xác Nhận / Thanh Toán)');
    return;
  }

  // Chỉ gọi window.print nếu người dùng BẬT tự động in, có máy in Bluetooth, hoặc chủ động bấm nút In
  if (!isManual && !isAutoPrintEnabled() && !bluetoothCharacteristic) {
    console.log('Chế độ in đang tắt, bỏ qua executeWindowPrint');
    return;
  }
  showToast('Đang gửi hóa đơn tới máy in...', 'info');
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
    printViaIsolatedIframe(receiptHtml, isManual);
  }
}

function printViaIsolatedIframe(receiptHtml, isManual = false) {
  if (!isManual && !window._explicitPrintAuthorized) {
    console.warn('printViaIsolatedIframe: ĐÃ CHẶN LỆNH IN QUA IFRAME KHÔNG HỢP LỆ');
    return;
  }
  if (!isManual && !isAutoPrintEnabled() && !bluetoothCharacteristic) {
    console.log('Chế độ in đang tắt, bỏ qua printViaIsolatedIframe');
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


// ==========================================
// ĐỊNH DẠNG & TỰ ĐỘNG GỌI RAWBT CHO MỌI THIẾT BỊ
// ==========================================

function formatTableOrderForPrint(tableName, orderData) {
  if (!orderData) return null;
  const rawItems = orderData.items || [];
  const items = rawItems.map(it => {
    const name = it.product_name || it.name || 'Món';
    const quantity = Number(it.quantity) || 1;
    const price = Number(it.price) || 0;
    const total = Number(it.total !== undefined ? it.total : price * quantity);
    return {
      product_name: name,
      name: name,
      quantity: quantity,
      price: price,
      total: total,
      note: it.note || ''
    };
  });

  const subtotal = Number(orderData.subtotal !== undefined ? orderData.subtotal : (orderData.total || 0));
  const discount = Number(orderData.discount || 0);
  const total = Number(orderData.total !== undefined ? orderData.total : (subtotal - discount));

  return {
    order_code: orderData.order_code || ('BAN-' + String(tableName).replace(/\s+/g, '') + '-' + Date.now().toString().slice(-4)),
    table_name: tableName,
    source: orderData.source || 'taicho',
    note: orderData.note || '',
    cashier_name: orderData.cashier_name || (state.currentUser && state.currentUser.name) || (state.user && state.user.name) || 'Thu ngân',
    payment_method: orderData.payment_method || 'cash',
    created_at: orderData.created_at || new Date().toISOString(),
    items: items,
    subtotal: subtotal,
    discount: discount,
    total: total
  };
}

// Hàm gọi in RawBT duy nhất (BẢO VỆ CHẶN LỖI TRÌNH DUYỆT TRÊN LAPTOP / ĐIỆN THOẠI)
function callRawBtPrint(order, isManual = false) {
  if (!order) return false;
  // BẢO VỆ TUYỆT ĐỐI: Nếu đang ở chế độ Chrome Windows -> Tuyệt đối không gọi URL scheme rawbt mà in trực tiếp
  const engine = getPrintEngine();
  if (engine === 'windows') {
    executeWindowPrint(order, isManual);
    return true;
  }
  // Nếu thiết bị này KHÔNG phải máy POS in RawBT -> Dừng ngay
  if (!isRawBtStation()) {
    console.log('Thiết bị này không phải Trạm In RawBT, bỏ qua lệnh in cục bộ.');
    return false;
  }
  lastPrintedOrder = order;

  // 1. Nếu có máy in Bluetooth kết nối trực tiếp
  if (bluetoothCharacteristic) {
    showToast('Đang in phiếu qua Bluetooth...', 'info');
    printEscPosBluetooth(order).then(() => {
      showToast('Đã in phiếu thành công!', 'success');
    }).catch(err => {
      console.warn('Bluetooth print failed, fallback to RawBT:', err);
      printViaRawBt(order);
    });
    return true;
  }

  // 2. Gọi RawBT Print Service trên máy POS Android
  printViaRawBt(order);
  return true;
}

async function sendPrintJobToServer(order) {
  const orderToSend = order || lastPrintedOrder;
  if (!orderToSend) {
    showToast('Chưa có thông tin phiếu!', 'error');
    return;
  }
  try {
    const myDevId = typeof getDeviceId === 'function' ? getDeviceId() : null;
    const senderName = (state.currentUser && state.currentUser.name) || (state.user && state.user.name) || localStorage.getItem('pos_staff_name') || 'Nhân viên';
    await api('/api/print-job', {
      method: 'POST',
      body: JSON.stringify({
        order: orderToSend,
        sender_device_id: myDevId,
        sender_name: senderName
      })
    });
    showToast('Đã gửi lệnh in thành công tới quầy!', 'success');
  } catch (err) {
    showToast('Chưa thể gửi lệnh in tới quầy: ' + (err.message || err), 'warning');
  }
}

// Hàm in thống nhất: Trạm quầy thì in trực tiếp (theo chế độ Laptop Win hoặc Android RawBT), máy khác thì gửi qua server
async function executeOrderPrint(order, options = {}) {
  const { isManual = false, isKitchen = false, isCheckout = false } = options;
  if (!order) return;

  // BẢO VỆ TUYỆT ĐỐI 1: Bỏ qua nếu không phải loại in hợp lệ
  if (!isManual && !isKitchen && !isCheckout) {
    console.warn('executeOrderPrint: Bỏ qua lệnh in vì không có loại in hợp lệ');
    return;
  }

  // BẢO VỆ TUYỆT ĐỐI 2: Đang ở màn hình gọi món mà chưa bấm Xác Nhận / Thanh Toán -> CHẶN 100%
  if (state.activeScreen === 'order' && !window._explicitPrintAuthorized && !isManual) {
    console.warn('executeOrderPrint: ĐÃ CHẶN vì đang ở màn hình đặt món (chưa bấm Xác Nhận)');
    return;
  }

  lastPrintedOrder = order;

  // 1. Nếu đây là Trạm In Quầy (Laptop Chrome hoặc Máy POS Android)
  if (isPrintStationDevice()) {
    const engine = getPrintEngine();
    if (engine === 'windows') {
      // IN TRỰC TIẾP TRÊN CHROME LAPTOP (WINDOW.PRINT / KIOSK SILENT PRINT)
      executeWindowPrint(order, isManual);
      return;
    } else {
      // IN TRỰC TIẾP QUA RAWBT MÁY POS ANDROID
      callRawBtPrint(order, isManual);
      return;
    }
  }

  // 2. Nếu đây là điện thoại khác (nhân viên) -> Phát lệnh in về quầy thu ngân
  const myDevId = typeof getDeviceId === 'function' ? getDeviceId() : null;
  const staffName = (state.currentUser && state.currentUser.name) || (state.user && state.user.name) || localStorage.getItem('pos_staff_name') || 'Nhân viên';

  try {
    showToast('Đang phát lệnh in tới trạm quầy...', 'info');
    await api('/api/print-job', {
      method: 'POST',
      body: JSON.stringify({
        order: order,
        sender_device_id: myDevId,
        sender_name: staffName,
        print_type: isKitchen ? 'kitchen' : (isCheckout ? 'checkout' : 'receipt')
      })
    });
    showToast('🔔 Đã gửi lệnh in tới trạm quầy thành công!', 'success');
  } catch (err) {
    console.warn('Lỗi gửi lệnh in tới server:', err);
    showToast('Không thể gửi lệnh in tới trạm quầy: ' + (err.message || err), 'warning');
  }
}

let _remotePrintAlertTimer = null;
let _pendingRemoteOrder = null;

function showRemotePrintAlert(order, senderName) {
  _pendingRemoteOrder = order;
  let banner = document.getElementById('remoteOrderPrintBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'remoteOrderPrintBanner';
    document.body.appendChild(banner);
  }

  const tableName = order.table_name || 'Bàn';
  const totalStr = formatReceiptNum(order.total || order.subtotal || 0) + ' đ';
  const fromWho = senderName ? `${senderName}` : 'Điện thoại nhân viên';
  const itemCount = (order.items && order.items.length) ? `${order.items.length} món` : '';

  banner.className = 'fixed top-3 left-3 right-3 sm:left-auto sm:right-4 z-[9999] max-w-sm bg-purple-700 text-white p-3.5 rounded-2xl shadow-2xl flex items-center justify-between space-x-3 transition-all animate-bounce border-2 border-white/40 pointer-events-auto';
  banner.innerHTML = `
    <div class="flex items-center space-x-3 min-w-0">
      <div class="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-lg shrink-0">
        <i class="fa-solid fa-print"></i>
      </div>
      <div class="min-w-0">
        <div class="font-black text-xs sm:text-sm truncate leading-tight">🔔 ${fromWho} gọi món</div>
        <div class="text-[11px] text-purple-200 font-medium truncate mt-0.5">${tableName} ${itemCount ? '• ' + itemCount : ''} • ${totalStr}</div>
      </div>
    </div>
    <div class="flex items-center space-x-1.5 shrink-0">
      <button id="btnTapToPrintRemote" type="button" class="px-3 py-2 bg-white hover:bg-purple-50 active:bg-purple-100 text-purple-800 font-black rounded-xl text-xs shadow-md flex items-center space-x-1">
        <i class="fa-solid fa-receipt text-xs"></i>
        <span>IN LẠI</span>
      </button>
      <button onclick="hideRemotePrintAlert()" type="button" class="w-7 h-7 rounded-lg hover:bg-white/20 text-white/80 flex items-center justify-center text-xs">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  `;

  const btn = document.getElementById('btnTapToPrintRemote');
  if (btn) {
    btn.onclick = () => {
      if (_pendingRemoteOrder) {
        executeOrderPrint(_pendingRemoteOrder, { isManual: true });
        showToast('Đã kích hoạt in hóa đơn!', 'success');
      }
      hideRemotePrintAlert();
    };
  }

  if (_remotePrintAlertTimer) clearTimeout(_remotePrintAlertTimer);
  _remotePrintAlertTimer = setTimeout(() => {
    hideRemotePrintAlert();
  }, 12000);
}

function hideRemotePrintAlert() {
  const banner = document.getElementById('remoteOrderPrintBanner');
  if (banner) {
    banner.className = 'hidden';
  }
  if (_remotePrintAlertTimer) {
    clearTimeout(_remotePrintAlertTimer);
    _remotePrintAlertTimer = null;
  }
}

// =============================================================
// QUẢN LÝ CHẾ ĐỘ TRẠM IN: CHROME LAPTOP vs MÁY POS RAWBT ANDROID
// =============================================================

function getPrintEngine() {
  const saved = localStorage.getItem('pos_print_engine');
  if (saved === 'windows' || saved === 'rawbt') {
    return saved;
  }
  // Tự động nhận diện thiết bị thông minh nếu người dùng chưa chọn thủ công:
  const isAndroid = /Android/i.test(navigator.userAgent);
  if (isAndroid) {
    return 'rawbt';
  }
  // Mặc định đối với Laptop, PC Windows, MacOS: Luôn là Chrome Windows
  return 'windows';
}

function setPrinterStationEngine(engine) {
  if (engine !== 'windows' && engine !== 'rawbt') return;
  localStorage.setItem('pos_print_engine', engine);
  localStorage.setItem('pos_is_station_active', '1');

  if (engine === 'windows') {
    localStorage.setItem('pos_is_rawbt_station', '0');
    localStorage.setItem('pos_rawbt_enabled', '0');
    localStorage.setItem('pos_is_print_station', '1');
    showToast('Đã chuyển sang chế độ Chrome Laptop (In trực tiếp / Kiosk)', 'success');
  } else {
    localStorage.setItem('pos_is_rawbt_station', '1');
    localStorage.setItem('pos_rawbt_enabled', '1');
    localStorage.setItem('pos_is_print_station', '1');
    showToast('Đã chuyển sang chế độ Máy POS Android (In ngầm qua RawBT)', 'success');
  }

  renderPrinterStatusUI();
  updateDrawerPrinterBadge();
}

function isPrintStationDevice() {
  const savedActive = localStorage.getItem('pos_is_station_active');
  if (savedActive !== null) {
    return savedActive === '1';
  }
  // Mặc định: Laptop / Máy tính để bàn (Windows / Mac) -> MẶC ĐỊNH LÀ TRẠM QUẦY
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (!isMobile) {
    return true;
  }
  // Đối với điện thoại / máy POS Android:
  const engine = getPrintEngine();
  if (engine === 'rawbt') {
    const rawbtSaved = localStorage.getItem('pos_is_rawbt_station');
    return rawbtSaved === '1';
  }
  return false;
}

function isRawBtStation() {
  return getPrintEngine() === 'rawbt' && isPrintStationDevice();
}

function setRawBtStation(enabled) {
  setPrinterStationEngine(enabled ? 'rawbt' : 'windows');
}

function toggleRawBtStationMode(checked) {
  setRawBtStation(checked);
}

// Tương thích ngược
function setPrintStationEnabled(enabled) {
  localStorage.setItem('pos_is_station_active', enabled ? '1' : '0');
  renderPrinterStatusUI();
  updateDrawerPrinterBadge();
}
function togglePrintStationMode(checked) {
  setPrintStationEnabled(checked);
}
function isRawBtEnabled() {
  return isRawBtStation();
}
function setRawBtEnabled(enabled) {
  setRawBtStation(enabled);
}
function toggleRawBtMode(checked) {
  setRawBtStation(checked);
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

function showRawBtGuide() {
  const guide = 'HƯỚNG DẪN CẤU HÌNH RAWBT ĐỂ IN 1 CHẠM & KHÔNG LỖI CHỮ:\n\n' +
    '1. Mở app "RawBT Print Service" trên máy POS Android.\n' +
    '2. Bấm biểu tượng Cài đặt (bánh răng) ở góc ứng dụng.\n' +
    '3. Mục "Chung" (General):\n' +
    '   -> BẬT "In tự động" (Autoprint / Silent print).\n' +
    '4. Mục "Cài đặt máy in" (Printer connection):\n' +
    '   -> Chọn kết nối: "USB" (chọn máy in SRP02 cắm dây).\n' +
    '   -> Kiểu in: Giữ Text mặc định để in không dấu siêu nét 100% không lỗi.\n' +
    '5. Quay lại màn hình Web POS này và bấm "In Thử Hóa Đơn" để giấy tự nhả ngay tức khắc!';
  alert(guide);
}

function setPaperWidth(val) {
  localStorage.setItem('pos_paper_width', val);
  showToast(`Đã lưu khổ giấy in: ${val}`, 'info');
}

function setPrintAccents(val) {
  localStorage.setItem('pos_print_accents', val);
  if (val === '1') {
    showToast('Đã chọn Mẫu Đồ Họa Bitmap (Giống hệt 100% Windows)', 'success');
  } else if (val === '2') {
    showToast('Đã chọn Mẫu ESC/POS Không dấu (Dành cho máy in cũ)', 'info');
  } else {
    showToast('Đã chọn Mẫu Chuẩn ESC/POS (Có dấu, khớp mẫu Windows)', 'success');
  }
}

// Cấu hình & trạng thái máy in (Đã kết nối chưa, kết nối với máy in nào)
function getPrinterConfig() {
  // 1. Kiểm tra kết nối Bluetooth trực tiếp
  if (bluetoothDevice && bluetoothDevice.gatt && bluetoothDevice.gatt.connected) {
    return {
      connected: true,
      name: bluetoothDevice.name || 'Máy in Bluetooth',
      type: 'Bluetooth',
      isBluetooth: true,
      isRawBt: false,
      engine: 'bluetooth'
    };
  }

  const engine = getPrintEngine();
  const isStation = isPrintStationDevice();

  // 2. Chế độ Máy POS Android (RawBT)
  if (engine === 'rawbt') {
    return {
      connected: isStation,
      name: isStation ? 'RawBT (Máy POS Android / Cáp USB)' : 'Chưa bật trạm in',
      type: 'RawBT Android',
      isBluetooth: false,
      isRawBt: true,
      engine: 'rawbt'
    };
  }

  // 3. Chế độ Chrome Laptop Windows
  return {
    connected: isStation,
    name: isStation ? 'Máy in Quầy (Chrome Windows / Kiosk)' : 'Chưa bật trạm in',
    type: 'Chrome Windows',
    isBluetooth: false,
    isRawBt: false,
    engine: 'windows'
  };
}

function isAutoPrintEnabled() {
  return getPrinterConfig().connected;
}

function renderPrinterStatusUI() {
  const config = getPrinterConfig();
  const isStation = isPrintStationDevice();
  const engine = getPrintEngine();

  const card = document.getElementById('printerStatusCard');
  const iconBox = document.getElementById('printerStatusIconBox');
  const icon = document.getElementById('printerStatusIcon');
  const statusText = document.getElementById('printerConnectionStatusText');
  const dot = document.getElementById('printerStatusDot');
  const nameDisplay = document.getElementById('printerNameDisplayText');
  const hintText = document.getElementById('printerSubHintText');
  const badge = document.getElementById('printerTypeBadge');
  const btnDisconnect = document.getElementById('btnDisconnectPrinter');

  const btnWindows = document.getElementById('btnModeWindows');
  const btnRawBt = document.getElementById('btnModeRawBt');
  const badgeEngine = document.getElementById('badgeCurrentPrintEngine');
  const rawbtSection = document.getElementById('rawbtConfigSection');

  const selectPaper = document.getElementById('selectPaperWidth');
  const selectAccents = document.getElementById('selectPrintAccents');

  // Cập nhật trạng thái nút chuyển đổi chế độ in
  if (btnWindows && btnRawBt) {
    if (engine === 'windows') {
      btnWindows.className = 'p-2.5 rounded-xl border border-blue-500 bg-blue-50 text-blue-900 ring-2 ring-blue-500/20 text-center transition-all flex flex-col items-center justify-center space-y-1 shadow-xs font-bold';
      btnRawBt.className = 'p-2.5 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-800 text-center transition-all flex flex-col items-center justify-center space-y-1 opacity-70 hover:opacity-100 font-bold';
    } else {
      btnWindows.className = 'p-2.5 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-800 text-center transition-all flex flex-col items-center justify-center space-y-1 opacity-70 hover:opacity-100 font-bold';
      btnRawBt.className = 'p-2.5 rounded-xl border border-purple-500 bg-purple-50 text-purple-900 ring-2 ring-purple-500/20 text-center transition-all flex flex-col items-center justify-center space-y-1 shadow-xs font-bold';
    }
  }

  if (badgeEngine) {
    if (engine === 'windows') {
      badgeEngine.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 uppercase';
      badgeEngine.textContent = 'CHROME LAPTOP';
    } else {
      badgeEngine.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 uppercase';
      badgeEngine.textContent = 'RAWBT ANDROID';
    }
  }

  if (rawbtSection) {
    if (engine === 'windows') {
      rawbtSection.classList.add('hidden');
    } else {
      rawbtSection.classList.remove('hidden');
    }
  }

  if (selectPaper) {
    selectPaper.value = localStorage.getItem('pos_paper_width') || '80mm';
  }

  if (selectAccents) {
    selectAccents.value = localStorage.getItem('pos_print_accents') || '0';
  }

  if (!card) return;

  if (config.connected) {
    if (config.isRawBt) {
      card.className = 'rounded-2xl p-4 border border-purple-200 bg-purple-50/50 shadow-2xs transition-all';
      if (iconBox) iconBox.className = 'w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center text-lg shrink-0 shadow-2xs mt-0.5';
      if (icon) icon.className = 'fa-solid fa-bolt-lightning';
      if (statusText) {
        statusText.textContent = isStation ? 'RawBT Android Quầy Sẵn Sàng' : 'RawBT Đang Bật';
        statusText.className = 'font-bold text-sm text-purple-900';
      }
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-purple-600 animate-pulse';
      if (nameDisplay) {
        nameDisplay.textContent = config.name;
        nameDisplay.className = 'text-xs font-black text-slate-800 mt-1 truncate';
      }
      if (hintText) {
        hintText.textContent = isStation ? 'Tự động in khi điện thoại nhân viên gọi món & thanh toán' : 'In ngầm siêu tốc, không hiện hộp thoại Android Print';
        hintText.className = 'text-[10px] text-purple-700 font-medium mt-0.5';
      }
      if (badge) {
        badge.textContent = 'RAWBT ANDROID';
        badge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 uppercase shrink-0';
      }
    } else {
      card.className = 'rounded-2xl p-4 border border-blue-200 bg-blue-50/50 shadow-2xs transition-all';
      if (iconBox) iconBox.className = 'w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-lg shrink-0 shadow-2xs mt-0.5';
      if (icon) icon.className = config.isBluetooth ? 'fa-brands fa-bluetooth-b' : 'fa-brands fa-windows';
      if (statusText) {
        statusText.textContent = isStation ? 'Chrome Windows Sẵn Sàng' : 'Đã kết nối';
        statusText.className = 'font-bold text-sm text-blue-900';
      }
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-blue-500 animate-pulse';
      if (nameDisplay) {
        nameDisplay.textContent = config.name;
        nameDisplay.className = 'text-xs font-black text-slate-800 mt-1 truncate';
      }
      if (hintText) {
        hintText.textContent = isStation ? 'In trực tiếp qua Chrome hoặc Kiosk silent print' : 'Đơn sẽ gửi về trạm quầy để in';
        hintText.className = 'text-[10px] text-blue-700/80 font-medium mt-0.5';
      }
      if (badge) {
        badge.textContent = config.isBluetooth ? 'BLUETOOTH' : 'CHROME WIN';
        badge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 uppercase shrink-0';
      }
    }
    if (btnDisconnect) btnDisconnect.style.display = 'flex';
  } else {
    card.className = 'rounded-2xl p-4 border border-slate-200 bg-slate-50 shadow-2xs transition-all';
    if (iconBox) iconBox.className = 'w-10 h-10 rounded-xl bg-slate-200 text-slate-400 flex items-center justify-center text-lg shrink-0 mt-0.5';
    if (icon) icon.className = 'fa-solid fa-print';
    if (statusText) {
      statusText.textContent = 'Chưa bật trạm in';
      statusText.className = 'font-bold text-sm text-slate-600';
    }
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-slate-300';
    if (nameDisplay) {
      nameDisplay.textContent = 'Thiết bị này đang đóng vai trò máy gọi món';
      nameDisplay.className = 'text-xs font-semibold text-slate-400 mt-1';
    }
    if (hintText) {
      hintText.textContent = 'Bấm chọn Chế độ in bên dưới để biến máy này thành trạm in quầy';
      hintText.className = 'text-[10px] text-slate-400 mt-0.5';
    }
    if (badge) {
      badge.textContent = 'MÁY PHỤ';
      badge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 uppercase shrink-0';
    }
    if (btnDisconnect) btnDisconnect.style.display = 'none';
  }
}

function updateDrawerPrinterBadge() {
  const badge = document.getElementById('drawerPrinterStatusBadge');
  if (!badge) return;
  const config = getPrinterConfig();
  if (config.connected) {
    if (config.isRawBt) {
      badge.className = 'bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center';
      badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-purple-500 mr-1 animate-pulse"></span><span>RawBT</span>';
      badge.title = 'In ngầm siêu tốc qua RawBT';
    } else {
      badge.className = 'bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center';
      badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1 animate-pulse"></span><span>Chrome Win</span>';
      badge.title = `Máy in: ${config.name}`;
    }
  } else {
    badge.className = 'bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center';
    badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-slate-300 mr-1"></span><span>Chưa kết nối</span>';
    badge.title = 'Chưa kết nối máy in';
  }
}

function disconnectCurrentPrinter() {
  if (bluetoothDevice && bluetoothDevice.gatt && bluetoothDevice.gatt.connected) {
    try { bluetoothDevice.gatt.disconnect(); } catch (e) {}
  }
  bluetoothDevice = null;
  bluetoothCharacteristic = null;
  localStorage.setItem('pos_printer_connected', '0');
  localStorage.setItem('pos_is_station_active', '0');
  renderPrinterStatusUI();
  updateDrawerPrinterBadge();
  showToast('Đã ngắt kết nối máy in!', 'info');
}

function promptChangePrinterName() {
  const current = getPrinterConfig().name;
  const defaultPrompt = current.includes('Chưa kết nối') ? 'Xprinter XP-N160II' : current;
  const newName = prompt('Nhập tên máy in quán đang dùng (ví dụ: Xprinter XP-N160II, Epson TM-T82, POS-80C):', defaultPrompt);
  if (newName && newName.trim()) {
    localStorage.setItem('pos_printer_name', newName.trim());
    localStorage.setItem('pos_printer_type', 'Cổng Quầy');
    localStorage.setItem('pos_printer_connected', '1');
    renderPrinterStatusUI();
    updateDrawerPrinterBadge();
    showToast(`Đã lưu máy in: ${newName.trim()}`, 'success');
  }
}

function openPrinterModal() {
  renderPrinterStatusUI();
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
    cashier_name: (state.currentUser && state.currentUser.name) || 'Thu ngân',
    payment_method: 'cash',
    subtotal: 70000,
    discount: 0,
    total: 70000,
    items: [
      { product_name: 'Bún mắm cá tươi', quantity: 1, price: 55000, total: 55000 },
      { product_name: 'Trà đá đường', quantity: 3, price: 5000, total: 15000 }
    ]
  };
  executeOrderPrint(sampleOrder, { isManual: true });
}
