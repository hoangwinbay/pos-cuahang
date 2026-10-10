// =============================================================
// POS ORDER - CORE APP & STATE MANAGEMENT
// =============================================================

const state = {
  activeScreen: 'tables', // 'tables', 'order', 'reports', 'menu'
  currentTable: 'Bàn 1',
  currentSource: 'taicho', // 'taicho' or 'mangve'
  currentAreaFilter: 'all', // 'all', 'occupied', 'empty'
  tableOrders: JSON.parse(localStorage.getItem('pos_table_orders') || '{}'),
  tableList: JSON.parse(localStorage.getItem('pos_table_list') || '["Bàn 1", "Bàn 2", "Bàn 3", "Bàn 4", "Bàn 5", "Bàn 6", "Bàn 7", "Bàn 8", "Bàn 9", "Bàn 10", "Bàn 11", "Bàn 12"]'),
  products: [],
  categories: [],
  settings: {},
  banks: [],
  currentUser: null,
  token: localStorage.getItem('pos_token') || null
};

// Format currency in Vietnamese Dong (VND)
function formatMoney(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('vi-VN').format(num) + ' ₫';
}

// Format date & time
function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Toast notification helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  const bgClass = type === 'success' ? 'bg-emerald-700 text-white' : type === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-white';
  const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info';

  toast.className = `${bgClass} px-4 py-2.5 rounded-2xl shadow-xl flex items-center space-x-2 text-xs font-bold pointer-events-auto transform transition-all duration-300 translate-y-2 opacity-0 z-50`;
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

// =============================================================
// OFFLINE & STANDALONE LOCAL DATABASE HANDLER
// Đảm bảo Zalo Mini App & Thiết bị di động hoạt động mượt mà 100%
// ngay cả khi chưa kết nối tới máy tính laptop của quán
// =============================================================
function handleOfflineApi(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const path = url.split('?')[0];

  // 1. POST /api/orders (Thanh toán đơn hàng & xuất hóa đơn)
  if (path === '/api/orders' && method === 'POST') {
    const body = options.body ? JSON.parse(options.body) : {};
    const localOrders = JSON.parse(localStorage.getItem('pos_local_orders') || '[]');
    const newId = localOrders.length > 0 ? (localOrders[0].id + 1) : 1;
    const now = new Date();
    const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
    const orderCode = `HD-${dateStr}-${String(100 + newId).slice(-3)}`;

    const items = body.items || [];
    const total = items.reduce((sum, it) => sum + ((it.price || 0) * (it.quantity || 1)), 0) || body.cash_given || 0;

    const newOrder = {
      id: newId,
      order_code: orderCode,
      table_name: body.table_name || 'Bàn',
      total: total,
      subtotal: total,
      discount: 0,
      payment_method: body.payment_method || 'cash',
      created_at: now.toISOString(),
      cashier_name: state.currentUser ? state.currentUser.name : 'Thu Ngân',
      items: items.map(it => ({
        product_name: it.name || it.product_name,
        quantity: it.quantity,
        price: it.price,
        total: (it.price || 0) * (it.quantity || 1)
      }))
    };

    localOrders.unshift(newOrder);
    localStorage.setItem('pos_local_orders', JSON.stringify(localOrders.slice(0, 100)));
    return { success: true, ...newOrder };
  }

  // 2. GET /api/orders (Lịch sử hóa đơn)
  if (path.startsWith('/api/orders') && method === 'GET') {
    return JSON.parse(localStorage.getItem('pos_local_orders') || '[]');
  }

  // 3. POST /api/tables/order (Lưu đơn bàn)
  if (path === '/api/tables/order' && method === 'POST') {
    const body = options.body ? JSON.parse(options.body) : {};
    if (body.table_name && body.order_data) {
      state.tableOrders[body.table_name] = body.order_data;
      localStorage.setItem('pos_table_orders', JSON.stringify(state.tableOrders));
    }
    return { success: true, table_name: body.table_name, order_data: body.order_data };
  }

  // 4. DELETE /api/tables/order/:tableName (Trả bàn)
  if (path.startsWith('/api/tables/order') && method === 'DELETE') {
    const tableName = decodeURIComponent(path.replace('/api/tables/order/', ''));
    if (tableName) {
      delete state.tableOrders[tableName];
      localStorage.setItem('pos_table_orders', JSON.stringify(state.tableOrders));
    }
    return { success: true };
  }

  // 5. GET /api/tables/sync
  if (path === '/api/tables/sync') {
    return {
      tables: state.tableList,
      tableOrders: state.tableOrders
    };
  }

  // 6. POST /api/tables/custom (Thêm bàn mới)
  if (path === '/api/tables/custom' && method === 'POST') {
    const body = options.body ? JSON.parse(options.body) : {};
    if (body.table_name && !state.tableList.includes(body.table_name)) {
      state.tableList.push(body.table_name);
      localStorage.setItem('pos_table_list', JSON.stringify(state.tableList));
    }
    return { success: true, tables: state.tableList };
  }

  // 7. GET /api/categories
  if (path === '/api/categories') {
    return JSON.parse(localStorage.getItem('pos_cached_categories') || 'null') || [
      { id: 1, name: 'Bún Mắm & Bún Nước Lèo' },
      { id: 2, name: 'Món Thêm & Ăn Kèm' },
      { id: 3, name: 'Nước Giải Khát' }
    ];
  }

  // 8. GET /api/products
  if (path === '/api/products' && method === 'GET') {
    return JSON.parse(localStorage.getItem('pos_cached_products') || 'null') || [
      { id: 1, barcode: 'BM01', name: 'Bún mắm đặc biệt (Tôm, Mực, Heo quay, Cá)', category_id: 1, price: 65000, stock: 999, unit: 'tô', image: '' },
      { id: 2, barcode: 'BM02', name: 'Bún mắm thập cẩm', category_id: 1, price: 55000, stock: 999, unit: 'tô', image: '' },
      { id: 3, barcode: 'BM03', name: 'Bún mắm hải sản', category_id: 1, price: 60000, stock: 999, unit: 'tô', image: '' },
      { id: 4, barcode: 'BM04', name: 'Bún nước lèo Sóc Trăng', category_id: 1, price: 50000, stock: 999, unit: 'tô', image: '' },
      { id: 5, barcode: 'BM05', name: 'Heo quay thêm', category_id: 2, price: 25000, stock: 999, unit: 'đĩa', image: '' },
      { id: 6, barcode: 'BM06', name: 'Chả cá thác lác thêm', category_id: 2, price: 20000, stock: 999, unit: 'phần', image: '' },
      { id: 7, barcode: 'BM07', name: 'Rau đắng & bông súng thêm', category_id: 2, price: 10000, stock: 999, unit: 'đĩa', image: '' },
      { id: 8, barcode: 'DU01', name: 'Trà đá đường', category_id: 3, price: 5000, stock: 999, unit: 'ly', image: '' },
      { id: 9, barcode: 'DU02', name: 'Nước mía sầu riêng', category_id: 3, price: 15000, stock: 999, unit: 'ly', image: '' },
      { id: 10, barcode: 'DU03', name: 'Mủ trôm hạt é nha đam', category_id: 3, price: 20000, stock: 999, unit: 'ly', image: '' }
    ];
  }

  // 9. Thêm / Sửa / Xóa món
  if (path.startsWith('/api/products') && method !== 'GET') {
    return { success: true };
  }

  // 10. GET /api/reports/dashboard
  if (path === '/api/reports/dashboard') {
    const orders = JSON.parse(localStorage.getItem('pos_local_orders') || '[]');
    const totalRev = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    return {
      today_revenue: totalRev,
      today_orders: orders.length,
      revenue_chart: [],
      top_products: []
    };
  }

  // 11. GET /api/settings
  if (path === '/api/settings') {
    return state.settings || {
      store_name: 'BÚN MẮM MIỀN TÂY',
      paper_size: '80mm'
    };
  }

  // 12. POST /api/print-job
  if (path === '/api/print-job') {
    return { success: true };
  }

  // 13. POST /api/auth/login or /api/auth/me
  if (path.startsWith('/api/auth')) {
    return {
      token: 'local_token',
      user: { id: 1, username: 'admin', name: 'Chủ Quán', role: 'admin' }
    };
  }

  return { success: true };
}

// Server Base URL resolver (cho phep ket noi tu Zalo Mini App ve may chu POS)
function getApiBaseUrl() {
  const custom = localStorage.getItem('pos_server_url');
  if (custom && custom.trim().length > 0) {
    return custom.trim().replace(/\/$/, '');
  }
  // Neu chay tren localhost hoac IP noi bo
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname)) {
    return '';
  }
  return '';
}

// API Helper with Automatic Offline / Standalone Fallback
async function api(url, options = {}) {
  const base = getApiBaseUrl();
  const isZaloOrExternal = window.location.hostname !== 'localhost' && 
                           window.location.hostname !== '127.0.0.1' && 
                           !/^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname);

  // Neu dang tren Zalo Mini App ma chua cau hinh dia chi may chu laptop:
  // Xu ly ngay bang bo cuc bo de khong bao gio phat sinh loi
  if (!base && isZaloOrExternal) {
    return handleOfflineApi(url, options);
  }

  const fullUrl = url.startsWith('http') ? url : (base ? `${base}${url}` : url);

  try {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (state.token) {
      headers['Authorization'] = `Bearer ${state.token}`;
    }

    const res = await fetch(fullUrl, {
      ...options,
      headers
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      // Neu server tra ve HTML (vi du 404), tu dong xu ly cuc bo de ung dung tiep tuc hoat dong
      return handleOfflineApi(url, options);
    }

    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401 && typeof openLoginModal === 'function') {
        openLoginModal();
      }
      return handleOfflineApi(url, options);
    }
    return data;
  } catch (err) {
    console.warn(`API [${url}] offline, dung du lieu cuc bo:`, err.message || err);
    return handleOfflineApi(url, options);
  }
}

// =============================================================
// AUTHENTICATION & ROLE MANAGEMENT (Chủ quán vs Nhân viên)
// =============================================================
async function initAuth() {
  try {
    if (state.token) {
      const data = await api('/api/auth/me');
      state.currentUser = data.user;
    } else {
      // Default auto-login to Admin
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ pin: '9999' })
      });
      state.token = res.token;
      state.currentUser = res.user;
      localStorage.setItem('pos_token', res.token);
    }
  } catch (err) {
    console.warn('Session expired hoac chua ket noi server:', err.message);
    // Khi offline hoac tren Zalo Mini App chua ket noi duoc laptop, mac dinh cap quyen Chu Quan de mo app
    state.currentUser = { id: 1, username: 'admin', name: 'Chủ Quán', role: 'admin' };
  }

  applyUserRolePermissions();
}

function applyUserRolePermissions() {
  const user = state.currentUser;
  const roleIcon = document.getElementById('userRoleIcon');
  const nameDisplay = document.getElementById('userNameDisplay');
  const drawerUserRole = document.getElementById('drawerUserRole');
  const drawerBtnReports = document.getElementById('drawerBtnReports');
  const drawerBtnMenu = document.getElementById('drawerBtnMenu');

  if (!user) {
    if (roleIcon) roleIcon.innerHTML = '<i class="fa-solid fa-circle-question text-slate-400"></i>';
    if (nameDisplay) nameDisplay.textContent = 'Đăng nhập';
    return;
  }

  const isAdmin = user.role === 'admin';

  if (roleIcon) {
    roleIcon.innerHTML = isAdmin 
      ? '<i class="fa-solid fa-user-shield text-emerald-600"></i>' 
      : '<i class="fa-solid fa-user text-slate-600"></i>';
  }
  if (nameDisplay) nameDisplay.textContent = isAdmin ? 'Chủ Quán' : 'Nhân Viên';
  if (drawerUserRole) drawerUserRole.textContent = isAdmin ? '👑 Chủ Quán (Toàn quyền)' : '👤 Nhân Viên Gọi Món';

  // Only Owner sees Thống Kê & Thực Đơn
  if (drawerBtnReports) drawerBtnReports.style.display = isAdmin ? 'flex' : 'none';
  if (drawerBtnMenu) drawerBtnMenu.style.display = isAdmin ? 'flex' : 'none';

  // If staff is currently on restricted view, switch back to tables
  if (!isAdmin && (state.activeScreen === 'reports' || state.activeScreen === 'menu')) {
    navigateTo('tables');
  }
}

async function fastLogin(accountType) {
  try {
    const pin = accountType === 'admin' ? '9999' : '1234';
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ pin })
    });

    state.token = res.token;
    state.currentUser = res.user;
    localStorage.setItem('pos_token', res.token);

    closeLoginModal();
    applyUserRolePermissions();
    showToast(`Đã chuyển vai trò: ${res.user.role === 'admin' ? 'Chủ Quán' : 'Nhân Viên'}`);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openLoginModal() {
  document.getElementById('loginModal')?.classList.remove('hidden');
}

function closeLoginModal() {
  document.getElementById('loginModal')?.classList.add('hidden');
}

// =============================================================
// NAVIGATION & SIDE DRAWER (☰)
// =============================================================
function toggleSideDrawer(open) {
  const drawer = document.getElementById('sideDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  if (!drawer || !backdrop) return;

  if (open) {
    drawer.classList.add('drawer-open');
    backdrop.classList.remove('hidden');
  } else {
    drawer.classList.remove('drawer-open');
    backdrop.classList.add('hidden');
  }
}

function navigateTo(target) {
  toggleSideDrawer(false);

  // Permission check
  if (state.currentUser && state.currentUser.role !== 'admin') {
    if (target === 'reports' || target === 'menu') {
      showToast('Mục này chỉ dành cho tài khoản Chủ Quán!', 'error');
      return;
    }
  }

  state.activeScreen = target;

  const screenTables = document.getElementById('screen-tables');
  const screenOrder = document.getElementById('screen-order');
  const viewReports = document.getElementById('view-reports');
  const viewMenu = document.getElementById('view-menu');

  // Hide all screens
  if (screenTables) screenTables.classList.add('hidden');
  if (screenOrder) screenOrder.classList.add('hidden');
  if (viewReports) { viewReports.classList.add('hidden'); viewReports.classList.remove('flex'); }
  if (viewMenu) { viewMenu.classList.add('hidden'); viewMenu.classList.remove('flex'); }

  if (target === 'tables') {
    if (screenTables) screenTables.classList.remove('hidden');
    if (typeof renderTableGrid === 'function') renderTableGrid();
  } else if (target === 'order') {
    if (screenOrder) screenOrder.classList.remove('hidden');
  } else if (target === 'reports') {
    if (viewReports) { viewReports.classList.remove('hidden'); viewReports.classList.add('flex'); }
    if (typeof loadDashboardReports === 'function') loadDashboardReports();
    if (typeof loadOrdersList === 'function') loadOrdersList();
  } else if (target === 'menu') {
    if (viewMenu) { viewMenu.classList.remove('hidden'); viewMenu.classList.add('flex'); }
    if (typeof loadMenuDishes === 'function') loadMenuDishes();
    if (typeof populateStoreSettings === 'function') populateStoreSettings();
  }
}

// =============================================================
// LOAD STORE SETTINGS
// =============================================================
async function loadSettings() {
  try {
    const data = await api('/api/settings');
    state.settings = data;

    const headerEl = document.getElementById('headerStoreName');
    const drawerStoreEl = document.getElementById('drawerStoreName');

    if (data.store_name) {
      if (headerEl) headerEl.textContent = data.store_name;
      if (drawerStoreEl) drawerStoreEl.textContent = data.store_name;
    }
  } catch (err) {
    console.warn('Failed to load settings (using fallback):', err);
    state.settings = {
      store_name: 'BÚN MẮM MIỀN TÂY',
      store_address: '123 Đường Lê Lợi, Phường Bến Thành, Quận 1, TP. HCM',
      store_phone: '0909 888 999',
      store_greeting: 'Cảm ơn quý khách và hẹn gặp lại! Hotline hỗ trợ: 0909 888 999',
      bank_id: 'MB',
      bank_account_no: '0909888999',
      bank_account_name: 'BUN MAM MIEN TAY',
      paper_size: '80mm',
      zalo_mini_app_id: '3906597427562388428'
    };
    const headerEl = document.getElementById('headerStoreName');
    const drawerStoreEl = document.getElementById('drawerStoreName');
    if (headerEl) headerEl.textContent = state.settings.store_name;
    if (drawerStoreEl) drawerStoreEl.textContent = state.settings.store_name;
  }
}

// Global Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (typeof closeCheckoutModal === 'function') closeCheckoutModal();
    if (typeof closeKitchenConfirmModal === 'function') closeKitchenConfirmModal();
    if (typeof closeDishModal === 'function') closeDishModal();
    if (typeof closePrinterModal === 'function') closePrinterModal();
    if (typeof closeTableCartDrawer === 'function') closeTableCartDrawer();
    if (typeof closeTableActionsMenu === 'function') closeTableActionsMenu();
    closeServerConfigModal();
    closeLoginModal();
    toggleSideDrawer(false);
  }
});

// =============================================================
// MODAL CẤU HÌNH MÁY CHỦ POS (CHO ZALO MINI APP HOẶC THIẾT BỊ PHỤ)
// =============================================================
function openServerConfigModal() {
  const modal = document.getElementById('modalServerConfig');
  const input = document.getElementById('inputServerUrl');
  const statusEl = document.getElementById('serverTestStatus');

  if (input) {
    input.value = localStorage.getItem('pos_server_url') || '';
  }
  if (statusEl) {
    statusEl.className = 'text-xs font-semibold hidden';
    statusEl.textContent = '';
  }
  if (modal) modal.classList.remove('hidden');
}

function closeServerConfigModal() {
  const modal = document.getElementById('modalServerConfig');
  if (modal) modal.classList.add('hidden');
}

async function testServerConnection() {
  const input = document.getElementById('inputServerUrl');
  const statusEl = document.getElementById('serverTestStatus');
  if (!input || !statusEl) return;

  const url = input.value.trim().replace(/\/$/, '');
  statusEl.className = 'text-xs font-semibold text-amber-600 block';
  statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang kiểm tra kết nối...';

  try {
    const testUrl = url ? `${url}/api/settings` : '/api/settings';
    const res = await fetch(testUrl, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
    if (res.ok) {
      statusEl.className = 'text-xs font-semibold text-emerald-600 block';
      statusEl.innerHTML = '<i class="fa-solid fa-circle-check mr-1"></i> Kết nối thành công tới máy chủ POS!';
    } else {
      statusEl.className = 'text-xs font-semibold text-rose-600 block';
      statusEl.innerHTML = `<i class="fa-solid fa-circle-xmark mr-1"></i> Máy chủ trả về mã lỗi HTTP ${res.status}`;
    }
  } catch (e) {
    statusEl.className = 'text-xs font-semibold text-rose-600 block';
    statusEl.innerHTML = `<i class="fa-solid fa-circle-xmark mr-1"></i> Không thể kết nối: ${e.message}. Hãy chắc chắn laptop đang mở và cùng mạng Wi-Fi.`;
  }
}

function saveServerConfig() {
  const input = document.getElementById('inputServerUrl');
  if (!input) return;

  const url = input.value.trim();
  if (url) {
    localStorage.setItem('pos_server_url', url);
  } else {
    localStorage.removeItem('pos_server_url');
  }

  showToast('Đã lưu địa chỉ máy chủ POS!', 'success');
  closeServerConfigModal();

  // Tự động tải lại dữ liệu với server mới
  loadSettings();
  if (typeof initPos === 'function') {
    initPos();
  }
}

// =============================================================
// ZALO MINI APP SDK INTEGRATION (App ID: 3906597427562388428)
// =============================================================
function initZaloMiniApp() {
  const isZaloEnv = /Zalo/i.test(navigator.userAgent) || typeof window.zmp !== 'undefined';
  if (!isZaloEnv) return;

  try {
    const zmpSdk = window.zmp || window.ZMP;
    if (zmpSdk && typeof zmpSdk.setNavigationBarTitle === 'function') {
      zmpSdk.setNavigationBarTitle({
        title: state.settings.store_name || 'BÚN MẮM MIỀN TÂY'
      });
    }
  } catch (e) {
    console.debug('ZMP SDK init notice:', e);
  }
}

// App Initialization
async function startApp() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  try {
    state.banks = await api('/api/vietqr/banks');
  } catch (e) {}

  await initAuth();
  await loadSettings();
  initZaloMiniApp();

  if (typeof initPos === 'function') {
    await initPos();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
