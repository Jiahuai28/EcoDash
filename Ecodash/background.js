// Service CO₂ Rates (g/min)
const CO2_RATES = {
  // Video
  YOUTUBE: 0.9,      // 55g/hr
  NETFLIX: 0.9,      // 55g/hr  
  TWITCH: 0.85,      // 51g/hr
  DISNEY_PLUS: 0.95, // 57g/hr
  
  // Music
  SPOTIFY: 0.025,    // 1.5g/hr
  APPLE_MUSIC: 0.03, // 1.8g/hr
  
  // Social
  TIKTOK: 0.7,       // 42g/hr
  INSTAGRAM: 0.45,   // 27g/hr
  
  // Defaults
  VIDEO_CALL: 1.2,   // 72g/hr
  GENERAL: 0.0033    // 0.2g/hr
};

let activeSessions = {};

// Initialize
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    totalCO2: 0,
    services: {},
    daily: {},
    weekly: {}
  });
  setupAlarms();
});

// Alarms
function setupAlarms() {
  chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive') {
      chrome.storage.local.get(['totalCO2'], () => {});
    }
  });
}

// Tab Tracking
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, trackTab);
});

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status === 'complete') trackTab(tab);
});

function trackTab(tab) {
  if (!tab?.url) return;
  
  const now = Date.now();
  const service = detectService(tab.url);
  
  // End other sessions
  Object.entries(activeSessions).forEach(([key, session]) => {
    if (key !== service) {
      saveSession(key, now - session.lastActive);
      delete activeSessions[key];
    }
  });
  
  // Start/continue current
  activeSessions[service] = activeSessions[service] || { startTime: now };
  activeSessions[service].lastActive = now;
}

function saveSession(service, durationMs) {
  const minutes = durationMs / 60000;
  const co2 = minutes * (CO2_RATES[service] || CO2_RATES.GENERAL);
  const { day, week } = getTimePeriods();
  
  chrome.storage.local.get(['totalCO2', 'services', 'daily', 'weekly'], (data) => {
    const services = { ...data.services };
    const daily = { ...data.daily };
    const weekly = { ...data.weekly };
    
    // Update services
    services[service] = {
      minutes: (services[service]?.minutes || 0) + minutes,
      co2: (services[service]?.co2 || 0) + co2
    };
    
    // Update daily
    daily[day] = daily[day] || {};
    daily[day][service] = {
      minutes: (daily[day][service]?.minutes || 0) + minutes,
      co2: (daily[day][service]?.co2 || 0) + co2
    };
    
    // Update weekly
    weekly[week] = weekly[week] || {};
    weekly[week][service] = {
      minutes: (weekly[week][service]?.minutes || 0) + minutes,
      co2: (weekly[week][service]?.co2 || 0) + co2
    };
    
    chrome.storage.local.set({
      totalCO2: (data.totalCO2 || 0) + co2,
      services,
      daily,
      weekly
    });
  });
}

function detectService(url) {
  const domainMap = {
    'youtube.com': 'YOUTUBE',
    'netflix.com': 'NETFLIX',
    'twitch.tv': 'TWITCH',
    'disneyplus.com': 'DISNEY_PLUS',
    'spotify.com': 'SPOTIFY',
    'music.apple.com': 'APPLE_MUSIC',
    'tiktok.com': 'TIKTOK',
    'instagram.com': 'INSTAGRAM',
    'zoom.us': 'VIDEO_CALL',
    'meet.google.com': 'VIDEO_CALL'
  };
  
  try {
    const domain = new URL(url).hostname;
    return Object.entries(domainMap).find(([d]) => domain.includes(d))?.[1] || 'GENERAL';
  } catch {
    return 'GENERAL';
  }
}

function getTimePeriods() {
  const now = new Date();
  return {
    day: now.toISOString().split('T')[0],
    week: `${now.getFullYear()}-W${Math.floor(now.getDate() / 7) + 1}`
  };
}