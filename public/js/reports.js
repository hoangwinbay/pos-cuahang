// =============================================================
// POS ORDER - THỐNG KÊ DOANH THU (TAB 2)
// =============================================================

let revenueChartInstance = null;

// Tải số liệu thống kê doanh thu
async function loadDashboardReports() {
  try {
    const data = await api('/api/reports/dashboard');

    // Cập nhật thẻ KPI
    const revEl = document.getElementById('statTodayRevenue');
    const ordEl = document.getElementById('statTodayOrders');

    if (revEl) revEl.textContent = formatMoney(data.today.revenue);
    if (ordEl) ordEl.textContent = `${data.today.orders} đơn`;

    // Vẽ biểu đồ 7 ngày gần nhất
    renderRevenueChart(data.chart_7days);

  } catch (err) {
    console.error('Lỗi khi tải báo cáo thống kê:', err);
  }
}

// Biểu đồ cột doanh thu 7 ngày
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
