const CACHE_KEY = "polyPolarCache";
const PROMPT_KEY = "polyPolarPrompt";
const VISIBILITY_KEY = "polyPolarVis";
const API_URL = "https://api.polarterminal.pro/analyze";

const DEFAULT_INSTRUCTIONAL_PROMPT = `
You are an expert prediction market analyst.
Event: "{{title}}"
Description: "{{description}}"
Current Market Odds: {{markets}}

YOUR TASK:
1. First, identify the type of question. Is it about a specific DATE, a specific NAME (winner/candidate), a specific PRICE/NUMBER, or a simple YES/NO?
2. Based on the type, provide a single, specific prediction. For a date question like "US strikes Iran by...?", your prediction should be a specific date from the options, like "January 31". For a Yes/No question, predict "Yes" or "No".
3. Provide your reasoning and analysis for the prediction.
`;

let currentTokenId = null;
let currentMarketTitle = "";
let currentTimeframe = "1d";
let visibilitySettings = {
  ai: true, chart: true, odds: true, x: true, news: true, related: true
};

let currentTabUrl = null;
let currentSlug = null;

document.addEventListener('DOMContentLoaded', async () => {
  const introView = document.getElementById('intro-view');
  const analysisView = document.getElementById('analysis-view');
  const loadingView = document.getElementById('loading-view');
  const errorBox = document.getElementById('error-box');
  const settingsModal = document.getElementById('settings-modal');

  const themeBtn = document.getElementById('themeBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const resetPromptBtn = document.getElementById('resetPromptBtn');

  const promptInput = document.getElementById('promptInput');

  const toggles = {
    ai: document.getElementById('toggleAi'),
    chart: document.getElementById('toggleChart'),
    odds: document.getElementById('toggleOdds'),
    x: document.getElementById('toggleX'),
    news: document.getElementById('toggleNews'),
    related: document.getElementById('toggleRelated')
  };

  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') document.body.setAttribute('data-theme', 'light');

  themeBtn.addEventListener('click', () => {
    if (document.body.getAttribute('data-theme') === 'light') {
      document.body.removeAttribute('data-theme');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
    }
  });
  
  refreshBtn.addEventListener('click', () => {
    if (currentSlug) {
      chrome.storage.local.remove(CACHE_KEY, () => {
        startAnalysis(currentTabUrl, currentSlug);
      });
    }
  });

  settingsBtn.addEventListener('click', () => {
    chrome.storage.local.get([PROMPT_KEY, VISIBILITY_KEY], (res) => {
      promptInput.value = res[PROMPT_KEY] || DEFAULT_INSTRUCTIONAL_PROMPT;
      const vis = res[VISIBILITY_KEY] || visibilitySettings;
      for (const key in toggles) {
        if (toggles[key]) toggles[key].checked = vis[key] !== false;
      }
      settingsModal.style.display = 'flex';
    });
  });

  resetPromptBtn.addEventListener('click', () => {
    promptInput.value = DEFAULT_INSTRUCTIONAL_PROMPT;
  });

  closeSettingsBtn.addEventListener('click', () => settingsModal.style.display = 'none');

  saveSettingsBtn.addEventListener('click', () => {
    const prompt = promptInput.value.trim();
    const newVis = {};
    for (const k in toggles) {
      newVis[k] = toggles[k].checked;
    }
    chrome.storage.local.set({
      [PROMPT_KEY]: prompt,
      [VISIBILITY_KEY]: newVis
    }, () => {
      settingsModal.style.display = 'none';
      location.reload();
    });
  });

  chrome.storage.local.get([VISIBILITY_KEY], (res) => {
    if (res[VISIBILITY_KEY]) visibilitySettings = res[VISIBILITY_KEY];
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  document.querySelectorAll('.tf-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentTimeframe = e.target.dataset.tf;
      if (currentTokenId) updateChart(currentTokenId, currentMarketTitle);
    });
  });

  document.getElementById('marketData').addEventListener('click', handleShowChartClick);

  const isPolymarket = tab.url && tab.url.includes('polymarket.com');
  currentSlug = isPolymarket ? extractSlug(tab.url) : null;
  currentTabUrl = tab.url;

  if (currentSlug) {
    introView.style.display = 'none';
    chrome.storage.local.get([CACHE_KEY], (result) => {
      const cached = result[CACHE_KEY];
      if (cached && (cached.url === tab.url || extractSlug(cached.url) === currentSlug) && (Date.now() - cached.timestamp < 300000)) {
        renderCachedData(cached);
      } else {
        startAnalysis(currentTabUrl, currentSlug);
      }
    });
  } else {
    introView.style.display = 'flex';
  }

  async function startAnalysis(url, slug) {
    chrome.storage.local.get([PROMPT_KEY], async (res) => {
      const customPrompt = res[PROMPT_KEY] || DEFAULT_INSTRUCTIONAL_PROMPT;

      showLoading(true);

      try {
        if (!slug) throw new Error("Invalid Polymarket URL");
        
        const marketData = await fetchPolymarketData(slug);
        
        if (marketData.markets.length === 0) {
            throw new Error("No active markets found for this event.");
        }

        const aiAnalysis = await fetchBackendAnalysis(marketData, customPrompt);

        const cacheData = {
          url: url,
          timestamp: Date.now(),
          marketData: marketData,
          aiAnalysis: aiAnalysis
        };

        chrome.storage.local.set({ [CACHE_KEY]: cacheData });
        renderData(marketData, aiAnalysis);
        showLoading(false);

      } catch (err) {
        showLoading(false);
        showError(err.message || "Analysis failed. Ensure server is running at localhost:8000");
      }
    });
  }

  async function fetchBackendAnalysis(marketData, instructionalPrompt) {
    const payload = {
        title: marketData.title,
        description: marketData.description,
        markets: marketData.markets.map(m => ({
            outcome: m.outcome,
            price: m.prices[0]
        })),
        prompt: instructionalPrompt 
    };

    const response = await fetch(API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Backend Error: ${errText}`);
    }

    return await response.json();
  }

  function renderCachedData(cache) {
    renderData(cache.marketData, cache.aiAnalysis);
  }

  function renderData(marketData, aiAnalysis) {
    loadingView.style.display = 'none';
    analysisView.style.display = 'block';
    errorBox.style.display = 'none';

    const setDisplay = (id, show) => {
      const el = document.getElementById(id);
      if(el) el.style.display = show ? 'block' : 'none';
    };

    setDisplay('sec-ai', visibilitySettings.ai);
    setDisplay('sec-chart', visibilitySettings.chart);
    setDisplay('sec-odds', visibilitySettings.odds);
    setDisplay('sec-x', visibilitySettings.x);
    setDisplay('sec-news', visibilitySettings.news);
    setDisplay('sec-related', visibilitySettings.related);

    renderSnapshot(marketData);
    if(visibilitySettings.ai && aiAnalysis) renderAIResults(aiAnalysis);

    if (marketData.markets && marketData.markets.length > 0) {
      const first = marketData.markets[0];
      const tokenID = first.clobTokenIds && first.clobTokenIds.length > 0 ? first.clobTokenIds[0] : first.id;
      currentTimeframe = "1d";
      if(visibilitySettings.chart) updateChart(tokenID, first.outcome);
    } else {
      renderPriceChart(null, "");
    }
  }

  function extractSlug(url) {
    try {
      const urlObj = new URL(url);
      const parts = urlObj.pathname.split('/').filter(p => p.length > 0);
      const ignore = ['profile', 'portfolio', 'leaderboard', 'rewards', 'orders', 'activity'];
      if (parts.length > 0 && ignore.includes(parts[0])) return null;

      const eventIndex = parts.indexOf('event');
      if (eventIndex !== -1 && parts[eventIndex + 1]) {
        return parts[eventIndex + 1];
      }
      return parts.length > 0 ? parts[parts.length - 1] : null;
    } catch (e) { return null; }
  }

  function safeJSONParse(str) {
    try { return typeof str === 'string' ? JSON.parse(str) : str; } catch (e) { return null; }
  }

  async function fetchPolymarketData(slug) {
    const response = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}`);
    if (!response.ok) throw new Error("Failed to fetch Polymarket data");
    const data = await response.json();
    if (!data || data.length === 0) throw new Error("Event not found");

    const event = data[0];
    let markets = event.markets || [];

    let processedMarkets = markets.map(m => {
      const prices = safeJSONParse(m.outcomePrices);
      const outcomes = safeJSONParse(m.outcomes);
      const clobTokenIds = safeJSONParse(m.clobTokenIds);
      if (!prices || !outcomes) return null;

      return {
        id: m.id,
        clobTokenIds: clobTokenIds || [],
        outcome: m.groupItemTitle || m.question || 'Winner',
        prices: prices,
        outcomes: outcomes,
        currentPrice: parseFloat(prices[0] || 0)
      };
    }).filter(m => m !== null);

    processedMarkets.sort((a, b) => b.currentPrice - a.currentPrice);
    return { title: event.title, volume: event.volume, description: event.description, markets: processedMarkets };
  }

  async function fetchPriceHistory(tokenId, timeframe) {
    const now = Math.floor(Date.now() / 1000);
    let startTs;
    let fidelity;

    switch (timeframe) {
      case '1h': startTs = now - 3600; fidelity = 1; break;
      case '1d': startTs = now - 86400; fidelity = 15; break;
      case '1w': startTs = now - 604800; fidelity = 60; break;
      case 'all': startTs = 0; fidelity = 1440; break;
      default: startTs = now - 86400; fidelity = 15;
    }

    const url = `https://clob.polymarket.com/prices-history?market=${tokenId}&startTs=${startTs}&endTs=${now}&fidelity=${fidelity}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch chart');
    const data = await response.json();
    return data.history;
  }

  function renderSnapshot(data) {
    document.getElementById('marketTitle').innerText = data.title;
    const container = document.getElementById('marketData');
    container.innerHTML = '';

    if (data.markets.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">No active markets found.</div>';
        return;
    }

    data.markets.forEach(m => {
      const div = document.createElement('div');
      div.className = 'list-item market-item-row';
      const p = (parseFloat(m.prices[0]) * 100).toFixed(1);
      const color = parseFloat(m.prices[0]) > 0.5 ? '#10b981' : (parseFloat(m.prices[0]) > 0.15 ? '#60a5fa' : '#94a3b8');
      const tokenForChart = m.clobTokenIds.length > 0 ? m.clobTokenIds[0] : m.id;

      div.dataset.tokenId = tokenForChart;
      div.dataset.marketTitle = m.outcome;

      div.innerHTML = `
        <span class="outcome-name">
          <span style="opacity:0.8">📈</span>
          <span>${m.outcome}</span>
        </span>
        <span class="outcome-percent" style="color:${color}">${p}%</span>
      `;
      container.appendChild(div);
    });
  }

  async function updateChart(tokenId, marketTitle) {
    currentTokenId = tokenId;
    currentMarketTitle = marketTitle;
    const container = document.getElementById('priceChartContainer');
    container.innerHTML = '<div style="text-align:center; padding-top:80px; color:#64748b">Loading...</div>';

    try {
      const history = await fetchPriceHistory(tokenId, currentTimeframe);
      renderPriceChart(history, marketTitle);
    } catch (err) {
      renderPriceChart(null, "");
    }
  }

  function handleShowChartClick(event) {
    const row = event.target.closest('.market-item-row');
    if (row && visibilitySettings.chart) updateChart(row.dataset.tokenId, row.dataset.marketTitle);
  }

  function renderPriceChart(history, title) {
    const container = document.getElementById('priceChartContainer');
    if (!history || history.length < 2) {
      container.innerHTML = '<div style="text-align:center; padding-top:80px; color:#64748b">No Data</div>';
      return;
    }

    const width = 340;
    const height = 160;
    const padding = 5;

    const minTime = history[0].t;
    const maxTime = history[history.length - 1].t;
    let minPrice = Math.min(...history.map(h => h.p));
    let maxPrice = Math.max(...history.map(h => h.p));

    if (maxPrice - minPrice < 0.05) { minPrice -= 0.05; maxPrice += 0.05; }

    const scaleX = t => padding + (t - minTime) / (maxTime - minTime) * (width - 2*padding);
    const scaleY = p => height - padding - ((p - minPrice) / (maxPrice - minPrice) * (height - 2*padding));

    const points = history.map(h => `${scaleX(h.t)},${scaleY(h.p)}`).join(' ');
    const areaPoints = `${points} ${width-padding},${height} ${padding},${height}`;

    const svg = `
      <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#3b82f6" stop-opacity="0.3"/>
            <stop offset="1" stop-color="#3b82f6" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <polyline points="${areaPoints}" fill="url(#g)"/>
        <polyline points="${points}" fill="none" stroke="#3b82f6" stroke-width="2"/>
      </svg>
    `;
    container.innerHTML = svg;
  }

  function renderAIResults(data) {
    const aiDiv = document.getElementById('aiOverview');
    if(!data) {
        aiDiv.innerHTML = '<div style="color:red">AI Error</div>';
        return;
    }
    aiDiv.innerHTML = `
      <div class="ai-card">
        <div class="ai-header">
          <span>AI Prediction</span>
          <span class="ai-prediction-target">${data.prediction_target} (${data.predicted_probability})</span>
        </div>
        <ul class="ai-list">
          ${data.prediction_reasons.map(r => `<li>${r}</li>`).join('')}
        </ul>
      </div>
    `;

    const relatedDiv = document.getElementById('relatedMarkets');
    relatedDiv.innerHTML = data.related_markets.map(market => `
      <a href="https://polymarket.com/markets?q=${encodeURIComponent(market.title)}" target="_blank" class="related-market-item">${market.emoji || '📈'} ${market.title}</a>
    `).join('');

    const newsDiv = document.getElementById('newsFeed');
    newsDiv.innerHTML = data.news.map(n => `
      <a href="https://google.com/search?q=${encodeURIComponent(n.title)}" target="_blank" class="list-item" style="display:block; text-decoration:none;">
        <div style="font-weight:500; color:var(--text-main); margin-bottom:4px;">${n.title}</div>
        <div style="font-size:11px; color:var(--text-muted); display:flex; justify-content:space-between;">
          <span>${n.source}</span><span>${n.time_ago}</span>
        </div>
      </a>
    `).join('');

    const xDiv = document.getElementById('xMentions');
    xDiv.innerHTML = data.x_mentions.map(x => `
      <a href="https://twitter.com/search?q=${encodeURIComponent(x.text)}" target="_blank" class="x-item">
        <div class="x-user">${x.user}</div>
        <div class="x-text">${x.text}</div>
      </a>
    `).join('');
  }

  function showLoading(show) {
    if (show) {
      document.getElementById('intro-view').style.display = 'none';
      loadingView.style.display = 'block';
      analysisView.style.display = 'none';
      errorBox.style.display = 'none';
    } else {
      loadingView.style.display = 'none';
    }
  }

  function showError(msg) {
    loadingView.style.display = 'none';
    introView.style.display = 'none';
    analysisView.style.display = 'none';
    errorBox.innerText = msg;
    errorBox.style.display = 'block';
  }
});

