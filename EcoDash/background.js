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

const GROQ_API_KEY = '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'; // Replace with actual key
const AI_CONFIG = {
  MODEL: 'llama-3.3-70b-versatile',
  TEMPERATURE: 0.8,
  MAX_TOKENS: 400,
  RESPONSE_STYLE: `Provide 3 diverse optimization strategies formatted as:
"- [Action] (X% savings): [Explanation]"
Guidelines:
1. Include technical, behavioral and scheduling optimizations
2. Never suggest "reduce usage" as primary strategy  
3. Focus on optimization techniques
4. Include estimated savings percentages
5. Keep explanations under 15 words
Example: 
"- Enable audio-only mode (75% savings): Eliminates video processing overhead"`
};

let activeSessions = {};

// Initialize
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    totalCO2: 0,
    services: {},
    daily: {},
    weekly: {},
    aiTips: "Analyzing your usage patterns..."
  });
  setupAlarms();
});

// Alarms
function setupAlarms() {
  chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
  chrome.alarms.create('weeklyAnalysis', { 
    delayInMinutes: 0.5,    // First run after 30 seconds
    periodInMinutes: 0.5     // Repeat every 30 seconds (for testing)
  });

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'weeklyAnalysis') await generateAITips();
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

// Data Handling
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

// AI Integration
async function generateAITips() {
  try {
    const { services } = await new Promise(resolve =>
      chrome.storage.local.get('services', resolve)
    );

    const tips = await getGroqResponse(
      `Suggest optimizations for: ${JSON.stringify(services)}. Provide diverse strategies including:
1. Quality adjustments
2. Usage timing  
3. Alternative methods
Avoid simple "reduce usage" suggestions.`
    );
    chrome.storage.local.set({ aiTips: tips });
  } catch (error) {
    console.error("AI analysis failed:", error);
    chrome.storage.local.set({
      aiTips: "- Enable YouTube 'Data Saver' (65% savings): Auto-lowers video quality\n- Pre-load Netflix on WiFi (30% savings): Avoids mobile data costs\n- Use TikTok 'Data Usage' setting (20% savings): Limits background loading"
    });
  }
}

async function getGroqResponse(prompt) {
  try {
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
            role: 'system',
            content: AI_CONFIG.RESPONSE_STYLE
          },
          {
            role: 'user', 
            content: prompt
          }
        ],
        temperature: AI_CONFIG.TEMPERATURE,
        max_tokens: AI_CONFIG.MAX_TOKENS,
        stream: false
      })
    });

    if (!response.ok) throw new Error(`API ${response.status}`);
    
    const data = await response.json();
    return data.choices[0]?.message?.content || "No tips available";
  } catch (error) {
    console.error("Groq API error:", error);
    throw error;
  }
}

// Debug
async function testAITips() {
  const mockData = {
    YOUTUBE: { minutes: 120, co2: 108 },
    NETFLIX: { minutes: 45, co2: 40.5 }
  };
  
  const tips = await getGroqResponse(
    `Suggest optimizations for: ${JSON.stringify(mockData)}`
  );
  console.log("AI Test Output:\n", tips);
}