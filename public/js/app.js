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

    if (body.table_name || body.raw_table_name) {
      const raw = body.raw_table_name || body.table_name;
      const clean = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
      delete state.tableOrders[body.table_name];
      delete state.tableOrders[raw];
      delete state.tableOrders[clean];
      localStorage.setItem('pos_table_orders', JSON.stringify(state.tableOrders));
    }

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
      const clean = tableName.replace(/\s*\([^)]*\)\s*$/, '').trim();
      delete state.tableOrders[tableName];
      delete state.tableOrders[clean];
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

  // 14. GET /api/devices
  if (path === '/api/devices') {
    return {
      devices: [
        {
          id: typeof getDeviceId === 'function' ? getDeviceId() : 'dev_local',
          name: typeof getDeviceName === 'function' ? getDeviceName() : 'Thiết Bị Cục Bộ',
          platform: typeof getDevicePlatform === 'function' ? getDevicePlatform() : 'Web',
          deviceType: typeof getDeviceType === 'function' ? getDeviceType() : 'mobile',
          ip: 'Cục bộ',
          role: state.currentUser ? state.currentUser.role : 'admin',
          userName: state.currentUser ? state.currentUser.name : 'Chủ Quán',
          lastSeen: Date.now(),
          isOnline: true
        }
      ],
      totalOnline: 1,
      totalDevices: 1
    };
  }

  // 15. POST /api/devices/heartbeat
  if (path === '/api/devices/heartbeat') {
    return { success: true, totalOnline: 1 };
  }

  // 16. PUT /api/devices/rename
  if (path === '/api/devices/rename') {
    return { success: true };
  }

  // 17. DELETE /api/devices/:id
  if (path.startsWith('/api/devices/')) {
    return { success: true };
  }

  return { success: true };
}

const DEFAULT_CLOUD_SERVER = 'https://pos-cuahang.onrender.com';

// Server Base URL resolver (Mặc định liên thông 100% với https://pos-cuahang.onrender.com)
function getApiBaseUrl() {
  let custom = localStorage.getItem('pos_server_url');
  // Tự động dọn dẹp các đường link tunnel cũ để ưu tiên đồng bộ theo Render
  if (custom && custom.includes('trycloudflare.com')) {
    localStorage.removeItem('pos_server_url');
    custom = null;
  }

  if (custom && custom.trim().length > 0) {
    return custom.trim().replace(/\/$/, '');
  }

  // Nếu đang mở trực tiếp trên chính web Render hoặc máy chủ nội bộ:
  if (window.location.hostname === 'pos-cuahang.onrender.com' ||
      window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1' || 
      /^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname)) {
    return '';
  }

  // Mặc định cho Zalo Mini App: Kết nối trực tiếp về Render của quán!
  return DEFAULT_CLOUD_SERVER;
}

// API Helper with Automatic Offline / Standalone Fallback
async function api(url, options = {}) {
  const base = getApiBaseUrl();
  const isZaloCdn = window.location.hostname.includes('zdn.vn') || 
                    window.location.hostname.includes('zalo.me');

  // Neu dang tren Zalo Mini App ma khong co base (hiem khi xay ra):
  if (!base && isZaloCdn) {
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

function copyToClipboard(elementId) {
  const el = document.getElementById(elementId);
  if (!el || !el.value) return;
  navigator.clipboard.writeText(el.value).then(() => {
    showToast('Đã sao chép đường dẫn!', 'success');
  }).catch(() => {
    el.select();
    document.execCommand('copy');
    showToast('Đã sao chép!', 'success');
  });
}

// =============================================================
// QUẢN LÝ ĐỊNH DANH & THEO DÕI THIẾT BỊ KẾT NỐI
// =============================================================
function getDeviceId() {
  let id = localStorage.getItem('pos_device_id');
  if (!id) {
    id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    localStorage.setItem('pos_device_id', id);
  }
  return id;
}

function getDeviceName() {
  const custom = localStorage.getItem('pos_device_name');
  if (custom && custom.trim()) return custom.trim();

  const isZalo = /Zalo/i.test(navigator.userAgent) || typeof window.zmp !== 'undefined';
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isZalo) {
    return isIOS ? 'iPhone (Zalo Mini App)' : 'Android (Zalo Mini App)';
  }
  if (isIOS) return 'iPhone (Safari POS)';
  if (isMobile) return 'Điện Thoại Android';
  return 'Máy Tính / Laptop Quầy';
}

function getDevicePlatform() {
  if (/Zalo/i.test(navigator.userAgent) || typeof window.zmp !== 'undefined') return 'Zalo Mini App';
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return 'iOS (iPhone / iPad)';
  if (/Android/i.test(navigator.userAgent)) return 'Android';
  if (/Windows/i.test(navigator.userAgent)) return 'Windows PC';
  if (/Mac/i.test(navigator.userAgent)) return 'macOS';
  return 'Web Browser';
}

function getDeviceType() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
}

// Gửi nhịp tim định kỳ tới server (Heartbeat)
async function sendDeviceHeartbeat() {
  try {
    const devId = getDeviceId();
    const devName = getDeviceName();
    const platform = getDevicePlatform();
    const devType = getDeviceType();

    const res = await api('/api/devices/heartbeat', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: devId,
        deviceName: devName,
        platform: platform,
        deviceType: devType,
        role: state.currentUser ? state.currentUser.role : 'staff',
        userName: state.currentUser ? state.currentUser.name : 'Nhân Viên'
      })
    });

    if (res && res.totalOnline !== undefined) {
      updateConnectedDeviceBadgeUI(res.totalOnline);
    }
  } catch (e) {}
}

function updateConnectedDeviceBadgeUI(count) {
  const badgeHeader = document.getElementById('headerDeviceCountDisplay');
  const drawerBadge = document.getElementById('drawerDeviceCountBadge');
  const modalBadge = document.getElementById('devicesOnlineCountText');

  const text = `${count || 1} ĐT`;
  const fullText = `${count || 1} Online`;

  if (badgeHeader) badgeHeader.textContent = text;
  if (drawerBadge) drawerBadge.textContent = count || 1;
  if (modalBadge) modalBadge.textContent = fullText;
}

// =============================================================
// MODAL XEM DANH SÁCH THIẾT BỊ ĐANG KẾT NỐI
// =============================================================
let devicesAutoRefreshInterval = null;

async function openConnectedDevicesModal() {
  const modal = document.getElementById('modalConnectedDevices');
  if (modal) modal.classList.remove('hidden');

  loadConnectedDevices();

  if (devicesAutoRefreshInterval) clearInterval(devicesAutoRefreshInterval);
  devicesAutoRefreshInterval = setInterval(() => {
    const m = document.getElementById('modalConnectedDevices');
    if (m && !m.classList.contains('hidden')) {
      loadConnectedDevices(true);
    }
  }, 4000);
}

function closeConnectedDevicesModal() {
  const modal = document.getElementById('modalConnectedDevices');
  if (modal) modal.classList.add('hidden');
  if (devicesAutoRefreshInterval) {
    clearInterval(devicesAutoRefreshInterval);
    devicesAutoRefreshInterval = null;
  }
}

async function loadConnectedDevices(silent = false) {
  const container = document.getElementById('connectedDevicesListContainer');
  if (!container) return;

  if (!silent) {
    container.innerHTML = `
      <div class="text-center py-8 text-slate-400 text-xs">
        <i class="fa-solid fa-spinner fa-spin text-2xl mb-2 text-blue-500"></i>
        <p>Đang tải danh sách thiết bị kết nối...</p>
      </div>
    `;
  }

  try {
    const res = await api('/api/devices');
    const devices = res?.devices || [];
    const totalOnline = res?.totalOnline || devices.filter(d => d.isOnline).length;

    updateConnectedDeviceBadgeUI(totalOnline);

    if (devices.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8 text-slate-400 text-xs">
          <i class="fa-solid fa-network-wired text-3xl mb-2 text-slate-300"></i>
          <p>Chưa có thiết bị nào kết nối.</p>
        </div>
      `;
      return;
    }

    const currentDevId = getDeviceId();

    container.innerHTML = devices.map(dev => {
      const isSelf = dev.id === currentDevId;
      const isOnline = dev.isOnline;
      
      let iconHtml = '<i class="fa-solid fa-laptop text-indigo-600 text-lg"></i>';
      let iconBg = 'bg-indigo-50 border-indigo-100';

      if (dev.platform.includes('Zalo')) {
        iconHtml = '<i class="fa-solid fa-comment-dots text-blue-600 text-lg"></i>';
        iconBg = 'bg-blue-50 border-blue-100';
      } else if (dev.platform.includes('iOS') || /iPhone|iPad/i.test(dev.platform)) {
        iconHtml = '<i class="fa-brands fa-apple text-slate-800 text-lg"></i>';
        iconBg = 'bg-slate-100 border-slate-200';
      } else if (dev.platform.includes('Android')) {
        iconHtml = '<i class="fa-brands fa-android text-emerald-600 text-lg"></i>';
        iconBg = 'bg-emerald-50 border-emerald-100';
      }

      const elapsedSec = Math.floor((Date.now() - (dev.lastSeen || Date.now())) / 1000);
      let lastSeenText = 'Vừa xong';
      if (elapsedSec > 60) {
        lastSeenText = `${Math.floor(elapsedSec / 60)} phút trước`;
      } else if (elapsedSec > 5) {
        lastSeenText = `${elapsedSec}s trước`;
      }

      return `
        <div class="border ${isSelf ? 'border-blue-400 bg-blue-50/20 shadow-2xs' : 'border-slate-200 bg-white'} rounded-2xl p-3 sm:p-3.5 flex items-center justify-between space-x-3 transition-all hover:border-blue-300">
          <div class="flex items-center space-x-3 truncate">
            <div class="w-10 h-10 rounded-xl ${iconBg} border flex items-center justify-center shrink-0">
              ${iconHtml}
            </div>
            <div class="truncate">
              <div class="flex items-center space-x-1.5">
                <span class="font-bold text-slate-800 text-xs sm:text-sm truncate">${escapeHtml(dev.name)}</span>
                ${isSelf ? '<span class="text-[9px] bg-blue-600 text-white font-black px-1.5 py-0.2 rounded-full shrink-0">MÁY NÀY</span>' : ''}
              </div>
              <div class="text-[11px] text-slate-400 font-medium flex items-center space-x-2 mt-0.5">
                <span>${escapeHtml(dev.platform)}</span>
                <span>•</span>
                <span class="font-mono text-slate-500">${escapeHtml(dev.ip)}</span>
              </div>
            </div>
          </div>

          <div class="flex items-center space-x-2 shrink-0">
            <div class="text-right">
              ${isOnline ? `
                <div class="flex items-center justify-end space-x-1 text-emerald-600 text-xs font-bold">
                  <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Online</span>
                </div>
              ` : `
                <div class="flex items-center justify-end space-x-1 text-slate-400 text-xs font-medium">
                  <span class="w-2 h-2 rounded-full bg-slate-300"></span>
                  <span>Offline</span>
                </div>
              `}
              <div class="text-[10px] text-slate-400">${isOnline ? 'Đang hoạt động' : lastSeenText}</div>
            </div>

            ${!isOnline && !isSelf ? `
              <button onclick="deleteConnectedDevice('${dev.id}')" class="p-1.5 text-slate-300 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-colors" title="Xóa thiết bị offline">
                <i class="fa-solid fa-trash-can text-xs"></i>
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `
      <div class="text-center py-6 text-rose-500 text-xs">
        <i class="fa-solid fa-circle-exclamation text-xl mb-1"></i>
        <p>Lỗi tải danh sách: ${err.message}</p>
      </div>
    `;
  }
}

async function promptRenameCurrentDevice() {
  const current = getDeviceName();
  const newName = prompt('Nhập tên gợi nhớ cho thiết bị này (Ví dụ: Máy Em Lan, Laptop Quầy, Máy Order Bàn):', current);
  if (newName && newName.trim() && newName.trim() !== current) {
    const trimmed = newName.trim();
    localStorage.setItem('pos_device_name', trimmed);
    try {
      await api('/api/devices/rename', {
        method: 'PUT',
        body: JSON.stringify({
          deviceId: getDeviceId(),
          newName: trimmed
        })
      });
      showToast('Đã đổi tên thiết bị!', 'success');
      loadConnectedDevices(true);
    } catch (e) {
      showToast('Đã lưu tên thiết bị trên máy!', 'success');
      loadConnectedDevices(true);
    }
  }
}

async function deleteConnectedDevice(devId) {
  if (!confirm('Bạn có muốn xóa thiết bị này khỏi danh sách?')) return;
  try {
    await api('/api/devices/' + encodeURIComponent(devId), { method: 'DELETE' });
    showToast('Đã xóa thiết bị khỏi danh sách');
    loadConnectedDevices(true);
  } catch (e) {
    showToast('Không thể xóa thiết bị', 'error');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[m]);
}

// =============================================================
// MODAL CẤU HÌNH MÁY CHỦ POS (CHO ZALO MINI APP HOẶC THIẾT BỊ PHỤ)
// =============================================================
async function openServerConfigModal() {
  const modal = document.getElementById('modalServerConfig');
  const input = document.getElementById('inputServerUrl');
  const statusEl = document.getElementById('serverTestStatus');
  const hostView = document.getElementById('serverConfigHostView');
  const clientView = document.getElementById('serverConfigClientView');

  if (input) {
    input.value = localStorage.getItem('pos_server_url') || '';
  }
  if (statusEl) {
    statusEl.className = 'text-xs font-semibold hidden';
    statusEl.textContent = '';
  }

  // Phân biệt: Nếu đang mở trực tiếp trên Laptop (localhost hoặc IP nội bộ)
  const isHostMachine = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1' || 
                        /^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname);

  if (isHostMachine && hostView && clientView) {
    hostView.classList.remove('hidden');
    clientView.classList.add('hidden');

    try {
      const res = await fetch('/api/server-info');
      if (res.ok) {
        const info = await res.json();
        const wifiInput = document.getElementById('displayWifiUrl');
        const tunnelInput = document.getElementById('displayTunnelUrl');
        const qrImg = document.getElementById('serverQrCodeImg');

        if (wifiInput) wifiInput.value = info.wifi_url || '';
        if (tunnelInput) tunnelInput.value = info.tunnel_url || info.cloud_url || '';

        const targetUrl = info.tunnel_url || info.cloud_url || info.wifi_url;
        if (qrImg && targetUrl) {
          qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(targetUrl)}`;
        }
      }
    } catch (e) {}
  } else if (hostView && clientView) {
    hostView.classList.add('hidden');
    clientView.classList.remove('hidden');
  }

  if (modal) modal.classList.remove('hidden');
}

function closeServerConfigModal() {
  const modal = document.getElementById('modalServerConfig');
  if (modal) modal.classList.add('hidden');
}

// =============================================================
// MODAL ZALO MINI APP (BẢN TEST MỚI NHẤT)
// =============================================================
let currentZaloTestUrl = 'https://zalo.me/s/3906597427562388428/?env=TESTING&version=18';

async function openZaloModal() {
  const modal = document.getElementById('modalZaloApp');
  if (!modal) return;

  const urlInput = document.getElementById('zaloModalUrlInput');
  const directLink = document.getElementById('zaloModalDirectLink');
  const qrImg = document.getElementById('zaloModalQrImg');

  try {
    const res = await fetch('/api/server-info');
    if (res.ok) {
      const data = await res.json();
      if (data.zalo_test_url) {
        currentZaloTestUrl = data.zalo_test_url;
      }
    }
  } catch (e) {}

  if (urlInput) urlInput.value = currentZaloTestUrl;
  if (directLink) directLink.href = currentZaloTestUrl;
  if (qrImg) {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentZaloTestUrl)}`;
  }

  modal.classList.remove('hidden');
}

function closeZaloModal() {
  const modal = document.getElementById('modalZaloApp');
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

function resetToRenderServer() {
  localStorage.removeItem('pos_server_url');
  const input = document.getElementById('inputServerUrl');
  if (input) input.value = DEFAULT_CLOUD_SERVER;
  saveServerConfig();
}

function saveServerConfig() {
  const input = document.getElementById('inputServerUrl');
  if (!input) return;

  const url = input.value.trim();
  if (url && url !== DEFAULT_CLOUD_SERVER) {
    localStorage.setItem('pos_server_url', url);
  } else {
    localStorage.removeItem('pos_server_url');
  }

  showToast('Đã lưu địa chỉ máy chủ Render!', 'success');
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

  // Khởi động nhịp tim định danh thiết bị
  sendDeviceHeartbeat();
  setInterval(sendDeviceHeartbeat, 10000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
