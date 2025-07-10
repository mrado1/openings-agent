import axios from 'axios';
import * as cheerio from 'cheerio';

export async function fetchAndCleanHtml(url: string): Promise<string> {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SceneBot/1.0)'
      }
    });
    
    const $ = cheerio.load(response.data);
    
    // Remove scripts, styles, footer (keep nav for navigation in Phase 3)
    $('script, style, footer, .footer').remove();
    
    // For Phase 3 navigation, we need nav + main content
    const nav = $('nav').html() || '';
    const main = $('main').html() || $('body').html() || '';
    const combined = nav + main;
    
    return combined.slice(0, 50000); // Limit token usage
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to fetch ${url}: ${message}`);
  }
} 