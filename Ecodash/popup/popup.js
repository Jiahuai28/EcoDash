// Service Metadata
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
  GENERAL: { name: 'General Browsing', color: '#6C757D' }
};

let currentChart = null;
let chartAvailable = false;

// 1. First define all helper functions
function updateCounter(co2) {
  const counter = document.getElementById('co2-counter');
  counter.textContent = `${co2.toFixed(1)}g`;
  counter.style.color = co2 > 100 ? 'var(--danger)' : 
                       co2 > 50 ? 'var(--warning)' : 'var(--primary)';
}

function renderPeriod(period) {
  chrome.storage.local.get(['services', 'daily', 'weekly'], (data) => {
    const dataset = period === 'week' 
      ? data.weekly?.[getCurrentWeek()] || data.services || {}
      : data.daily?.[new Date().toISOString().split('T')[0]] || data.services || {};
    
    renderChart(dataset);
    renderPercentageList(dataset);
  });
}

function renderChart(data) {
  if (!chartAvailable) return;

  const ctx = document.getElementById('co2-chart');
  const sortedEntries = Object.entries(data).sort((a, b) => b[1].co2 - a[1].co2);

  if (currentChart) currentChart.destroy();

  try {
    currentChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: sortedEntries.map(([key]) => SERVICE_DATA[key]?.name || key),
        datasets: [{
          data: sortedEntries.map(([, item]) => item.co2),
          backgroundColor: sortedEntries.map(([key]) => SERVICE_DATA[key]?.color || '#6C757D'),
          borderWidth: 0
        }]
      },
      options: { /* ... keep your existing chart options ... */ }
    });
  } catch (error) {
    console.error('Chart error:', error);
    showChartFallback();
  }
}

function renderPercentageList(data) {
  const total = Object.values(data).reduce((sum, item) => sum + item.co2, 0);
  const container = document.getElementById('percentage-list');
  
  container.innerHTML = Object.entries(data)
    .sort((a, b) => b[1].co2 - a[1].co2)
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

function getCurrentWeek() {
  const now = new Date();
  return `${now.getFullYear()}-W${Math.floor(now.getDate() / 7) + 1}`;
}

function showChartFallback() {
  document.getElementById('co2-chart').style.display = 'none';
  document.getElementById('chart-fallback').style.display = 'block';
}

// 2. Then initialize the extension
function initExtension() {
  chrome.storage.local.get(['totalCO2', 'services', 'daily', 'weekly'], (data) => {
    try {
      updateCounter(data.totalCO2 || 0);
      renderPeriod('today');
      
      document.querySelectorAll('.period-selector button').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.period-selector button').forEach(b => 
            b.classList.remove('active')
          );
          btn.classList.add('active');
          renderPeriod(btn.dataset.period);
        });
      });
      
      document.getElementById('loading').style.display = 'none';
      document.getElementById('content').style.display = 'block';
    } catch (error) {
      console.error('Init error:', error);
      document.getElementById('loading').innerHTML = `
        <div style="color: var(--danger); padding: 20px; text-align: center;">
          Initialization failed. Please refresh.
        </div>
      `;
    }
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.totalCO2) updateCounter(changes.totalCO2.newValue);
    if (changes.services || changes.daily || changes.weekly) {
      const period = document.querySelector('.period-selector button.active')?.dataset.period || 'today';
      renderPeriod(period);
    }
  });
}

// 3. Finally, check Chart.js and start
document.addEventListener('DOMContentLoaded', () => {
  chartAvailable = typeof Chart !== 'undefined';
  if (!chartAvailable) showChartFallback();
  
  initExtension();
});