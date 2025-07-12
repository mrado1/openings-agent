import { GoogleGenerativeAI } from '@google/generative-ai';

export class SummaryGenerationService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    this.model = this.genAI.getGenerativeModel({ model: modelName });
  }

  /**
   * Generate a 3-sentence summary from press release content
   * Optimized for mobile app display
   */
  async generateSummary(pressRelease: string, showTitle?: string, artistName?: string): Promise<string> {
    if (!pressRelease || pressRelease.trim().length === 0) {
      return 'No summary available';
    }

    const contextHint = showTitle && artistName 
      ? `This is about the exhibition "${showTitle}" by ${artistName}. ` 
      : '';

    const prompt = `${contextHint}Create a concise 3-sentence summary of this art exhibition based on the press release.

Guidelines:
- Exactly 3 sentences
- Avoid gallery contact info, dates, or administrative details
- Focus on artistic content and significance
- Write for art enthusiasts who want to understand the exhibition quickly
- If the press release contains only artist names, locations, or insufficient content for a meaningful summary, respond with exactly: "No summary available"

Press Release Text:
${pressRelease}

Summary:`;

    try {
      const result = await this.model.generateContent(prompt);
      const summary = result.response.text().trim();
      
      // Handle case where Gemini determines insufficient content
      if (summary.toLowerCase().includes('no summary available') || 
          summary.toLowerCase().includes('not enough information') ||
          summary.toLowerCase().includes('insufficient information')) {
        console.log('ℹ️ Gemini determined insufficient content for meaningful summary');
        return 'No summary available';
      }
      
      // Clean and validate the summary
      const sentences = summary.split(/[.!?]+/).filter((s: string) => s.trim().length > 10);
      
      if (sentences.length < 3) {
        console.warn('⚠️ Generated summary has fewer than 3 sentences, using as-is');
        return summary;
      }
      
      // Take first 3 sentences and ensure proper punctuation
      const threeSentences = sentences.slice(0, 3)
        .map((s: string) => s.trim())
        .join('. ') + '.';
      
      // Allow full 3-sentence summaries (removed aggressive mobile truncation)
      // 3 sentences are naturally mobile-friendly without character limits
      
      console.log(`✅ Generated summary: ${threeSentences.length} characters, ${sentences.length} sentences`);
      return threeSentences;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`💥 Summary generation failed: ${errorMessage}`);
      throw new Error(`Summary generation failed: ${errorMessage}`);
    }
  }

  /**
   * Batch generate summaries for multiple shows
   */
  async generateSummaries(shows: Array<{pressRelease: string, title?: string, artist?: string}>): Promise<string[]> {
    const summaries: string[] = [];
    
    for (let i = 0; i < shows.length; i++) {
      const show = shows[i];
      console.log(`📝 Generating summary ${i + 1}/${shows.length}: ${show.title || 'Untitled'}`);
      
      try {
        const summary = await this.generateSummary(show.pressRelease, show.title, show.artist);
        summaries.push(summary);
      } catch (error) {
        console.error(`❌ Failed to generate summary for show ${i + 1}: ${error}`);
        summaries.push(''); // Empty string for failed summaries
      }
      
      // Rate limiting - wait between requests
      if (i < shows.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return summaries;
  }
}

/**
 * Convenience function for single summary generation
 */
export async function generateShowSummary(pressRelease: string, showTitle?: string, artistName?: string): Promise<string> {
  const service = new SummaryGenerationService();
  return service.generateSummary(pressRelease, showTitle, artistName);
} 