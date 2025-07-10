import { GoogleGenerativeAI } from '@google/generative-ai';
import { ShowData } from '../types/schemas';

export async function extractShowFields(html: string, galleryUrl: string): Promise<Partial<ShowData>> {
  // Initialize genAI after environment is loaded
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  
  const prompt = `You are an expert art gallery website parser. Extract exhibition information from this HTML with high precision.

CRITICAL INSTRUCTIONS:
1. DATES: Look for exhibition dates, opening/closing dates, duration. Common formats: "May 7 - August 15, 2025", "Through August 15", "On view until...", "May 7, 2025 - Aug 15, 2025"
2. PRESS RELEASE: Find the main exhibition description/statement, NOT gallery navigation or contact info. Look for artist statement, curatorial text, or exhibition overview.
3. IMAGES: Extract high-resolution artwork images, prefer .jpg, .png, .webp formats
4. ARTISTS: Full names, handle multiple artists

Return ONLY valid JSON with these exact fields:
{
  "title": "exact exhibition title",
  "artists": ["Artist Full Name"],
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD", 
  "press_release": "main exhibition description or artist statement - NOT navigation text",
  "image_url": "primary_artwork_image_url",
  "additional_images": ["secondary_image_url1", "secondary_image_url2"]
}

IMPORTANT: 
- For dates: Convert any date format to YYYY-MM-DD (e.g. "May 7, 2025" → "2025-05-07")
- For press release: Focus on artistic content, skip gallery hours/contact info
- Use empty string "" if field cannot be found (never null)
- Ensure all URLs are complete and valid

HTML CONTENT:
${html}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    // Clean JSON (remove markdown formatting)
    let jsonStr = text.replace(/```json|```/g, '').trim();
    
    // Handle potential JSON parsing issues
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
    throw new Error(`Gemini extraction failed: ${message}`);
  }
} 