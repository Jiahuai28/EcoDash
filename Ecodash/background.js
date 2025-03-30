// Config
const CO2_RATES = {
  YOUTUBE: 0.9,
  NETFLIX: 0.9,
  TWITCH: 0.85,
  DISNEY_PLUS: 0.95,
  SPOTIFY: 0.025,
  APPLE_MUSIC: 0.03,
  TIKTOK: 0.7,
  INSTAGRAM: 0.45,
  VIDEO_CALL: 1.2,
  GENERAL: 0.0033
};

const GROQ_API_KEY = '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';
const AI_CONFIG = {
  MODEL: 'deepseek-r1-distill-llama-70b',
  TEMPERATURE: 0.7,
  MAX_TOKENS: 350
};

let activeSessions = {};

// Initialize
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    totalCO2: 0,
    services: {},
    daily: {},
    weekly: {},
    aiTips: "Analyzing your digital habits...",
    lastAnalysis: ""
  });
  setupAlarms();
});

// Alarms
function setupAlarms() {
  chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
  chrome.alarms.create('weeklyAnalysis', { 
    delayInMinutes: 0.5,
    periodInMinutes: 10080
  });
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'weeklyAnalysis') await generateAITips();
  });
}

// Tab Tracking (unchanged)
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
  
  Object.entries(activeSessions).forEach(([key, session]) => {
    if (key !== service) {
      saveSession(key, now - session.lastActive);
      delete activeSessions[key];
    }
  });
  
  activeSessions[service] = activeSessions[service] || { startTime: now };
  activeSessions[service].lastActive = now;
}

// Service Detection (unchanged)
function detectService(url) {
  try {
    const hostname = new URL(url).hostname;
    if (hostname.includes('youtube.com')) return 'YOUTUBE';
    if (hostname.includes('netflix.com')) return 'NETFLIX';
    if (hostname.includes('twitch.tv')) return 'TWITCH';
    if (hostname.includes('disneyplus.com')) return 'DISNEY_PLUS';
    if (hostname.includes('spotify.com')) return 'SPOTIFY';
    if (hostname.includes('apple.com/music')) return 'APPLE_MUSIC';
    if (hostname.includes('tiktok.com')) return 'TIKTOK';
    if (hostname.includes('instagram.com')) return 'INSTAGRAM';
    if (hostname.includes('zoom.us') || hostname.includes('meet.google.com') || hostname.includes('teams.microsoft.com')) 
      return 'VIDEO_CALL';
    return 'GENERAL';
  } catch (e) {
    return 'GENERAL';
  }
}

// Data Handling (unchanged)
function getTimePeriods() {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
  return {
    day: now.toISOString().split('T')[0],
    week: weekStart.toISOString().split('T')[0]
  };
}

function saveSession(service, durationMs) {
  const minutes = durationMs / 60000;
  const co2 = minutes * (CO2_RATES[service] || CO2_RATES.GENERAL);
  const { day, week } = getTimePeriods();

  chrome.storage.local.get(['totalCO2', 'services', 'daily', 'weekly'], (data) => {
    const update = {
      totalCO2: (data.totalCO2 || 0) + co2,
      services: { ...data.services },
      daily: { ...data.daily },
      weekly: { ...data.weekly }
    };

    update.services[service] = {
      minutes: (update.services[service]?.minutes || 0) + minutes,
      co2: (update.services[service]?.co2 || 0) + co2
    };

    update.daily[day] = update.daily[day] || {};
    update.daily[day][service] = {
      minutes: (update.daily[day][service]?.minutes || 0) + minutes,
      co2: (update.daily[day][service]?.co2 || 0) + co2
    };

    update.weekly[week] = update.weekly[week] || {};
    update.weekly[week][service] = {
      minutes: (update.weekly[week][service]?.minutes || 0) + minutes,
      co2: (update.weekly[week][service]?.co2 || 0) + co2
    };

    chrome.storage.local.set(update);
  });
}

// AI Pipeline
async function generateAITips() {
  try {
    const { services } = await new Promise(resolve =>
      chrome.storage.local.get('services', resolve)
    );

    console.log('[AI] Starting analysis pipeline...');
    const fullAnalysis = await getGroqAnalysis(services);
    const actionableTips = await convertToActionableSteps(fullAnalysis);
    
    await chrome.storage.local.set({ 
      aiTips: actionableTips,
      lastAnalysis: fullAnalysis
    });
    console.log('[AI] Updated recommendations');
  } catch (error) {
    console.error("AI pipeline failed:", error);
    await chrome.storage.local.set({
      aiTips: "1. Enable data saver mode\n2. Close unused streaming tabs\n3. Schedule large downloads overnight"
    });
  }
}

async function getGroqAnalysis(services) {
  console.log('[AI] Requesting technical analysis...');
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: AI_CONFIG.MODEL,
      messages: [
        {
          role: "system",
          content: `Analyze these digital usage patterns in detail. Consider:
          - Energy consumption hotspots
          - Data transmission efficiency
          - Behavioral trends
          - Technical optimization opportunities`
        },
        {
          role: "user",
          content: `Usage data: ${JSON.stringify(services)}`
        }
      ],
      temperature: AI_CONFIG.TEMPERATURE,
      max_tokens: AI_CONFIG.MAX_TOKENS,
      stream: false
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Analysis failed: ${error.error?.message || response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content;
}

async function convertToActionableSteps(analysis) {
  console.log('[AI] Converting analysis to action steps...');
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: AI_CONFIG.MODEL,
      messages: [
        {
          role: "system",
          content: `Convert this technical analysis into 3-5 clear action steps. Format each as:
          "[Priority]. [Action] - [Rationale]"
          Where:
          - Priority = 1 (highest) to 5
          - Action = Specific user behavior change
          - Rationale = Brief technical justification (1 sentence)`
        },
        {
          role: "user",
          content: analysis
        }
      ],
      temperature: 0.5, // More deterministic for actions
      max_tokens: 300,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`Action conversion failed: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content;
}

// Debug
async function testPipeline() {
  const testData = {
    YOUTUBE: { minutes: 145, co2: 130.5 },
    SPOTIFY: { minutes: 320, co2: 8 },
    VIDEO_CALL: { minutes: 180, co2: 216 }
  };
  
  console.log("Running test pipeline...");
  const analysis = await getGroqAnalysis(testData);
  console.log("Technical Analysis:", analysis);
  
  const actions = await convertToActionableSteps(analysis);
  console.log("Actionable Steps:", actions);
  
  return { analysis, actions };
}