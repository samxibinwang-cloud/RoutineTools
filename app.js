/**
 * 城市时间与天气查询
 * 使用 Open-Meteo API（免费，无需 API Key）
 */

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

// WMO 天气代码中文描述
const WEATHER_CODES = {
  0: '晴',
  1: '大部晴朗',
  2: '局部多云',
  3: '多云',
  45: '雾',
  48: '雾凇',
  51: '毛毛雨',
  53: '毛毛雨',
  55: '毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '冻雨',
  67: '冻雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '雪粒',
  80: '阵雨',
  81: '阵雨',
  82: '暴雨',
  85: '阵雪',
  86: '阵雪',
  95: '雷暴',
  96: '雷暴伴小冰雹',
  99: '雷暴伴大冰雹',
};

// DOM 元素
const cityInput = document.getElementById('city-input');
const cityDropdown = document.getElementById('city-dropdown');
const results = document.getElementById('results');
const loading = document.getElementById('loading');
const errorEl = document.getElementById('error');
const searchHint = document.getElementById('search-hint');
const timeDisplay = document.getElementById('time-display');
const timezoneInfo = document.getElementById('timezone-info');
const currentWeather = document.getElementById('current-weather');
const forecastList = document.getElementById('forecast-list');

let debounceTimer = null;
let selectedIndex = -1;
let cityResults = [];

// 防抖搜索
cityInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const query = cityInput.value.trim();

  if (query.length < 2) {
    hideDropdown();
    searchHint.textContent = '输入至少 2 个字符开始搜索';
    return;
  }

  searchHint.textContent = '搜索中...';
  debounceTimer = setTimeout(() => searchCities(query), 300);
});

cityInput.addEventListener('focus', () => {
  if (cityResults.length > 0 && cityInput.value.trim().length >= 2) {
    showDropdown(cityResults);
  }
});

// 键盘导航
cityInput.addEventListener('keydown', (e) => {
  if (!cityDropdown.hasAttribute('aria-hidden')) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, cityResults.length - 1);
      updateDropdownSelection();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      updateDropdownSelection();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && cityResults[selectedIndex]) {
        selectCity(cityResults[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      hideDropdown();
    }
  }
});

// 点击外部关闭下拉
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-box')) {
    hideDropdown();
  }
});

async function searchCities(query) {
  try {
    const url = `${GEOCODING_URL}?name=${encodeURIComponent(query)}&count=10&language=zh`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) throw new Error('搜索失败');
    if (!data.results || data.results.length === 0) {
      searchHint.textContent = '未找到匹配的城市';
      cityResults = [];
      hideDropdown();
      return;
    }

    cityResults = data.results;
    searchHint.textContent = `找到 ${cityResults.length} 个结果，点击或回车选择`;
    showDropdown(cityResults);
    selectedIndex = 0;
    updateDropdownSelection();
  } catch (err) {
    searchHint.textContent = '搜索出错，请检查网络';
    cityResults = [];
    hideDropdown();
  }
}

function showDropdown(cities) {
  cityDropdown.innerHTML = cities
    .map(
      (c, i) => `
    <li data-index="${i}" role="option" aria-selected="${i === selectedIndex}">
      <span class="city-name">${escapeHtml(c.name)}</span>
      <span class="city-detail">${escapeHtml(c.country || '')}${c.admin1 ? ', ' + escapeHtml(c.admin1) : ''}</span>
    </li>
  `
    )
    .join('');
  cityDropdown.removeAttribute('aria-hidden');

  cityDropdown.querySelectorAll('li').forEach((li, i) => {
    li.addEventListener('click', () => selectCity(cities[i]));
  });
}

function updateDropdownSelection() {
  cityDropdown.querySelectorAll('li').forEach((li, i) => {
    li.setAttribute('aria-selected', i === selectedIndex);
    li.classList.toggle('selected', i === selectedIndex);
    if (i === selectedIndex) {
      li.scrollIntoView({ block: 'nearest' });
    }
  });
}

function hideDropdown() {
  cityDropdown.innerHTML = '';
  cityDropdown.setAttribute('aria-hidden', 'true');
  selectedIndex = -1;
}

function selectCity(city) {
  cityInput.value = `${city.name}${city.admin1 ? ', ' + city.admin1 : ''} (${city.country || ''})`;
  hideDropdown();
  searchHint.textContent = '正在加载...';
  loadWeatherAndTime(city);
}

async function loadWeatherAndTime(city) {
  showLoading();
  hideError();
  results.hidden = true;

  try {
    const params = new URLSearchParams({
      latitude: city.latitude,
      longitude: city.longitude,
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
      daily: 'temperature_2m_max,temperature_2m_min,weather_code',
      timezone: 'auto',
      forecast_days: 7,
    });

    const res = await fetch(`${WEATHER_URL}?${params}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.reason || '获取天气失败');

    renderTime(data, city);
    renderCurrentWeather(data);
    renderForecast(data);

    results.hidden = false;
    searchHint.textContent = `已显示 ${city.name} 的天气，可继续搜索其他城市`;
  } catch (err) {
    showError(err.message || '加载失败，请重试');
    searchHint.textContent = '输入城市名称搜索';
  } finally {
    hideLoading();
  }
}

function renderTime(data, city) {
  const tz = data.timezone || 'UTC';
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: tz,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  timeDisplay.textContent = formatter.format(now);
  timezoneInfo.textContent = `${dateFormatter.format(now)} · ${tz}`;

  // 每秒更新
  clearInterval(window._timeInterval);
  window._timeInterval = setInterval(() => {
    timeDisplay.textContent = formatter.format(new Date());
  }, 1000);
}

function renderCurrentWeather(data) {
  const c = data.current;
  const code = c.weather_code;
  const desc = WEATHER_CODES[code] || '未知';

  currentWeather.innerHTML = `
    <div>
      <div class="temp-main">${Math.round(c.temperature_2m)}<sup>°C</sup></div>
      <div class="desc">${desc}</div>
      <div class="details">
        <span>体感 ${Math.round(c.apparent_temperature)}°C</span>
        <span>湿度 ${c.relative_humidity_2m}%</span>
        <span>风速 ${c.wind_speed_10m} km/h</span>
      </div>
    </div>
  `;
}

function renderForecast(data) {
  const daily = data.daily;
  const tz = data.timezone || 'UTC';
  const dayFormatter = new Intl.DateTimeFormat('zh-CN', { timeZone: tz, weekday: 'short' });
  const dateFormatter = new Intl.DateTimeFormat('zh-CN', { timeZone: tz, month: 'short', day: 'numeric' });

  forecastList.innerHTML = daily.time
    .map((dateStr, i) => {
      const date = new Date(dateStr);
      const dayName = dayFormatter.format(date);
      const dateStrFormatted = dateFormatter.format(date);
      const tempMax = daily.temperature_2m_max[i];
      const tempMin = daily.temperature_2m_min[i];
      const code = daily.weather_code[i];
      const desc = WEATHER_CODES[code] || '未知';

      return `
        <div class="forecast-item">
          <div>
            <div class="day">${dayName}</div>
            <div class="date">${dateStrFormatted}</div>
          </div>
          <div class="weather-desc">${desc}</div>
          <div class="temps">
            <span class="temp-max">${Math.round(tempMax)}°</span>
            <span class="temp-min">${Math.round(tempMin)}°</span>
          </div>
        </div>
      `;
    })
    .join('');
}

function showLoading() {
  loading.hidden = false;
}

function hideLoading() {
  loading.hidden = true;
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

function hideError() {
  errorEl.hidden = true;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
