// =============================================================
// POS ORDER - CORE APP & STATE MANAGEMENT
// =============================================================

const state = {
  activeTab: 'pos',
  selectedTable: 'Bàn 1',
  products: [],
  categories: [],
  cart: [],
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
  const bgClass = type === 'success' ? 'bg-emerald-600 text-white' : type === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-white';
  const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info';

  toast.className = `${bgClass} px-3.5 py-2 rounded-xl shadow-lg flex items-center space-x-2 text-xs font-semibold pointer-events-auto transform transition-all duration-300 translate-y-2 opacity-0 z-50`;
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
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
      throw new Error(data.error || 'Có lỗi xảy ra khi gọi máy chủ');
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

// Apply role permissions to UI
function applyUserRolePermissions() {
  const user = state.currentUser;
  const tabReports = document.getElementById('tab-reports');
  const tabMenu = document.getElementById('tab-menu');
  const roleIcon = document.getElementById('userRoleIcon');
  const nameDisplay = document.getElementById('userNameDisplay');

  if (!user) {
    if (roleIcon) roleIcon.textContent = '❓';
    if (nameDisplay) nameDisplay.textContent = 'Đăng nhập';
    return;
  }

  const isAdmin = user.role === 'admin';

  if (roleIcon) roleIcon.textContent = isAdmin ? '👑' : '👤';
  if (nameDisplay) nameDisplay.textContent = isAdmin ? 'Chủ Quán' : 'Nhân Viên';

  // Only Owner sees Thống Kê & Thực Đơn
  if (tabReports) tabReports.style.display = isAdmin ? 'flex' : 'none';
  if (tabMenu) tabMenu.style.display = isAdmin ? 'flex' : 'none';

  // If staff is currently on restricted tab, switch back to pos
  if (!isAdmin && (state.activeTab === 'reports' || state.activeTab === 'menu')) {
    switchTab('pos');
  }
}

// Fast switch between Admin and Staff role
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
    showToast(`Đã chuyển vai trò: ${res.user.role === 'admin' ? '👑 Chủ Quán' : '👤 Nhân Viên'}`);

    if (state.activeTab === 'pos') {
      if (typeof loadPosProducts === 'function') loadPosProducts();
    } else if (state.activeTab === 'reports') {
      if (typeof loadDashboardReports === 'function') loadDashboardReports();
    } else if (state.activeTab === 'menu') {
      if (typeof loadMenuDishes === 'function') loadMenuDishes();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openLoginModal() {
  const modal = document.getElementById('loginModal');
  if (modal) modal.classList.remove('hidden');
}

function closeLoginModal() {
  const modal = document.getElementById('loginModal');
  if (modal) modal.classList.add('hidden');
}

// Mobile Slide-over Drawer toggle
function toggleMobileCart(open) {
  const drawer = document.getElementById('posCartPanel');
  const backdrop = document.getElementById('mobileCartBackdrop');
  if (!drawer || !backdrop) return;

  if (open) {
    drawer.classList.add('drawer-open');
    backdrop.classList.add('drawer-open');
  } else {
    drawer.classList.remove('drawer-open');
    backdrop.classList.remove('drawer-open');
  }
}

// =============================================================
// TAB NAVIGATION (Gọi Món / Thống Kê / Thực Đơn)
// =============================================================
function switchTab(tabName) {
  // Permission check: only admin can access reports and menu
  if (state.currentUser && state.currentUser.role !== 'admin') {
    if (tabName === 'reports' || tabName === 'menu') {
      showToast('Mục này chỉ dành cho tài khoản Chủ Quán!', 'error');
      return;
    }
  }

  state.activeTab = tabName;

  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active', 'bg-white', 'text-blue-600', 'shadow-xs');
    btn.classList.add('text-slate-600');
  });

  const activeBtn = document.getElementById(`tab-${tabName}`);
  if (activeBtn) {
    activeBtn.classList.add('active', 'bg-white', 'text-blue-600', 'shadow-xs');
    activeBtn.classList.remove('text-slate-600');
  }

  // Update tab views
  document.querySelectorAll('.tab-view').forEach(view => {
    view.classList.add('hidden');
    view.classList.remove('flex');
  });

  const activeView = document.getElementById(`view-${tabName}`);
  if (activeView) {
    activeView.classList.remove('hidden');
    activeView.classList.add('flex');
  }

  // Tab specific lifecycle actions
  if (tabName === 'pos') {
    const search = document.getElementById('posSearchInput');
    if (search && window.innerWidth >= 1024) search.focus();
  } else if (tabName === 'reports') {
    if (typeof loadDashboardReports === 'function') loadDashboardReports();
    if (typeof loadOrdersList === 'function') loadOrdersList();
  } else if (tabName === 'menu') {
    if (typeof loadMenuDishes === 'function') loadMenuDishes();
    if (typeof populateVietQrSettings === 'function') populateVietQrSettings();
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
    if (headerEl && data.store_name) {
      headerEl.textContent = data.store_name;
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

// Global Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (typeof closeCheckoutModal === 'function') closeCheckoutModal();
    if (typeof closeDishModal === 'function') closeDishModal();
    if (typeof closePrinterModal === 'function') closePrinterModal();
    closeLoginModal();
    toggleMobileCart(false);
  }
});

// App Initialization
document.addEventListener('DOMContentLoaded', async () => {
  // Service Worker for Mobile PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  try {
    state.banks = await api('/api/vietqr/banks');
  } catch (e) {}

  await initAuth();
  await loadSettings();
  if (typeof initPos === 'function') {
    await initPos();
  }
});
