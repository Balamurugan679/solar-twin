const apiKey = '13851dc74c8944a58e0b7209d4154320'; // NewsData.io API key

async function fetchNews(topic, elementId) {
  try {
    const encodedTopic = encodeURIComponent(topic);
    const url = `https://newsdata.io/api/1/latest?apikey=${apiKey}&q=${encodedTopic}`;
    const response = await fetch(url);
    const data = await response.json();
    displayNews(data.results, elementId);
  } catch (error) {
    console.error(`Error fetching ${topic} news:`, error);
  }
}

function displayNews(articles, elementId) {
  const newsPanel = document.getElementById(elementId);
  if (articles && articles.length > 0) {
    articles.forEach(article => {
      const articleDiv = document.createElement('div');
      articleDiv.className = 'news-article';
      articleDiv.innerHTML = `
        <h3><a href="${article.link}" target="_blank">${article.title}</a></h3>
        <p>${article.description || article.content || ''}</p>
        <small>Source: ${article.source_id} | Published: ${new Date(article.pubDate).toLocaleDateString()}</small>
      `;
      newsPanel.appendChild(articleDiv);
    });
  } else {
    newsPanel.innerHTML = '<p>No news found on this topic.</p>';
  }
}

// Fetch news for specific topics
fetchNews('weather forecast OR meteorology', 'weather-news');
fetchNews('gemology OR gemstones OR diamonds', 'gemology-news');
