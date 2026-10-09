// Reports & Dashboard Analytics Logic

let revenueChartInstance = null;
let paymentMethodChartInstance = null;

// Load dashboard reports data
async function loadDashboardReports() {
  try {
    const data = await api('/api/reports/dashboard');

    // Update KPI Cards
    document.getElementById('statTodayRevenue').textContent = formatMoney(data.today.revenue);
    document.getElementById('statTodayOrders').textContent = data.today.orders;
    document.getElementById('statTodayProfit').textContent = formatMoney(data.today.profit);
    document.getElementById('statTodayItemsSold').textContent = data.today.items_sold;
    document.getElementById('statTotalProducts').textContent = data.overall.total_products;
    document.getElementById('statLowStockCount').textContent = data.overall.low_stock_count;

    // Render 7-day revenue chart
    renderRevenueChart(data.chart_7days);

    // Render payment methods doughnut chart
    renderPaymentMethodChart(data.payment_methods);

    // Render Top Products Table
    renderTopProductsTable(data.top_products);

  } catch (err) {
    showToast('Lỗi khi tải dữ liệu báo cáo thống kê', 'error');
  }
}

// Render 7-Day Revenue Bar Chart
function renderRevenueChart(chartData) {
  const ctx = document.getElementById('revenueChart');
  if (!ctx) return;

  if (revenueChartInstance) {
    revenueChartInstance.destroy();
  }

  const labels = (chartData || []).map(item => {
    const parts = item.date.split('-');
    return `${parts[2]}/${parts[1]}`;
  });

  const revenues = (chartData || []).map(item => item.revenue);

  revenueChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Doanh thu (₫)',
        data: revenues,
        backgroundColor: 'rgba(37, 99, 235, 0.85)',
        hoverBackgroundColor: 'rgba(29, 78, 216, 1)',
        borderRadius: 8,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return 'Doanh thu: ' + formatMoney(context.parsed.y);
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(val) {
              if (val >= 1000000) return (val / 1000000) + ' Tr';
              if (val >= 1000) return (val / 1000) + ' k';
              return val;
            }
          },
          grid: { color: 'rgba(226, 232, 240, 0.6)' }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });
}

// Render Payment Methods Doughnut Chart
function renderPaymentMethodChart(paymentData) {
  const ctx = document.getElementById('paymentMethodChart');
  const summaryEl = document.getElementById('paymentMethodsSummary');
  if (!ctx) return;

  if (paymentMethodChartInstance) {
    paymentMethodChartInstance.destroy();
  }

  let cashCount = 0;
  let qrCount = 0;
  let cashTotal = 0;
  let qrTotal = 0;

  (paymentData || []).forEach(p => {
    if (p.payment_method === 'vietqr') {
      qrCount = p.count;
      qrTotal = p.total_amount;
    } else {
      cashCount = p.count;
      cashTotal = p.total_amount;
    }
  });

  const totalOrders = cashCount + qrCount;

  paymentMethodChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Tiền mặt', 'VietQR'],
      datasets: [{
        data: totalOrders === 0 ? [1, 0] : [cashCount, qrCount],
        backgroundColor: ['#f59e0b', '#2563eb'],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, font: { size: 11 } }
        }
      }
    }
  });

  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="flex justify-between text-slate-600">
        <span class="flex items-center"><span class="w-2.5 h-2.5 rounded-full bg-amber-500 mr-1.5"></span>Tiền mặt:</span>
        <span class="font-bold text-slate-800">${cashCount} đơn (${formatMoney(cashTotal)})</span>
      </div>
      <div class="flex justify-between text-slate-600">
        <span class="flex items-center"><span class="w-2.5 h-2.5 rounded-full bg-blue-600 mr-1.5"></span>VietQR:</span>
        <span class="font-bold text-slate-800">${qrCount} đơn (${formatMoney(qrTotal)})</span>
      </div>
    `;
  }
}

// Render Top 5 Products Table
function renderTopProductsTable(topProducts) {
  const tbody = document.getElementById('topProductsTableBody');
  if (!tbody) return;

  if (!topProducts || topProducts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-6 text-slate-400 text-xs">
          Chưa có đơn hàng nào được ghi nhận
        </td>
      </tr>
    `;
    return;
  }

  const medals = ['🥇', '🥈', '🥉', '4', '5'];

  tbody.innerHTML = topProducts.map((p, idx) => `
    <tr class="hover:bg-slate-50 transition-colors">
      <td class="px-3 py-2.5 text-center font-bold text-slate-600">${medals[idx] || (idx + 1)}</td>
      <td class="px-3 py-2.5 font-bold text-slate-800">${p.product_name}</td>
      <td class="px-3 py-2.5 text-center font-semibold text-slate-700">${p.total_qty}</td>
      <td class="px-3 py-2.5 text-right font-black text-blue-600">${formatMoney(p.total_amount)}</td>
    </tr>
  `).join('');
}
