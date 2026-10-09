// =============================================================
// POS ORDER - THỰC ĐƠN & CÀI ĐẶT VIETQR (DÀNH CHO CHỦ QUÁN)
// =============================================================

let menuDishesCache = [];

// Load dishes for Owner's Menu Management (Tab 3)
async function loadMenuDishes() {
  try {
    const [products, categories] = await Promise.all([
      api('/api/products'),
      api('/api/categories')
    ]);

    menuDishesCache = products;
    state.products = products;
    state.categories = categories;

    // Populate category dropdown in Add/Edit Dish Modal
    const modalCatSelect = document.getElementById('dishCategory');
    if (modalCatSelect) {
      modalCatSelect.innerHTML = categories.map(c => `
        <option value="${c.id}">${c.icon || '☕'} ${c.name}</option>
      `).join('');
    }

    renderMenuDishesList(products);
  } catch (err) {
    showToast('Lỗi khi tải danh sách món: ' + err.message, 'error');
  }
}

// Render list of dishes in Tab 3
function renderMenuDishesList(dishes) {
  const container = document.getElementById('menuDishesList');
  const countEl = document.getElementById('menuTotalCount');
  if (!container) return;

  if (countEl) countEl.textContent = `${dishes.length} món`;

  if (!dishes || dishes.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-400 text-xs">
        Chưa có món nào. Bấm "+ Thêm Món Mới" để tạo món đầu tiên!
      </div>
    `;
    return;
  }

  container.innerHTML = dishes.map(d => `
    <div class="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
      <div class="flex items-center space-x-3 min-w-0">
        <span class="text-2xl sm:text-3xl shrink-0 w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
          ${d.image || '☕'}
        </span>
        <div class="min-w-0">
          <h4 class="font-bold text-xs sm:text-sm text-slate-800 truncate">${d.name}</h4>
          <div class="flex items-center space-x-2 mt-0.5">
            <span class="text-xs font-black text-blue-600">${formatMoney(d.price)}</span>
            <span class="text-[10px] text-slate-400">• ${d.category_name || 'Chung'}</span>
          </div>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="flex items-center space-x-1.5 shrink-0">
        <button 
          onclick="openEditDishModal(${d.id})" 
          class="px-2.5 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1"
          title="Sửa tên, giá, ảnh món"
        >
          <i class="fa-solid fa-pen text-[11px]"></i>
          <span class="hidden sm:inline">Sửa</span>
        </button>

        <button 
          onclick="deleteDish(${d.id}, '${d.name.replace(/'/g, "\\'")}')" 
          class="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg text-xs transition-colors"
          title="Xóa món"
        >
          <i class="fa-regular fa-trash-can"></i>
        </button>
      </div>
    </div>
  `).join('');
}

// =============================================================
// MODAL: THÊM / SỬA MÓN
// =============================================================
function openAddDishModal() {
  document.getElementById('dishForm').reset();
  document.getElementById('dishEditId').value = '';
  document.getElementById('dishModalTitle').textContent = 'Thêm Món Mới';
  document.getElementById('dishImage').value = '☕';
  document.getElementById('dishModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('dishName').focus(), 80);
}

function openEditDishModal(id) {
  const dish = menuDishesCache.find(d => d.id === id);
  if (!dish) return;

  document.getElementById('dishEditId').value = dish.id;
  document.getElementById('dishModalTitle').textContent = 'Chỉnh Sửa Món';
  document.getElementById('dishName').value = dish.name;
  document.getElementById('dishPrice').value = dish.price;
  document.getElementById('dishImage').value = dish.image || '☕';
  if (dish.category_id) {
    document.getElementById('dishCategory').value = dish.category_id;
  }

  document.getElementById('dishModal').classList.remove('hidden');
}

function closeDishModal() {
  document.getElementById('dishModal').classList.add('hidden');
}

function setDishEmoji(emoji) {
  document.getElementById('dishImage').value = emoji;
}

// Lưu món (Thêm mới hoặc Cập nhật)
async function saveDish(e) {
  e.preventDefault();

  const id = document.getElementById('dishEditId').value;
  const name = document.getElementById('dishName').value.trim();
  const price = Number(document.getElementById('dishPrice').value) || 0;
  const image = document.getElementById('dishImage').value.trim() || '☕';
  const category_id = Number(document.getElementById('dishCategory').value) || null;

  if (!name || price <= 0) {
    showToast('Vui lòng nhập tên món và giá tiền hợp lệ', 'error');
    return;
  }

  try {
    const payload = { name, price, image, category_id };

    if (id) {
      await api(`/api/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast(`Đã cập nhật món "${name}"`);
    } else {
      await api('/api/products', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast(`Đã thêm món mới: "${name}"!`);
    }

    closeDishModal();
    await loadMenuDishes();
    if (typeof loadPosProducts === 'function') loadPosProducts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Xóa món khỏi menu
async function deleteDish(id, name) {
  if (!confirm(`Bạn có chắc muốn xóa món "${name}" khỏi thực đơn?`)) return;

  try {
    await api(`/api/products/${id}`, { method: 'DELETE' });
    showToast(`Đã xóa món "${name}"`);
    await loadMenuDishes();
    if (typeof loadPosProducts === 'function') loadPosProducts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// =============================================================
// CÀI ĐẶT VIETQR ĐỂ TẠO MÃ THANH TOÁN
// =============================================================
async function populateVietQrSettings() {
  try {
    await loadSettings();

    // Populate banks dropdown
    const bankSelect = document.getElementById('setting_bank_id');
    if (bankSelect && state.banks.length > 0) {
      bankSelect.innerHTML = state.banks.map(b => `
        <option value="${b.code}" ${b.code === (state.settings.bank_id || 'MB') ? 'selected' : ''}>
          ${b.code} - ${b.name}
        </option>
      `).join('');
    }

    document.getElementById('setting_bank_account_no').value = state.settings.bank_account_no || '';
    document.getElementById('setting_bank_account_name').value = state.settings.bank_account_name || '';
  } catch (err) {
    console.error('Lỗi tải cài đặt VietQR:', err);
  }
}

async function saveVietQrSettings(e) {
  e.preventDefault();

  try {
    const payload = {
      bank_id: document.getElementById('setting_bank_id').value,
      bank_account_no: document.getElementById('setting_bank_account_no').value.trim(),
      bank_account_name: document.getElementById('setting_bank_account_name').value.trim().toUpperCase()
    };

    await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    state.settings = { ...state.settings, ...payload };
    showToast('Đã lưu tài khoản nhận tiền VietQR thành công!');
  } catch (err) {
    showToast(err.message, 'error');
  }
}
