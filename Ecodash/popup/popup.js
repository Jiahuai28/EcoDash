const SERVICE_DATA = {
  YOUTUBE: { name: 'YouTube', color: '#FF0000' },
  NETFLIX: { name: 'Netflix', color: '#E50914' },
  TWITCH: { name: 'Twitch', color: '#9146FF' },
  DISNEY_PLUS: { name: 'Disney+', color: '#113CCF' },
  SPOTIFY: { name: 'Spotify', color: '#1DB954' },
  APPLE_MUSIC: { name: 'Apple Music', color: '#FC3C44' },
  TIKTOK: { name: 'TikTok', color: '#010101' },
  INSTAGRAM: { name: 'Instagram', color: '#E4405F' },
  VIDEO_CALL: { name: 'Video Calls', color: '#0078D7' },
  GENERAL: { name: 'Other', color: '#6C757D' }
};

let currentChart = null;

document.addEventListener('DOMContentLoaded', async () => {
  const loadingEl = document.getElementById('loading');
  const contentEl = document.getElementById('content');
  
  try {
    // Load data
    const data = await new Promise(resolve => 
      chrome.storage.local.get(['totalCO2', 'services', 'daily', 'weekly', 'aiTips'], resolve)
    );
    
    // Initial render
    updateCounter(data.totalCO2 || 0);
    renderPeriod('today');
    updateAITips(data.aiTips);
    
    // Period switching
    document.querySelectorAll('.period-selector button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.period-selector button').forEach(b => 
          b.classList.remove('active')
        );
        btn.classList.add('active');
        renderPeriod(btn.dataset.period);
      });
    });
    
    // Show UI
    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';
    
    // Listen for updates
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.totalCO2) updateCounter(changes.totalCO2.newValue);
      if (changes.services || changes.daily || changes.weekly) {
        const period = document.querySelector('.period-selector button.active').dataset.period;
        renderPeriod(period);
      }
      if (changes.aiTips) {
        updateAITips(changes.aiTips.newValue);
      }
    });
    
  } catch (error) {
    loadingEl.innerHTML = `
      <div style="text-align: center; color: var(--danger); padding: 20px;">
        Failed to load. Please refresh.
      </div>
    `;
    console.error('Popup error:', error);
  }
});

function updateCounter(co2) {
  const counter = document.getElementById('co2-counter');
  counter.textContent = `${co2.toFixed(1)}g`;
  counter.style.color = co2 > 100 ? 'var(--danger)' : 
                       co2 > 50 ? 'var(--warning)' : 'var(--primary)';
}

async function renderPeriod(period) {
  const data = await new Promise(resolve => 
    chrome.storage.local.get(['services', 'daily', 'weekly'], resolve)
  );
  
  let dataset;
  if (period === 'week') {
    const currentWeek = getCurrentWeek();
    dataset = data.weekly?.[currentWeek] || data.services || {};
  } else {
    const today = new Date().toISOString().split('T')[0];
    dataset = data.daily?.[today] || data.services || {};
  }
  
  renderChart(dataset);
  renderPercentageList(dataset);
}

function getCurrentWeek() {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
  return weekStart.toISOString().split('T')[0];
}

function renderChart(data) {
  const ctx = document.getElementById('co2-chart').getContext('2d');
  const filteredData = Object.entries(data).filter(([_, item]) => item.co2 > 0);
  const sortedEntries = filteredData.sort((a, b) => b[1].co2 - a[1].co2);
  const totalCO2 = sortedEntries.reduce((sum, [_, item]) => sum + item.co2, 0);

  if (currentChart) currentChart.destroy();

  currentChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: sortedEntries.map(([key]) => {
        const service = SERVICE_DATA[key] || { name: key };
        const percentage = totalCO2 > 0 
          ? Math.round((data[key].co2 / totalCO2 * 100)) 
          : 0;
        return `${service.name} ${percentage}%`;
      }),
      datasets: [{
        data: sortedEntries.map(([, item]) => item.co2),
        backgroundColor: sortedEntries.map(([key]) => SERVICE_DATA[key]?.color || '#6C757D'),
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            boxWidth: 12,
            padding: 16,
            font: {
              size: 12
            },
            generateLabels: (chart) => {
              const data = chart.data;
              return data.labels.map((label, i) => ({
                text: label,
                fillStyle: data.datasets[0].backgroundColor[i],
                hidden: false,
                index: i
              }));
            }
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = context.label || '';
              const value = context.raw || 0;
              const percentage = context.percent || 0;
              return `${label.split(' ')[0]}: ${value.toFixed(1)}g (${percentage.toFixed(1)}%)`;
            }
          }
        }
      }
    }
  });
}

function renderPercentageList(data) {
  const filteredData = Object.entries(data).filter(([_, item]) => item.co2 > 0);
  const sortedEntries = filteredData.sort((a, b) => b[1].co2 - a[1].co2);
  const total = sortedEntries.reduce((sum, [_, item]) => sum + item.co2, 0);
  const container = document.getElementById('percentage-list');
  
  container.innerHTML = sortedEntries
    .map(([key, item]) => {
      const service = SERVICE_DATA[key] || { name: key, color: '#6C757D' };
      const percent = total > 0 ? Math.round((item.co2 / total) * 100) : 0;
      
      return `
        <div class="percentage-item">
          <span>${service.name}</span>
          <div class="percentage-bar-container">
            <div class="percentage-bar" style="width: ${percent}%; background: ${service.color}"></div>
          </div>
          <span class="percentage-value">${percent}%</span>
        </div>
      `;
    })
    .join('');
}

function updateAITips(tips) {
  const tipsEl = document.getElementById('ai-tips');
  tipsEl.textContent = tips || "Loading recommendations...";
}