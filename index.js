// server.js
const express = require('express');
const { TeeSkin6, TeeSkinEyeVariant } = require('ddnet'); // [1]

const app = express();
const port = 3000;

// Utility function to convert RGBA color components to DDNet's 32-bit integer TW color code.
// This format packs Alpha, Red, Green, and Blue values into a single unsigned integer (AARRGGBB).
// Based on DDNet C++ source color.h interpretation.[2]
function rgbToTWCode(r, g, b, a = 1.0) {
    // Ensure components are within valid byte range (0-255)
    const alphaByte = Math.round(Math.max(0, Math.min(255, a * 255)));
    const redByte = Math.round(Math.max(0, Math.min(255, r)));
    const greenByte = Math.round(Math.max(0, Math.min(255, g)));
    const blueByte = Math.round(Math.max(0, Math.min(255, b)));

    // Pack into 32-bit integer: AARRGGBB
    // JavaScript's bitwise operations treat numbers as 32-bit signed integers,
    // but the resulting integer value will be correctly interpreted by ddnet.js.
    return (alphaByte << 24) | (redByte << 16) | (greenByte << 8) | blueByte;
}

// Utility function to parse color input strings (supports hex and RGB/RGBA comma-separated strings).
// Returns an object { r, g, b, a } or null if parsing fails.
function parseColorInput(colorString) {
    if (!colorString || typeof colorString !== 'string') return null;

    colorString = colorString.trim();

    // Handle hex color (e.g., "#RRGGBB" or "#AARRGGBB")
    if (colorString.startsWith('#')) {
        const hex = colorString.substring(1);
        if (hex.length === 6 || hex.length === 8) {
            const r = parseInt(hex.substring(hex.length - 6, hex.length - 4), 16);
            const g = parseInt(hex.substring(hex.length - 4, hex.length - 2), 16);
            const b = parseInt(hex.substring(hex.length - 2, hex.length), 16);
            let a = 1.0; // Default to opaque for #RRGGBB
            if (hex.length === 8) { // If #AARRGGBB format
                a = parseInt(hex.substring(0, 2), 16) / 255.0;
            }
            if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(a)) return null;
            return { r, g, b, a };
        }
    }

    // Handle RGB/RGBA string (e.g., "255,0,0" or "255,0,0,1.0")
    const parts = colorString.split(',').map(p => parseFloat(p.trim()));
    if (parts.length >= 3 && parts.every(p => !isNaN(p))) {
        const r = parts[0]; // Fixed: was incorrectly 'parts' instead of 'parts[0]'
        const g = parts[1]; // Fixed: was incorrectly 'parts[3]' instead of 'parts[1]'
        const b = parts[2]; // Fixed: was incorrectly 'parts[4]' instead of 'parts[2]'
        const a = parts.length === 4 ? parts[3] : 1.0; // Fixed: was 'parts[5]' instead of 'parts[3]'

        // Basic validation for color component ranges
        if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255 || a < 0 || a > 1) return null;
        return { r, g, b, a };
    }

    return null; // Invalid format
}

// API endpoint for rendering DDNet skins
app.get('/render-skin', async (req, res) => {
    try {
        const {
            bodyColor,     // Optional: RGB string (e.g., "255,0,0") or hex string (e.g., "#FF0000") for body
            feetColor,     // Optional: RGB string or hex string for feet
            lookingDegree, // Optional: Angle in degrees (e.g., "0" for right, "90" for up, "180" for left)
            size,          // Optional: Desired output image size in pixels (e.g., "256")
            skinResource = 'default' // Optional: Base skin name (e.g., 'default', '10Fox'). Defaults to 'default'. [1]
        } = req.query;

        const renderOptions = {};
        const customColors = {};

        // Parse and convert body color if provided
        const parsedBodyColor = parseColorInput(bodyColor);
        if (parsedBodyColor) {
            customColors.bodyTWcode = rgbToTWCode(parsedBodyColor.r, parsedBodyColor.g, parsedBodyColor.b, parsedBodyColor.a);
        }

        // Parse and convert feet color if provided
        const parsedFeetColor = parseColorInput(feetColor);
        if (parsedFeetColor) {
            customColors.feetTWcode = rgbToTWCode(parsedFeetColor.r, parsedFeetColor.g, parsedFeetColor.b, parsedFeetColor.a);
        }

        // Important: For 0.6 skins (like those rendered by TeeSkin6), both bodyTWcode and feetTWcode
        // must be provided if any custom colors are specified.[6]
        if (Object.keys(customColors).length > 0) {
            if (customColors.bodyTWcode === undefined || customColors.feetTWcode === undefined) {
                return res.status(400).send('For 0.6 skins, both `bodyColor` and `feetColor` must be provided if custom colors are specified for either.');
            }
            renderOptions.customColors = customColors;
        }

        // Set looking degree (viewAngle) if provided and valid
        const viewAngle = parseFloat(lookingDegree);
        if (!isNaN(viewAngle)) {
            renderOptions.viewAngle = viewAngle; // [6]
        }

        // Set output image size (resolution) if provided and valid
        const imageSize = parseInt(size, 10);
        if (!isNaN(imageSize) && imageSize > 0) {
            renderOptions.size = imageSize; // [6]
        } else if (size !== undefined) { // If 'size' was provided but was not a valid positive number
            return res.status(400).send('Invalid `size` parameter. Must be a positive number.');
        }

        // Instantiate TeeSkin6 with the base skin resource [1]
        const mySkin = new TeeSkin6({ skinResource: skinResource });

        // Render the skin. This returns a Uint8Array buffer containing the PNG image data.[1]
        const renderedBuffer = await mySkin.render(renderOptions);

        // Set the Content-Type header to 'image/png' so the browser knows it's an image
        res.setHeader('Content-Type', 'image/png');
        // Send the raw image buffer as the response
        res.send(renderedBuffer);

    } catch (error) {
        console.error('Error rendering skin:', error);
        // Provide a more informative error message to the user
        res.status(500).send(`Failed to render skin: ${error.message}. Please check your input parameters and server logs.`);
    }
});

// Start the server
app.listen(port, () => {
    console.log(`DDNet Skin Renderer API listening at http://localhost:${port}`);
    console.log(`\nTo use this API, open your web browser or use a tool like curl with URLs similar to these:`);
    console.log(`\n- Example 1: Default skin, custom red body, blue feet, looking right, 256px resolution:`);
    console.log(`  http://localhost:${port}/render-skin?bodyColor=255,0,0&feetColor=0,0,255&lookingDegree=0&size=256`);
    console.log(`\n- Example 2: Default skin, custom green body (hex), orange feet (hex), looking left, 512px resolution:`);
    console.log(`  http://localhost:${port}/render-skin?bodyColor=%2300FF00&feetColor=%23FFA500&lookingDegree=180&size=512`);
    console.log(`\n- Example 3: Specific skin ('10Fox'), default colors, looking up, 128px resolution:`);
    console.log(`  http://localhost:${port}/render-skin?skinResource=10Fox&lookingDegree=90&size=128`);
    console.log(`\nRemember to run 'npm install express ddnet' if you haven't already.`);
});