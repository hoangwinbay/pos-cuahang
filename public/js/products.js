// =============================================================
// POS ORDER - THỰC ĐƠN & CÀI ĐẶT VIETQR (DÀNH CHO CHỦ QUÁN)
// =============================================================

let menuDishesCache = [];

// Kiểm tra chuỗi có phải ảnh thực sự không (base64 hoặc URL)
function isActualImage(str) {
  return typeof str === 'string' && (str.startsWith('data:image') || str.startsWith('http') || str.startsWith('/'));
}

// Tải danh sách món cho mục Thực đơn (Tab 3)
async function loadMenuDishes() {
  try {
    const [products, categories] = await Promise.all([
      api('/api/products'),
      api('/api/categories')
    ]);

    menuDishesCache = products;
    state.products = products;
    state.categories = categories;

    // Cập nhật danh mục trong modal thêm món
    const modalCatSelect = document.getElementById('dishCategory');
    if (modalCatSelect) {
      modalCatSelect.innerHTML = categories.map(c => `
        <option value="${c.id}">${c.name}</option>
      `).join('');
    }

    renderMenuDishesList(products);
  } catch (err) {
    showToast('Lỗi khi tải danh sách món: ' + err.message, 'error');
  }
}

// Hiển thị danh sách món ăn trong Tab 3
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

  container.innerHTML = dishes.map(d => {
    const hasImage = isActualImage(d.image);

    return `
      <div class="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
        <div class="flex items-center space-x-3 min-w-0">
          ${hasImage ? `
            <img src="${d.image}" alt="${d.name}" class="w-12 h-12 rounded-xl object-cover shrink-0 border border-slate-200 shadow-2xs">
          ` : `
            <div class="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-300 text-base shrink-0 border border-slate-200">
              <i class="fa-regular fa-image"></i>
            </div>
          `}
          <div class="min-w-0">
            <h4 class="font-bold text-xs sm:text-sm text-slate-800 truncate">${d.name}</h4>
            <div class="flex items-center space-x-2 mt-0.5">
              <span class="text-xs font-black text-emerald-700">${formatMoney(d.price)}</span>
              <span class="text-[10px] text-slate-400">• ${d.category_name || 'Chung'}</span>
            </div>
          </div>
        </div>

        <!-- Nút Sửa / Xóa -->
        <div class="flex items-center space-x-1.5 shrink-0">
          <button 
            onclick="openEditDishModal(${d.id})" 
            class="px-2.5 py-1.5 bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1"
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
    `;
  }).join('');
}

// =============================================================
// XỬ LÝ TẢI ẢNH MÓN TỪ ĐIỆN THOẠI / MÁY TÍNH
// =============================================================
function handleDishImageUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  showToast('Đang nén và tải ảnh lên...');

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      // Tự động thu nhỏ ảnh xuống tối đa 480px để tải siêu nhanh (chỉ ~30KB-50KB)
      const maxDim = 480;
      let width = img.width;
      let height = img.height;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);

      // Cập nhật giao diện xem trước
      document.getElementById('dishImageBase64').value = compressedBase64;
      const preview = document.getElementById('dishImagePreview');
      preview.src = compressedBase64;
      preview.classList.remove('hidden');
      document.getElementById('dishImagePlaceholder').classList.add('hidden');
      document.getElementById('btnRemoveDishImage').classList.remove('hidden');

      showToast('Đã chọn ảnh thành công!');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removeDishImage() {
  document.getElementById('dishImageBase64').value = '';
  const fileInput = document.getElementById('dishFileInput');
  if (fileInput) fileInput.value = '';

  const preview = document.getElementById('dishImagePreview');
  preview.src = '';
  preview.classList.add('hidden');
  document.getElementById('dishImagePlaceholder').classList.remove('hidden');
  document.getElementById('btnRemoveDishImage').classList.add('hidden');
}

// =============================================================
// MODAL: THÊM / SỬA MÓN
// =============================================================
function openAddDishModal() {
  document.getElementById('dishForm').reset();
  document.getElementById('dishEditId').value = '';
  document.getElementById('dishModalTitle').textContent = 'Thêm Món Mới';
  removeDishImage();
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

  if (dish.category_id) {
    document.getElementById('dishCategory').value = dish.category_id;
  }

  // Hiển thị ảnh nếu có
  if (isActualImage(dish.image)) {
    document.getElementById('dishImageBase64').value = dish.image;
    const preview = document.getElementById('dishImagePreview');
    preview.src = dish.image;
    preview.classList.remove('hidden');
    document.getElementById('dishImagePlaceholder').classList.add('hidden');
    document.getElementById('btnRemoveDishImage').classList.remove('hidden');
  } else {
    removeDishImage();
  }

  document.getElementById('dishModal').classList.remove('hidden');
}

function closeDishModal() {
  document.getElementById('dishModal').classList.add('hidden');
}

// Lưu món (Thêm mới hoặc Cập nhật)
async function saveDish(e) {
  e.preventDefault();

  const id = document.getElementById('dishEditId').value;
  const name = document.getElementById('dishName').value.trim();
  const price = Number(document.getElementById('dishPrice').value) || 0;
  const image = document.getElementById('dishImageBase64').value.trim() || '';
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
      showToast(`Đã cập nhật món "${name}"!`);
    } else {
      await api('/api/products', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast(`Đã thêm món "${name}" thành công!`);
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
