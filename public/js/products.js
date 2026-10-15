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

    renderCategoriesList(categories);
    renderMenuDishesList(products);
    renderManageTablesList();
  } catch (err) {
    showToast('Lỗi khi tải danh sách món: ' + err.message, 'error');
  }
}

// Hiển thị danh sách danh mục trong mục Quản lý thực đơn
function renderCategoriesList(categories) {
  const container = document.getElementById('categoriesListContainer');
  if (!container) return;

  if (!categories || categories.length === 0) {
    container.innerHTML = '<span class="text-xs text-slate-400 italic">Chưa có danh mục nào. Bấm "+ Thêm Danh Mục" để tạo!</span>';
    return;
  }

  container.innerHTML = categories.map(cat => {
    const name = cat.name;
    const count = cat.product_count !== undefined ? cat.product_count : 0;
    return `
      <div class="inline-flex items-center space-x-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-medium transition-all group">
        <span class="font-bold text-slate-800">${name}</span>
        <span class="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.5 rounded-full font-bold">${count} món</span>
        <div class="flex items-center space-x-1 pl-1.5 border-l border-slate-200 ml-1">
          <button onclick="openEditCategoryModal(${cat.id}, '${name.replace(/'/g, "\\'")}')" class="p-1 text-slate-400 hover:text-emerald-600 rounded transition-colors" title="Sửa danh mục">
            <i class="fa-solid fa-pen text-[11px]"></i>
          </button>
          <button onclick="deleteCategory(${cat.id}, '${name.replace(/'/g, "\\'")}', ${count})" class="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors" title="Xóa danh mục">
            <i class="fa-regular fa-trash-can text-[11px]"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// =============================================================
// MODAL: THÊM / SỬA / XÓA DANH MỤC THỰC ĐƠN
// =============================================================
function openCategoryModal() {
  document.getElementById('categoryForm')?.reset();
  const idEl = document.getElementById('categoryEditId');
  const titleEl = document.getElementById('categoryModalTitle');
  if (idEl) idEl.value = '';
  if (titleEl) titleEl.textContent = 'Thêm Danh Mục Mới';
  document.getElementById('categoryModal')?.classList.remove('hidden');
  setTimeout(() => document.getElementById('categoryNameInput')?.focus(), 80);
}

function openEditCategoryModal(id, name) {
  const idEl = document.getElementById('categoryEditId');
  const nameEl = document.getElementById('categoryNameInput');
  const titleEl = document.getElementById('categoryModalTitle');
  if (idEl) idEl.value = id;
  if (nameEl) nameEl.value = name;
  if (titleEl) titleEl.textContent = 'Chỉnh Sửa Danh Mục';
  document.getElementById('categoryModal')?.classList.remove('hidden');
  setTimeout(() => nameEl?.focus(), 80);
}

function closeCategoryModal() {
  document.getElementById('categoryModal')?.classList.add('hidden');
}

async function saveCategory(event) {
  event.preventDefault();
  const id = document.getElementById('categoryEditId')?.value;
  const name = document.getElementById('categoryNameInput')?.value?.trim();

  if (!name) {
    showToast('Vui lòng nhập tên danh mục!', 'error');
    return;
  }

  const saveBtn = document.getElementById('btnSaveCategory');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.classList.add('opacity-70');
  }

  try {
    if (id) {
      await api(`/api/categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name })
      });
      showToast('Đã cập nhật danh mục thành công!', 'success');
    } else {
      await api('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      showToast('Đã thêm danh mục mới thành công!', 'success');
    }

    closeCategoryModal();
    await loadMenuDishes();
    if (typeof loadCategories === 'function') loadCategories();
    if (typeof loadProducts === 'function') loadProducts();
  } catch (err) {
    showToast('Lỗi khi lưu danh mục: ' + err.message, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.classList.remove('opacity-70');
    }
  }
}

async function deleteCategory(id, name, productCount) {
  const msg = productCount > 0 
    ? `Danh mục "${name}" hiện đang có ${productCount} món. Bạn có chắc chắn muốn xóa không?`
    : `Bạn có chắc chắn muốn xóa danh mục "${name}"?`;

  if (!confirm(msg)) return;

  try {
    await api(`/api/categories/${id}`, { method: 'DELETE' });
    showToast(`Đã xóa danh mục "${name}"`, 'success');
    await loadMenuDishes();
    if (typeof loadCategories === 'function') loadCategories();
    if (typeof loadProducts === 'function') loadProducts();
  } catch (err) {
    showToast('Lỗi khi xóa danh mục: ' + err.message, 'error');
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
// CÀI ĐẶT THÔNG TIN QUÁN (IN TRÊN PHIẾU BẾP)
// =============================================================
async function populateStoreSettings() {
  try {
    await loadSettings();
    const nameInput = document.getElementById('setting_store_name');
    if (nameInput) nameInput.value = state.settings.store_name || '';
    const addressInput = document.getElementById('setting_store_address');
    if (addressInput) addressInput.value = state.settings.store_address || '';
    const footerInput = document.getElementById('setting_receipt_footer');
    if (footerInput) footerInput.value = state.settings.receipt_footer || 'Quý khách vui lòng mang phiếu này ra quầy khi thanh toán';
  } catch (err) {
    console.error('Lỗi tải cài đặt quán:', err);
  }
}

async function saveStoreSettings(e) {
  e.preventDefault();

  try {
    const storeName = document.getElementById('setting_store_name').value.trim();
    const storeAddress = document.getElementById('setting_store_address')?.value.trim() || '';
    const footer = document.getElementById('setting_receipt_footer').value.trim();
    const payload = {
      store_name: storeName,
      store_address: storeAddress,
      receipt_footer: footer
    };

    await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    state.settings = { ...state.settings, ...payload };
    const headerEl = document.getElementById('headerStoreName');
    const drawerStoreEl = document.getElementById('drawerStoreName');
    if (headerEl) headerEl.textContent = storeName;
    if (drawerStoreEl) drawerStoreEl.textContent = storeName;
    showToast('Đã lưu thông tin quán thành công!');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Giữ alias an toàn
const populateVietQrSettings = populateStoreSettings;
const saveVietQrSettings = saveStoreSettings;

// =============================================================
// QUẢN LÝ DANH SÁCH BÀN (THÊM & XÓA BÀN PHỤC VỤ)
// =============================================================
function renderManageTablesList() {
  const container = document.getElementById('manageTablesListContainer');
  const countBadge = document.getElementById('manageTablesCount');
  if (!container) return;

  const tables = state.tableList || [];
  if (countBadge) countBadge.textContent = `${tables.length} bàn`;

  if (tables.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-6 text-slate-400 text-xs italic">
        Chưa có bàn nào trong hệ thống. Hãy nhập tên và thêm bàn ở trên!
      </div>
    `;
    return;
  }

  container.innerHTML = tables.map(tableName => {
    const hasOrder = state.tableOrders && state.tableOrders[tableName] && state.tableOrders[tableName].items?.length > 0;
    const safeName = tableName.replace(/'/g, "\\'");
    return `
      <div class="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200/90 rounded-xl hover:border-slate-300 hover:bg-white transition-all shadow-2xs group">
        <div class="flex items-center space-x-2 min-w-0 pr-1">
          <i class="fa-solid fa-chair ${hasOrder ? 'text-amber-500' : 'text-emerald-600'} text-xs shrink-0"></i>
          <span class="font-extrabold text-xs sm:text-sm text-slate-800 truncate" title="${tableName}">${tableName}</span>
          ${hasOrder ? '<span class="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded-full shrink-0">Có khách</span>' : ''}
        </div>
        <button 
          type="button" 
          onclick="confirmDeleteTable('${safeName}')" 
          class="w-7 h-7 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center shrink-0 transition-colors"
          title="Xóa bàn ${tableName}"
        >
          <i class="fa-regular fa-trash-can text-xs"></i>
        </button>
      </div>
    `;
  }).join('');
}

async function handleQuickAddTable(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('inputQuickTableName');
  const name = input ? input.value.trim() : '';
  if (!name) return;

  if (state.tableList && state.tableList.includes(name)) {
    showToast(`Bàn "${name}" đã có trong danh sách!`, 'warning');
    return;
  }

  try {
    const res = await api('/api/tables/custom', {
      method: 'POST',
      body: JSON.stringify({ table_name: name })
    });

    if (res && res.tables) {
      state.tableList = res.tables;
    } else if (!state.tableList.includes(name)) {
      state.tableList.push(name);
    }
    localStorage.setItem('pos_table_list', JSON.stringify(state.tableList));

    if (input) input.value = '';
    renderManageTablesList();
    if (typeof renderTableGrid === 'function') renderTableGrid();
    showToast(`Đã thêm bàn "${name}" thành công!`, 'success');
  } catch (err) {
    showToast('Lỗi khi thêm bàn: ' + err.message, 'error');
  }
}

async function confirmDeleteTable(tableName) {
  const hasOrder = state.tableOrders && state.tableOrders[tableName] && state.tableOrders[tableName].items?.length > 0;
  const msg = hasOrder 
    ? `CẢNH BÁO: Bàn "${tableName}" đang có khách/đang gọi món!\nBạn có chắc chắn muốn xóa bàn này khỏi danh sách không?`
    : `Bạn có chắc muốn xóa "${tableName}" khỏi danh sách bàn phục vụ?`;

  if (!confirm(msg)) return;

  try {
    const res = await api(`/api/tables/${encodeURIComponent(tableName)}`, {
      method: 'DELETE'
    });

    if (res && res.tables) {
      state.tableList = res.tables;
    } else {
      state.tableList = (state.tableList || []).filter(t => t !== tableName);
    }

    if (state.tableOrders && state.tableOrders[tableName]) {
      delete state.tableOrders[tableName];
      localStorage.setItem('pos_table_orders', JSON.stringify(state.tableOrders));
    }
    localStorage.setItem('pos_table_list', JSON.stringify(state.tableList));

    renderManageTablesList();
    if (typeof renderTableGrid === 'function') renderTableGrid();
    showToast(`Đã xóa bàn "${tableName}" thành công!`, 'success');
  } catch (err) {
    showToast('Lỗi khi xóa bàn: ' + err.message, 'error');
  }
}

function promptAddTableFromManagement() {
  const custom = prompt('Nhập tên bàn mới (VD: Bàn 13, Bàn VIP, Sân thượng...):', '');
  if (custom && custom.trim()) {
    const input = document.getElementById('inputQuickTableName');
    if (input) input.value = custom.trim();
    handleQuickAddTable();
  }
}

