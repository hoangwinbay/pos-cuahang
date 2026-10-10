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

// API Helper with Bearer token injection
async function api(url, options = {}) {
  try {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (state.token) {
      headers['Authorization'] = `Bearer ${state.token}`;
    }

    const res = await fetch(url, {
      ...options,
      headers
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        openLoginModal();
      }
      const errorObj = new Error(data.error || data.message || 'Có lỗi xảy ra khi gọi máy chủ');
      errorObj.status = res.status;
      errorObj.data = data;
      throw errorObj;
    }
    return data;
  } catch (err) {
    console.error('API Error:', err);
    throw err;
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
    console.warn('Session expired or login needed:', err.message);
    state.currentUser = null;
    state.token = null;
    localStorage.removeItem('pos_token');
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
    console.error('Failed to load settings:', err);
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
    closeLoginModal();
    toggleSideDrawer(false);
  }
});

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
document.addEventListener('DOMContentLoaded', async () => {
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
});
