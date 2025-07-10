import { GoogleGenerativeAI } from '@google/generative-ai';
import { FilteredUrl } from './urlFilterService';
import { ShowSearchContext } from '../discovery/searchQueryBuilder';

export class LinkSelectionService {
  async selectExhibitionUrl(
    filteredUrls: FilteredUrl[],
    context: ShowSearchContext
  ): Promise<string> {
    if (filteredUrls.length === 0) {
      throw new Error('No URLs to select from');
    }

    if (filteredUrls.length === 1) {
      console.log(`🎯 Only one URL found, selecting: ${filteredUrls[0].url}`);
      return filteredUrls[0].url;
    }

    console.log(`🤖 Using Gemini to select best URL from ${filteredUrls.length} candidates...`);

    // Initialize genAI after environment is loaded (like extractFieldsGemini.ts)
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const contextHint = `Looking for exhibition: "${context.title}" by ${context.artist} at ${context.gallery} (${context.year})`;

    const urlList = filteredUrls
      .slice(0, 8) // Limit to top 8 for token efficiency
      .map((url, i) => 
        `${i + 1}. ${url.title}\n   URL: ${url.url}\n   Snippet: ${url.snippet}\n   Confidence: ${(url.confidence * 100).toFixed(0)}%`
      )
      .join('\n\n');

    const prompt = `Select the URL that most likely leads to the specific art exhibition page.
${contextHint}

Available URLs:
${urlList}

Consider:
- Exact title and artist name matches
- Gallery domain matches
- Exhibition-specific pages vs general gallery pages
- Current/ongoing exhibitions vs past exhibitions

Respond with ONLY the number (1-${Math.min(filteredUrls.length, 8)}) of the best URL for this specific exhibition.`;

    try {
      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();
      const selection = parseInt(responseText);
      
      if (selection < 1 || selection > filteredUrls.length) {
        console.warn(`⚠️ Invalid Gemini selection: ${selection}, using highest confidence URL`);
        return filteredUrls[0].url;
      }
      
      const selectedUrl = filteredUrls[selection - 1].url;
      console.log(`✅ Gemini selected URL ${selection}: ${selectedUrl}`);
      return selectedUrl;
      
    } catch (error) {
      // Fallback to highest confidence URL on any error
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`⚠️ Gemini selection failed, using highest confidence URL: ${errorMessage}`);
      return filteredUrls[0].url;
    }
  }

  // Helper method for batch URL selection (future enhancement)
  async selectMultipleUrls(
    filteredUrls: FilteredUrl[],
    context: ShowSearchContext,
    maxSelections: number = 3
  ): Promise<string[]> {
    if (filteredUrls.length <= maxSelections) {
      return filteredUrls.map(url => url.url);
    }

    // For now, just return top confidence URLs
    // Future: Use Gemini to intelligently select multiple candidates
    return filteredUrls
      .slice(0, maxSelections)
      .map(url => url.url);
  }
} 