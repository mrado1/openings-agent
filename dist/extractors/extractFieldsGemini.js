"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractShowFields = extractShowFields;
const generative_ai_1 = require("@google/generative-ai");
const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY);
async function extractShowFields(html, galleryUrl) {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Extract art show information from this HTML. Return ONLY valid JSON with these fields:
{
  "title": "exhibition title",
  "artists": ["artist1", "artist2"],
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD", 
  "press_release": "full press release text",
  "image_url": "main_image_url",
  "additional_images": ["image_url2", "image_url3"]
}

If a field cannot be found, use empty string or empty array. Ensure dates are valid ISO format.

HTML:
${html}`;
    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        // Clean JSON (remove markdown formatting)
        const jsonStr = text.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        return {
            ...parsed,
            gallery_url: galleryUrl,
            extracted_at: new Date().toISOString(),
            has_been_enriched: true,
            source_url: galleryUrl
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Gemini extraction failed: ${message}`);
    }
}
