require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware to handle JSON data with increased limit for base64 images
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Load and parse Israeli products from JSON
const productsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'products.json'), 'utf-8'));
const israeliProducts = productsData.products
  .map(item => item.toLowerCase().trim())
  .filter(item => item && 
    item !== 'boycott products' && 
    item !== 'israel & alternate products' &&
    item !== '');

// Helper functions for image processing and validation
function getImageData(base64String) {
  // Remove data URL prefix if present
  const base64Data = base64String.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
  return base64Data;
}

function validateImageQuality(base64Data) {
  // Check if image data is of sufficient length (minimum size)
  if (base64Data.length < 1000) {
    throw new Error('Image quality too low - please provide a clearer image');
  }
  return true;
}

function parseAnalysisWithConfidence(analysis) {
  const lines = analysis.split('\n');
  let brand = 'Unknown';
  let product = 'Unknown';
  let isIsraeliProduct = false;

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('brand/company name:')) {
      // Extract only the brand name and remove any confidence indicators or extra text
      brand = line.split(':')[1].trim()
        .replace(/\b(clearly visible|definitely|uncertain|appears to be|possibly|likely|seems to be)\b/gi, '')
        .replace(/\([^)]*\)/g, '') // Remove text in parentheses
        .trim();
    } else if (lowerLine.includes('product/service:')) {
      // Extract only the product name and remove any confidence indicators or extra text
      product = line.split(':')[1].trim()
        .replace(/\b(clearly visible|definitely|uncertain|appears to be|possibly|likely|seems to be)\b/gi, '')
        .replace(/\([^)]*\)/g, '') // Remove text in parentheses
        .trim();
    }
  }

  // Convert brand and product to lowercase for case-insensitive comparison
  const lowerBrand = brand.toLowerCase();
  const lowerProduct = product.toLowerCase();

  // Function to check if a string contains any Israeli product name
  const containsIsraeliProduct = (text) => {
    return israeliProducts.some(item => {
      if (!item) return false;
      const pattern = new RegExp(`\\b${item}\\b`, 'i');
      return pattern.test(text);
    });
  };

  isIsraeliProduct = containsIsraeliProduct(lowerBrand) || containsIsraeliProduct(lowerProduct);

  return { brand, product, isIsraeliProduct };
}

// Endpoint to analyze product image
app.post('/api/analyze-product', async (req, res) => {
  try {
    const { imageData } = req.body;
    if (!imageData) {
      return res.status(400).json({ success: false, error: 'No image data provided' });
    }

    // Get base64 image data
    const base64Data = getImageData(imageData);

    // Initialize the model with the newer version
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Prepare the prompt
    const prompt = `Analyze the provided image to identify any visible brand names or product names, also identify if its a compnay or any other scervice that could be online or offline identify by logo for favicon. Focus on extracting text and logos that clearly indicate the brand or product. Provide the Brand/Company Name and Product/Service if visible. Use terms like 'clearly visible', 'definitely', or 'uncertain' to describe your confidence level in the identification.`;

    
    // Validate image data
    if (!base64Data) {
      return res.status(400).json({
        success: false,
        error: 'Invalid image data. Please provide a valid image.'
      });
    }

    // Validate image quality
    validateImageQuality(base64Data);

    // Generate content with enhanced prompt
    const result = await model.generateContent([
      prompt + " Please be very specific about your confidence level in the identification. Use terms like 'clearly visible', 'definitely', or 'uncertain' in your response.",
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Data
        }
      }
    ]);

    if (!result || !result.response) {
      throw new Error('Failed to get response from Gemini API');
    }

    const response = await result.response;
    const analysis = response.text();

    if (!analysis) {
      throw new Error('Empty analysis received from Gemini API');
    }

    console.log('Raw API response:', analysis);

    // Parse the analysis with confidence level and check for Israeli products
    const { brand, product, confidence, isIsraeliProduct } = parseAnalysisWithConfidence(analysis);

    res.json({
      success: true,
      analysis: {
        brand,
        product,
        isIsraeliProduct
      }
    });

  } catch (error) {
    console.error('Error analyzing image:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze image. Please try again.'
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});