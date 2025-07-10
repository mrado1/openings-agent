import { GoogleGenerativeAI } from '@google/generative-ai';
import { ShowData } from '../types/schemas';

export async function extractShowFields(html: string, galleryUrl: string): Promise<Partial<ShowData>> {
  // Initialize genAI after environment is loaded
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const model = genAI.getGenerativeModel({ model: modelName });
  
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

  let rawResponse = '';
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    rawResponse = text; // Store for error logging
    
    console.log(`📝 Gemini response length: ${text.length} characters`);
    
    // Clean JSON (remove markdown formatting)
    let jsonStr = text.replace(/```json|```/g, '').trim();
    
    // Handle potential JSON parsing issues
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```[\w]*\n?/g, '').trim();
    }
    
    console.log(`🔍 Attempting to parse JSON (${jsonStr.length} chars): ${jsonStr.substring(0, 200)}...`);
    
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
    
    // Enhanced error logging for JSON parsing issues
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      console.error('🚨 JSON Parsing Error Details:');
      console.error('Error:', error.message);
      console.error('Raw Gemini response (first 500 chars):', rawResponse.substring(0, 500));
      console.error('Response length:', rawResponse.length);
      console.error('Last 200 chars:', rawResponse.slice(-200));
    }
    
    throw new Error(`Gemini extraction failed: ${message}`);
  }
} 