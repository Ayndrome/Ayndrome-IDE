// npm install @mendable/firecrawl-js
import Firecrawl from '@mendable/firecrawl-js';

const app = new Firecrawl({ apiKey: "fc-e0b7fa277bf747d79e9d4317a4a6e400"  });

// Scrape a website:
app.scrape('firecrawl.dev')