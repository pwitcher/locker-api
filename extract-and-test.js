const fs = require('fs');
const path = require('path');

// Path to your new Starlight quickstart doc
const markdownPath = path.join(__dirname, 'portal', 'src', 'content', 'docs', 'quickstart.md');
const outputPath = path.join(__dirname, 'temp-tested-sample.js');

try {
  const content = fs.readFileSync(markdownPath, 'utf8');

  // Regex to capture the content inside the javascript code block
  const regex = /```javascript([\s\S]*?)```/;
  const match = content.match(regex);

  if (!match || !match[1]) {
    console.error('Error: Could not find JavaScript code block in quickstart.md');
    process.exit(1);
  }

  // Write the clean, isolated JavaScript code out to a temporary file
  const codeSnippet = match[1].trim();
  fs.writeFileSync(outputPath, codeSnippet, 'utf8');
  console.log('Successfully extracted code snippet from Markdown.');

} catch (err) {
  console.error(`Extraction failed: ${err.message}`);
  process.exit(1);
}
