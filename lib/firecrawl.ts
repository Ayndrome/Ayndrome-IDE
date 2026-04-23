// npm install @mendable/firecrawl-js
import Firecrawl from "@mendable/firecrawl-js";

const apiKey = process.env.FIRECRAWL;

const app = new Firecrawl({ apiKey });

// Scrape a website:
app.scrape("firecrawl.dev");
