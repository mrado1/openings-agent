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
    
    // Remove only scripts and styles, keep all content
    $('script, style').remove();
    
    // Get the full body content to ensure we don't miss anything
    const fullContent = $('body').html() || response.data;
    
    // Return full content - let AI models handle the context window
    return fullContent;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to fetch ${url}: ${message}`);
  }
} 