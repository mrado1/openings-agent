import OpenAI from 'openai';
import { ShowData } from '../types/schemas';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function extractShowFieldsOpenAI(html: string, galleryUrl: string): Promise<Partial<ShowData>> {
  const prompt = `You are an expert at extracting structured data from art gallery websites. Parse this HTML and extract exhibition information with high accuracy.

EXTRACTION RULES:
1. DATES: Find exhibition dates in any format (e.g., "May 7 - August 15, 2025", "Through Aug 15", "On view until...") and convert to YYYY-MM-DD
2. PRESS RELEASE: Extract the main exhibition text/description - focus on artistic content, not gallery info or navigation
3. IMAGES: Find high-quality artwork images (prefer .jpg, .png, .webp), avoid logos/navigation icons
4. TITLE: Exact exhibition title as displayed
5. ARTISTS: Complete artist names (first and last)

Return valid JSON only:
{
  "title": "exact exhibition title",
  "artists": ["Artist Name"],
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "press_release": "main exhibition description - artistic content only",
  "image_url": "primary artwork image URL",
  "additional_images": ["image2", "image3"]
}

IMPORTANT:
- Convert dates to ISO format: "May 7, 2025" → "2025-05-07"
- Empty string "" for missing fields (never null/undefined)
- Validate all URLs are complete and accessible
- Focus on artistic content for press release, skip contact/hours info

HTML:
${html}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert data extraction assistant specializing in art gallery websites. Return only valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1, // Low temperature for consistent extraction
      max_tokens: 25000,
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      throw new Error('No response from OpenAI');
    }

    // Clean JSON formatting
    let jsonStr = text.replace(/```json|```/g, '').trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```[\w]*\n?/g, '').trim();
    }

    const parsed = JSON.parse(jsonStr);

    return {
      ...parsed,
      gallery_url: galleryUrl,
      extracted_at: new Date().toISOString(),
      has_been_enriched: true,
      source_url: galleryUrl
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`OpenAI extraction failed: ${message}`);
  }
} 