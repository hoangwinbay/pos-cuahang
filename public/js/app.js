// Global State & Core Helper functions

const state = {
  activeTab: 'pos',
  products: [],
  categories: [],
  cart: [],
  settings: {},
  banks: [],
  users: [],
  currentUser: null,
  token: localStorage.getItem('pos_token') || null,
  networkInfo: null,
  currentOrderInView: null
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

  toast.className = `${bgClass} px-4 py-2.5 rounded-xl shadow-lg flex items-center space-x-2 text-xs sm:text-sm pointer-events-auto transform transition-all duration-300 translate-y-2 opacity-0 z-50`;
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
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
// AUTHENTICATION & ROLE-BASED ACCESS CONTROL (RBAC)
// =============================================================
async function initAuth() {
  try {
    if (state.token) {
      const data = await api('/api/auth/me');
      state.currentUser = data.user;
    } else {
      // Default auto-login to Admin on first local PC visit
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

// Apply permissions to UI elements based on role (Admin vs Staff)
function applyUserRolePermissions() {
  const user = state.currentUser;
  const tabReports = document.getElementById('tab-reports');
  const tabSettings = document.getElementById('tab-settings');
  const btnQuickAdd = document.getElementById('btnQuickAddProduct');
  const prodAdminBtns = document.getElementById('productAdminButtons');
  const cancelOrderBtn = document.getElementById('btnCancelOrder');

  const roleIcon = document.getElementById('userRoleIcon');
  const nameDisplay = document.getElementById('userNameDisplay');
  const roleDisplay = document.getElementById('userRoleDisplay');

  if (!user) {
    if (roleIcon) roleIcon.textContent = '❓';
    if (nameDisplay) nameDisplay.textContent = 'Chưa đăng nhập';
    if (roleDisplay) roleDisplay.textContent = 'Bấm để đăng nhập';
    return;
  }

  const isAdmin = user.role === 'admin';

  // Update header badge
  if (roleIcon) roleIcon.textContent = isAdmin ? '👑' : '👤';
  if (nameDisplay) nameDisplay.textContent = user.name;
  if (roleDisplay) {
    roleDisplay.textContent = isAdmin ? 'Chủ quán (Toàn quyền)' : 'Nhân viên thu ngân';
    roleDisplay.className = `text-[10px] font-semibold leading-none ${isAdmin ? 'text-blue-600' : 'text-emerald-600'}`;
  }

  // Hide or show Owner-only tabs
  if (tabReports) tabReports.style.display = isAdmin ? 'flex' : 'none';
  if (tabSettings) tabSettings.style.display = isAdmin ? 'flex' : 'none';
  if (btnQuickAdd) btnQuickAdd.style.display = isAdmin ? 'flex' : 'none';
  if (prodAdminBtns) prodAdminBtns.style.display = isAdmin ? 'flex' : 'none';
  if (cancelOrderBtn) cancelOrderBtn.style.display = isAdmin ? 'flex' : 'none';

  // Hide cost price & action columns if staff
  const costHeaders = document.querySelectorAll('.col-cost-price');
  costHeaders.forEach(el => el.style.display = isAdmin ? '' : 'none');

  const actionHeaders = document.querySelectorAll('.col-product-actions');
  actionHeaders.forEach(el => el.style.display = isAdmin ? '' : 'none');

  // If staff is currently viewing a restricted tab, redirect to POS
  if (!isAdmin && (state.activeTab === 'reports' || state.activeTab === 'settings')) {
    switchTab('pos');
  }
}

// Fast demo login
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
    showToast(`Đã chuyển sang tài khoản: ${res.user.name} (${res.user.role === 'admin' ? 'Chủ quán' : 'Nhân viên'})`);

    // Reload products & reports
    if (typeof loadPosProducts === 'function') loadPosProducts();
    if (state.activeTab === 'products' && typeof loadProductsTable === 'function') loadProductsTable();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// PIN Login handler
async function handlePinLogin(e) {
  e.preventDefault();
  const pin = document.getElementById('loginPinInput').value.trim();
  if (!pin) {
    showToast('Vui lòng nhập mã PIN', 'error');
    return;
  }

  try {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ pin })
    });

    state.token = res.token;
    state.currentUser = res.user;
    localStorage.setItem('pos_token', res.token);

    document.getElementById('loginPinInput').value = '';
    closeLoginModal();
    applyUserRolePermissions();
    showToast(`Xin chào ${res.user.name}!`);

    if (typeof loadPosProducts === 'function') loadPosProducts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Username / Password Login handler
async function handlePassLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!username || !password) {
    showToast('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu', 'error');
    return;
  }

  try {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    state.token = res.token;
    state.currentUser = res.user;
    localStorage.setItem('pos_token', res.token);

    closeLoginModal();
    applyUserRolePermissions();
    showToast(`Xin chào ${res.user.name}!`);

    if (typeof loadPosProducts === 'function') loadPosProducts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function handleLogout() {
  state.currentUser = null;
  state.token = null;
  localStorage.removeItem('pos_token');
  applyUserRolePermissions();
  showToast('Đã đăng xuất tài khoản');
  openLoginModal();
}

function openLoginModal() {
  document.getElementById('loginModal').classList.remove('hidden');
  const pinInput = document.getElementById('loginPinInput');
  if (pinInput) setTimeout(() => pinInput.focus(), 100);
}

function closeLoginModal() {
  document.getElementById('loginModal').classList.add('hidden');
}

function setLoginMethod(method) {
  const pinTab = document.getElementById('tabLoginPin');
  const passTab = document.getElementById('tabLoginPassword');
  const pinForm = document.getElementById('pinLoginForm');
  const passForm = document.getElementById('passLoginForm');

  if (method === 'pin') {
    pinTab.className = 'py-1.5 rounded-lg text-xs font-bold bg-white text-blue-600 shadow-2xs transition-all';
    passTab.className = 'py-1.5 rounded-lg text-xs font-semibold text-slate-600 transition-all';
    pinForm.classList.remove('hidden');
    passForm.classList.add('hidden');
    document.getElementById('loginPinInput').focus();
  } else {
    passTab.className = 'py-1.5 rounded-lg text-xs font-bold bg-white text-blue-600 shadow-2xs transition-all';
    pinTab.className = 'py-1.5 rounded-lg text-xs font-semibold text-slate-600 transition-all';
    passForm.classList.remove('hidden');
    pinForm.classList.add('hidden');
    document.getElementById('loginUsername').focus();
  }
}

// =============================================================
// MOBILE CONNECTION MODAL & LAN QR CODE
// =============================================================
async function openMobileConnectModal() {
  try {
    if (!state.networkInfo) {
      state.networkInfo = await api('/api/network/info');
    }

    const mobileUrl = state.networkInfo.mobileUrl;
    document.getElementById('mobileUrlDisplay').value = mobileUrl;

    // Use reliable dynamic QR generator API
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(mobileUrl)}`;
    document.getElementById('mobileQrImg').src = qrApiUrl;

    document.getElementById('mobileConnectModal').classList.remove('hidden');
  } catch (err) {
    showToast('Không thể lấy thông tin mạng nội bộ: ' + err.message, 'error');
  }
}

function closeMobileConnectModal() {
  document.getElementById('mobileConnectModal').classList.add('hidden');
}

function copyMobileUrl() {
  const input = document.getElementById('mobileUrlDisplay');
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    showToast('Đã sao chép liên kết vào bộ nhớ tạm!');
  }).catch(() => {
    document.execCommand('copy');
    showToast('Đã sao chép liên kết!');
  });
}

// Mobile Slide-over Drawer toggle
function toggleMobileCart(open) {
  const drawer = document.getElementById('posCartPanel');
  const backdrop = document.getElementById('mobileCartBackdrop');
  if (open) {
    drawer.classList.add('drawer-open');
    backdrop.classList.add('drawer-open');
  } else {
    drawer.classList.remove('drawer-open');
    backdrop.classList.remove('drawer-open');
  }
}

// =============================================================
// USER ACCOUNTS MANAGEMENT (ADMIN ONLY)
// =============================================================
async function loadUsersList() {
  if (!state.currentUser || state.currentUser.role !== 'admin') return;
  try {
    const users = await api('/api/users');
    state.users = users;

    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    tbody.innerHTML = users.map(u => {
      const isMe = u.id === state.currentUser.id;
      const isAdmin = u.role === 'admin';
      return `
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="px-3 py-2 font-bold text-slate-800">
            ${u.name} ${isMe ? '<span class="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded font-semibold ml-1">Đang dùng</span>' : ''}
          </td>
          <td class="px-3 py-2 font-mono font-semibold text-slate-600">${u.username}</td>
          <td class="px-3 py-2 text-center">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isAdmin ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}">
              ${isAdmin ? '👑 Chủ quán' : '👤 Nhân viên'}
            </span>
          </td>
          <td class="px-3 py-2 text-center font-mono font-bold text-slate-700">${u.pin || '----'}</td>
          <td class="px-3 py-2 text-center">
            <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${u.active ? 'text-emerald-700 bg-emerald-50' : 'text-slate-400 bg-slate-100'}">
              ${u.active ? 'Hoạt động' : 'Tạm khóa'}
            </span>
          </td>
          <td class="px-3 py-2 text-center">
            <div class="inline-flex items-center space-x-1.5">
              <button onclick="editUser(${u.id})" class="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Sửa thông tin">
                <i class="fa-solid fa-pen"></i>
              </button>
              ${!isMe ? `
              <button onclick="deleteUser(${u.id}, '${u.name.replace(/'/g, "\\'")}')" class="p-1 text-rose-500 hover:bg-rose-50 rounded" title="Xóa tài khoản">
                <i class="fa-regular fa-trash-can"></i>
              </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load users list:', err);
  }
}

function openCreateUserModal() {
  document.getElementById('userForm').reset();
  document.getElementById('userEditId').value = '';
  document.getElementById('userModalTitle').textContent = 'Thêm Tài Khoản Nhân Viên';
  document.getElementById('userFormUsername').readOnly = false;
  document.getElementById('userFormRole').value = 'staff';
  document.getElementById('userFormPin').value = String(Math.floor(1000 + Math.random() * 9000));
  document.getElementById('userModal').classList.remove('hidden');
}

function editUser(id) {
  const u = state.users.find(item => item.id === id);
  if (!u) return;

  document.getElementById('userEditId').value = u.id;
  document.getElementById('userModalTitle').textContent = 'Chỉnh Sửa Tài Khoản';
  document.getElementById('userFormName').value = u.name;
  document.getElementById('userFormUsername').value = u.username;
  document.getElementById('userFormUsername').readOnly = true;
  document.getElementById('userFormPassword').value = '';
  document.getElementById('userFormPassword').placeholder = '(Để trống nếu giữ nguyên)';
  document.getElementById('userFormPin').value = u.pin || '';
  document.getElementById('userFormRole').value = u.role;

  document.getElementById('userModal').classList.remove('hidden');
}

function closeUserModal() {
  document.getElementById('userModal').classList.add('hidden');
}

async function saveUser(e) {
  e.preventDefault();
  const id = document.getElementById('userEditId').value;
  const name = document.getElementById('userFormName').value.trim();
  const username = document.getElementById('userFormUsername').value.trim();
  const password = document.getElementById('userFormPassword').value;
  const pin = document.getElementById('userFormPin').value.trim();
  const role = document.getElementById('userFormRole').value;

  try {
    if (id) {
      const payload = { name, role, pin };
      if (password) payload.password = password;
      await api(`/api/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast('Cập nhật tài khoản thành công!');
    } else {
      if (!password) {
        showToast('Vui lòng nhập mật khẩu', 'error');
        return;
      }
      await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({ name, username, password, pin, role })
      });
      showToast('Đã thêm tài khoản nhân viên thành công!');
    }

    closeUserModal();
    loadUsersList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteUser(id, name) {
  if (confirm(`Bạn có chắc muốn xóa tài khoản nhân viên "${name}"?`)) {
    try {
      await api(`/api/users/${id}`, { method: 'DELETE' });
      showToast(`Đã xóa tài khoản "${name}"`);
      loadUsersList();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

// Tab navigation
function switchTab(tabName) {
  // Check permission for staff
  if (state.currentUser && state.currentUser.role === 'staff') {
    if (tabName === 'reports' || tabName === 'settings') {
      showToast('Chỉ tài khoản Chủ Cửa Hàng mới có quyền truy cập mục này!', 'error');
      return;
    }
  }

  state.activeTab = tabName;
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active', 'bg-white', 'text-blue-600', 'shadow-sm');
    btn.classList.add('text-slate-600');
  });

  const activeBtn = document.getElementById(`tab-${tabName}`);
  if (activeBtn) {
    activeBtn.classList.add('active', 'bg-white', 'text-blue-600', 'shadow-sm');
    activeBtn.classList.remove('text-slate-600');
  }

  document.querySelectorAll('.tab-view').forEach(view => {
    view.classList.add('hidden');
    view.classList.remove('flex');
  });

  const activeView = document.getElementById(`view-${tabName}`);
  if (activeView) {
    activeView.classList.remove('hidden');
    activeView.classList.add('flex');
  }

  if (tabName === 'pos') {
    const searchInput = document.getElementById('posSearchInput');
    if (searchInput) searchInput.focus();
  } else if (tabName === 'products') {
    loadProductsTable();
  } else if (tabName === 'orders') {
    loadOrdersList();
  } else if (tabName === 'reports') {
    loadDashboardReports();
  } else if (tabName === 'settings') {
    populateSettingsForm();
    loadUsersList();
  }
}

// Live Clock updater
function initLiveClock() {
  const clockEl = document.getElementById('liveClock');
  if (!clockEl) return;
  function update() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
  update();
  setInterval(update, 1000);
}

// Load and apply store settings
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

// Populate Settings Form
async function populateSettingsForm() {
  try {
    await loadSettings();
    document.getElementById('setting_store_name').value = state.settings.store_name || '';
    document.getElementById('setting_store_address').value = state.settings.store_address || '';
    document.getElementById('setting_store_phone').value = state.settings.store_phone || '';
    document.getElementById('setting_store_greeting').value = state.settings.store_greeting || '';
    document.getElementById('setting_paper_size').value = state.settings.paper_size || '80mm';

    const banksSelect = document.getElementById('setting_bank_id');
    if (banksSelect && state.banks.length > 0) {
      banksSelect.innerHTML = state.banks.map(b => `
        <option value="${b.code}" ${b.code === state.settings.bank_id ? 'selected' : ''}>${b.name}</option>
      `).join('');
    }

    document.getElementById('setting_bank_account_no').value = state.settings.bank_account_no || '';
    document.getElementById('setting_bank_account_name').value = state.settings.bank_account_name || '';
  } catch (err) {
    showToast('Lỗi khi tải cài đặt', 'error');
  }
}

// Save Settings Form
async function saveSettings(e) {
  e.preventDefault();
  try {
    const data = {
      store_name: document.getElementById('setting_store_name').value.trim(),
      store_address: document.getElementById('setting_store_address').value.trim(),
      store_phone: document.getElementById('setting_store_phone').value.trim(),
      store_greeting: document.getElementById('setting_store_greeting').value.trim(),
      paper_size: document.getElementById('setting_paper_size').value,
      bank_id: document.getElementById('setting_bank_id').value,
      bank_account_no: document.getElementById('setting_bank_account_no').value.trim(),
      bank_account_name: document.getElementById('setting_bank_account_name').value.trim().toUpperCase()
    };

    await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(data)
    });

    state.settings = { ...state.settings, ...data };
    document.getElementById('headerStoreName').textContent = data.store_name;
    showToast('Đã lưu cấu hình cửa hàng thành công!');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Global Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeCheckoutModal();
    closeProductModal();
    closeOrderDetailModal();
    closeMobileConnectModal();
    closeLoginModal();
    closeUserModal();
    toggleMobileCart(false);
    return;
  }

  if (e.key === 'F1') {
    e.preventDefault();
    switchTab('pos');
    return;
  }

  if (e.key === 'F2') {
    e.preventDefault();
    if (state.activeTab === 'pos') {
      const search = document.getElementById('posSearchInput');
      if (search) search.focus();
    } else {
      switchTab('products');
    }
    return;
  }

  if (e.key === 'F3') {
    e.preventDefault();
    switchTab('orders');
    return;
  }

  if (e.key === 'F4') {
    e.preventDefault();
    switchTab('reports');
    return;
  }

  if (e.key === 'F9') {
    e.preventDefault();
    if (state.activeTab === 'pos' && state.cart.length > 0) {
      openCheckoutModal();
    }
    return;
  }
});

// Download DB backup file
function downloadDatabaseBackup() {
  if (!state.currentUser || state.currentUser.role !== 'admin') {
    showToast('Chỉ chủ cửa hàng mới có quyền sao lưu dữ liệu!', 'error');
    return;
  }
  const token = state.token;
  fetch('/api/backup/download', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
    .then(res => {
      if (!res.ok) throw new Error('Lỗi khi tải file backup');
      return res.blob();
    })
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pos_backup_${new Date().toISOString().slice(0, 10)}.db`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Đã tải file sao lưu cơ sở dữ liệu về máy thành công!');
    })
    .catch(err => showToast(err.message, 'error'));
}

// Export JSON backup file
function exportJsonBackup() {
  if (!state.currentUser || state.currentUser.role !== 'admin') {
    showToast('Chỉ chủ cửa hàng mới có quyền sao lưu dữ liệu!', 'error');
    return;
  }
  const token = state.token;
  fetch('/api/backup/export-json', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
    .then(res => {
      if (!res.ok) throw new Error('Lỗi khi xuất dữ liệu');
      return res.blob();
    })
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pos_data_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Đã xuất toàn bộ dữ liệu ra file JSON thành công!');
    })
    .catch(err => showToast(err.message, 'error'));
}

// App Initialization
document.addEventListener('DOMContentLoaded', async () => {
  initLiveClock();
  
  // Register Service Worker for Mobile PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  try {
    state.banks = await api('/api/vietqr/banks');
  } catch (e) {}

  await initAuth();
  await loadSettings();
  await initPos();
});
